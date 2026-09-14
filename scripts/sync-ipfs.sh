#!/bin/bash
# Sync dist/ to the IPFS host (Oracle VPS) and publish to IPNS.
# Stable URL is the IPNS name; CID changes each content update but IPNS pointer stays.
set -e

DIST="$(dirname "$0")/../dist"
DIST_GEMINI="$(dirname "$0")/../dist-gemini"
DIST_GOPHER="$(dirname "$0")/../dist-gopher"
VPS_STAGE="/tmp/ipfs-stage"
IPNS_NAME="k51qzi5uqu5djaf06lbcq4kmw5hzrhkhrvpuqvpynq0jlgeic8kq1mzmt0mhb2"

if [ ! -d "$DIST" ]; then
  echo "error: $DIST does not exist — run build first"
  exit 1
fi

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
fi
echo "$PUBLISH_OUT" | tail -2

echo "[ipfs-sync] pin replica on Dell (fetches from VPS peer, best-effort)"
ssh swd@dell "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs timeout 180 ipfs pin add -r ${CID}" 2>&1 | tail -2 || echo "  (dell pin failed — not fatal, VPS is still source of truth)"

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
