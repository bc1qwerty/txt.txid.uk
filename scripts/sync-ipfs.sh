#!/bin/bash
# Sync dist/ to the IPFS host (Oracle VPS) and publish to IPNS.
# Stable URL is the IPNS name; CID changes each content update but IPNS pointer stays.
set -e

DIST="$(dirname "$0")/../dist"
VPS_STAGE="/tmp/ipfs-stage"
IPNS_NAME="k51qzi5uqu5djaf06lbcq4kmw5hzrhkhrvpuqvpynq0jlgeic8kq1mzmt0mhb2"

if [ ! -d "$DIST" ]; then
  echo "error: $DIST does not exist — run build first"
  exit 1
fi

echo "[ipfs-sync] rsync dist/ -> vps:${VPS_STAGE}/"
rsync -a --delete "${DIST}/" "vps:${VPS_STAGE}/"

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
