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

echo "[ipfs-sync] publish IPNS (background — offline OK)"
ssh vps "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs ipfs name publish --allow-offline /ipfs/${CID}" 2>&1 | tail -2

echo "[ipfs-sync] pin replica on Dell (fetches from VPS peer, best-effort)"
ssh swd@dell "sudo -u ipfs IPFS_PATH=/var/lib/ipfs/.ipfs timeout 180 ipfs pin add -r ${CID}" 2>&1 | tail -2 || echo "  (dell pin failed — not fatal, VPS is still source of truth)"

echo "[ipfs-sync] done"
echo "  CID:  ${CID}"
echo "  IPNS: ${IPNS_NAME}"
echo "  Gateway: https://ipfs.io/ipns/${IPNS_NAME}/"
