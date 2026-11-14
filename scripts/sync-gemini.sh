#!/bin/bash
# Sync dist-gemini/ to the Gemini host (Oracle VPS) running molly-brown.
# Called from `npm run deploy` pipeline after wrangler uploads dist/.
set -e

DIST_GEMINI="$(dirname "$0")/../dist-gemini"

if [ ! -d "$DIST_GEMINI" ]; then
  echo "error: $DIST_GEMINI does not exist — run build:gemini first"
  exit 1
fi

# 실행마다 다른 스테이지를 쓴다(sync-gopher.sh 와 같은 이유).
VPS_STAGE="$(ssh vps 'mktemp -d /tmp/gemini-stage.XXXXXX')"
case "$VPS_STAGE" in /tmp/gemini-stage.*) ;; *) echo "error: bad stage path: $VPS_STAGE"; exit 1 ;; esac
# 중간에 실패해도(로컬 rsync 등) VPS 의 스테이지를 남기지 않는다.
trap 'ssh vps "rm -rf ${VPS_STAGE}" 2>/dev/null || true' EXIT

echo "[gemini-sync] rsync stage -> vps:${VPS_STAGE}/"
rsync -a --delete "${DIST_GEMINI}/" "vps:${VPS_STAGE}/"

echo "[gemini-sync] move stage -> /var/lib/molly-brown/ (sudo)"
ssh vps "sudo rsync -a --delete ${VPS_STAGE}/ /var/lib/molly-brown/ && sudo chmod -R a+rX /var/lib/molly-brown; rc=\$?; rm -rf ${VPS_STAGE}; exit \$rc"

echo "[gemini-sync] done"
