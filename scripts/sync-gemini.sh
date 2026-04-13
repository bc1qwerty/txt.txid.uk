#!/bin/bash
# Sync dist-gemini/ to the Gemini host (Oracle VPS) running molly-brown.
# Called from `npm run deploy` pipeline after wrangler uploads dist/.
set -e

DIST_GEMINI="$(dirname "$0")/../dist-gemini"

if [ ! -d "$DIST_GEMINI" ]; then
  echo "error: $DIST_GEMINI does not exist — run build:gemini first"
  exit 1
fi

echo "[gemini-sync] rsync stage -> vps:/tmp/gemini-stage/"
rsync -a --delete "${DIST_GEMINI}/" vps:/tmp/gemini-stage/

echo "[gemini-sync] move stage -> /var/lib/molly-brown/ (sudo)"
ssh vps 'sudo rsync -a --delete /tmp/gemini-stage/ /var/lib/molly-brown/ && sudo chmod -R a+rX /var/lib/molly-brown && rm -rf /tmp/gemini-stage'

echo "[gemini-sync] done"
