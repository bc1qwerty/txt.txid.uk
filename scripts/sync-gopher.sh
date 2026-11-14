#!/bin/bash
# Sync dist-gopher/ to the Gopher host (Oracle VPS).
# gophernicus reads from /var/gopher/. Files owned by _gophernicus user.
set -e

DIST="$(dirname "$0")/../dist-gopher"

if [ ! -d "$DIST" ]; then
  echo "error: $DIST does not exist — run build:gopher first"
  exit 1
fi

# 실행마다 다른 스테이지를 쓴다 — 고정 경로면 news·learn 배포가 겹칠 때 한쪽의 --delete 가
# 다른 쪽이 반쯤 채운 스테이지를 기준으로 돈다.
VPS_STAGE="$(ssh vps 'mktemp -d /tmp/gopher-stage.XXXXXX')"
case "$VPS_STAGE" in /tmp/gopher-stage.*) ;; *) echo "error: bad stage path: $VPS_STAGE"; exit 1 ;; esac
# 중간에 실패해도(로컬 rsync 등) VPS 의 스테이지를 남기지 않는다.
trap 'ssh vps "rm -rf ${VPS_STAGE}" 2>/dev/null || true' EXIT

echo "[gopher-sync] rsync dist-gopher/ -> vps:${VPS_STAGE}/"
rsync -a --delete "${DIST}/" "vps:${VPS_STAGE}/"

echo "[gopher-sync] move stage -> /var/gopher/ (sudo)"
ssh vps "sudo rsync -a --delete --chown=_gophernicus:_gophernicus ${VPS_STAGE}/ /var/gopher/; rc=\$?; sudo rm -rf ${VPS_STAGE}; exit \$rc"

echo "[gopher-sync] done"
