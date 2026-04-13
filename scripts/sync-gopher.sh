#!/bin/bash
# Sync dist-gopher/ to the Gopher host (Oracle VPS).
# gophernicus reads from /var/gopher/. Files owned by _gophernicus user.
set -e

DIST="$(dirname "$0")/../dist-gopher"
VPS_STAGE="/tmp/gopher-stage"

if [ ! -d "$DIST" ]; then
  echo "error: $DIST does not exist â run build:gopher first"
  exit 1
fi

echo "[gopher-sync] rsync dist-gopher/ -> vps:${VPS_STAGE}/"
rsync -a --delete "${DIST}/" "vps:${VPS_STAGE}/"

echo "[gopher-sync] move stage -> /var/gopher/ (sudo)"
ssh vps "sudo rsync -a --delete --chown=_gophernicus:_gophernicus ${VPS_STAGE}/ /var/gopher/ && sudo rm -rf ${VPS_STAGE}"

echo "[gopher-sync] done"
