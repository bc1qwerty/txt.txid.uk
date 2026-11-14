#!/bin/bash
# Sync dist/ to the IPFS host (Oracle VPS) and publish to IPNS.
# Stable URL is the IPNS name; CID changes each content update but IPNS pointer stays.
set -e

DIST="$(dirname "$0")/../dist"
DIST_GEMINI="$(dirname "$0")/../dist-gemini"
DIST_GOPHER="$(dirname "$0")/../dist-gopher"
IPNS_NAME="k51qzi5uqu5djaf06lbcq4kmw5hzrhkhrvpuqvpynq0jlgeic8kq1mzmt0mhb2"

if [ ! -d "$DIST" ]; then
  echo "error: $DIST does not exist — run build first"
  exit 1
fi

# news·learn 배포가 겹치면 두 실행이 같은 PREV_CID 를 읽어, 먼저 게시된 쪽의 루트가 영구히 핀으로 남았다
# (2026-11-14 감사). 이 맥에서 한 번에 하나만 돌게 줄 세운다 — 죽은 실행의 잠금은 pid 로 알아보고 치운다.
# 대기 상한은 앞 실행이 가장 오래 걸리는 경우(ipfs add·rsync 몇 분 + 핀 180초 + repo gc 600초)보다 길게 — 25분.
# 죽은 잠금을 치울 때는 치우는 쪽끼리 `.reap` 으로 줄 세우고, 그 안에서 pid 가 아까 본 그대로일 때만 지운다
# (읽고 지우는 사이에 다른 대기자가 먼저 치우고 새로 잡은 산 잠금을 지우지 않게).
LOCK="${TMPDIR:-/tmp}/txt-ipfs-sync.lock"
for _ in $(seq 1 750); do
  if mkdir "$LOCK" 2>/dev/null; then echo $$ > "$LOCK/pid"; break; fi
  holder=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
    if mkdir "$LOCK.reap" 2>/dev/null; then
      [ "$(cat "$LOCK/pid" 2>/dev/null || true)" = "$holder" ] && rm -rf "$LOCK"
      rmdir "$LOCK.reap"
      continue
    fi
    # 치우던 쪽이 죽어 `.reap` 만 남았으면 1분 뒤 치운다.
    [ -n "$(find "$LOCK.reap" -maxdepth 0 -mmin +1 2>/dev/null)" ] && rmdir "$LOCK.reap" 2>/dev/null
  fi
  sleep 2
done
[ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ] || { echo "error: $LOCK 를 25분 넘게 다른 실행이 쥐고 있다"; exit 1; }

# 스테이지도 실행마다 따로 — 고정 경로면 겹친 실행의 rsync --delete·rm -rf 가 서로의 ipfs add 도중에 끼어든다.
VPS_STAGE="$(ssh vps 'mktemp -d /tmp/ipfs-stage.XXXXXX')"
case "$VPS_STAGE" in /tmp/ipfs-stage.*) ;; *) echo "error: bad stage path: $VPS_STAGE"; rm -rf "$LOCK"; exit 1 ;; esac
trap 'ssh vps "rm -rf ${VPS_STAGE}" 2>/dev/null; rm -rf "$LOCK"' EXIT

echo "[ipfs-sync] rsync dist/ -> vps:${VPS_STAGE}/ (HTML at root)"
rsync -a --delete --exclude='gemini/' --exclude='gopher/' "${DIST}/" "vps:${VPS_STAGE}/"

if [ -d "$DIST_GEMINI" ]; then
  echo "[ipfs-sync] rsync dist-gemini/ -> vps:${VPS_STAGE}/gemini/ (gemtext under /gemini/)"
  rsync -a --delete "${DIST_GEMINI}/" "vps:${VPS_STAGE}/gemini/"
else
  echo "[ipfs-sync] dist-gemini/ not found — skipping gemtext pin"
fi

if [ -d "$DIST_GOPHER" ]; then
  echo "[ipfs-sync] rsync dist-gopher/ -> vps:${VPS_STAGE}/gopher/ (plain text under /gopher/)"
  rsync -a --delete "${DIST_GOPHER}/" "vps:${VPS_STAGE}/gopher/"
else
  echo "[ipfs-sync] dist-gopher/ not found — skipping gopher pin"
fi

echo "[ipfs-sync] ipfs add -rQ (quiet)"
CID=$(ssh vps "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs ipfs add -rQ ${VPS_STAGE}")
echo "[ipfs-sync] CID=${CID}"

echo "[ipfs-sync] clean stage"
ssh vps "rm -rf ${VPS_STAGE}"

# 이전 루트 CID — publish 성공 후 unpin 한다. 안 하면 배포마다 새 루트가 핀돼
# VPS 저장소가 단조 증가한다(dell 의 ipfs-mirror-sync.sh 와 동형 정리).
PREV_CID=$(ssh vps "cat ~/.txt-ipfs-root 2>/dev/null || true")

echo "[ipfs-sync] publish IPNS (background — offline OK)"
if PUBLISH_OUT=$(ssh vps "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs ipfs name publish --allow-offline /ipfs/${CID}" 2>&1); then
  PUBLISHED=1
else
  PUBLISHED=0
  echo "  (publish failed — keeping previous pin so IPNS keeps resolving)"
  # 게시되지 않은 새 루트는 어디에도 기록되지 않는다 — 핀으로 남기면 다음 정리에서도 빠져 저장소만 늘어난다.
  if [ "$CID" != "$PREV_CID" ]; then
    ssh vps "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs ipfs pin rm ${CID}" 2>&1 | tail -1 || echo "  (pin rm of unpublished root failed — not fatal)"
  fi
fi
echo "$PUBLISH_OUT" | tail -2

if [ "$PUBLISHED" = "1" ]; then
  echo "[ipfs-sync] pin replica on Dell (fetches from VPS peer, best-effort)"
  ssh swd@dell "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs timeout 180 ipfs pin add -r ${CID}" 2>&1 | tail -2 || echo "  (dell pin failed — not fatal, VPS is still source of truth)"
fi

if [ "$PUBLISHED" = "1" ]; then
  ssh vps "echo ${CID} > ~/.txt-ipfs-root"
  if [ -n "$PREV_CID" ] && [ "$PREV_CID" != "$CID" ]; then
    echo "[ipfs-sync] unpin previous root ${PREV_CID} + repo gc"
    ssh vps "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs ipfs pin rm ${PREV_CID}" 2>&1 | tail -1 || echo "  (pin rm failed — not fatal)"
    ssh vps "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs timeout 600 ipfs repo gc >/dev/null" || echo "  (repo gc failed — not fatal)"
  fi
fi

echo "[ipfs-sync] done"
echo "  CID:  ${CID}"
echo "  IPNS: ${IPNS_NAME}"
echo "  Gateway: https://ipfs.io/ipns/${IPNS_NAME}/"

# 게시가 실패했으면 성공으로 끝내지 않는다 — 배포 알림이 «성공» 으로 나가면 IPNS 가 옛 내용을 가리키는 줄 모른다.
if [ "$PUBLISHED" != "1" ]; then
  echo "error: IPNS publish failed — IPNS still points at the previous root (${PREV_CID:-none})"
  exit 1
fi
