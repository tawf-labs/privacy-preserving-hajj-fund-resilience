#!/usr/bin/env bash
# Seeds Barretenberg's CRS cache (~/.bb-crs or $CRS_PATH) from the Aztec Ignition
# ceremony transcript on S3.
#
# bb.js normally downloads the CRS on first use from crs.aztec-cdn.foundation /
# crs.aztec-labs.com. Run this when those hosts are unreachable (restricted CI,
# sandboxes, air-gapped TEEs). The files are the same Ignition points bb uses:
#   bn254_g1.dat  64-byte uncompressed G1 points (2^20 points, enough for 2^17 gates + headroom)
#   bn254_g2.dat  the single 128-byte G2 point
set -euo pipefail

CRS_DIR="${CRS_PATH:-$HOME/.bb-crs}"
POINTS="${CRS_POINTS:-1048576}"
BASE="https://aztec-ignition.s3.amazonaws.com/MAIN%20IGNITION/flat"

mkdir -p "$CRS_DIR"
G1="$CRS_DIR/bn254_g1.dat"
G2="$CRS_DIR/bn254_g2.dat"
want=$((POINTS * 64))

if [[ -f "$G1" && $(stat -c %s "$G1") -ge $want && -f "$G2" && $(stat -c %s "$G2") -eq 128 ]]; then
  echo "CRS already present in $CRS_DIR ($(( $(stat -c %s "$G1") / 64 )) points)"
  exit 0
fi

echo "Downloading $POINTS G1 points into $CRS_DIR ..."
curl -fsSL -r "0-$((want - 1))" -o "$G1.tmp" "$BASE/g1.dat"
curl -fsSL -o "$G2.tmp" "$BASE/g2.dat"
[[ $(stat -c %s "$G1.tmp") -eq $want ]] || { echo "short G1 download" >&2; exit 1; }
[[ $(stat -c %s "$G2.tmp") -eq 128 ]] || { echo "bad G2 download" >&2; exit 1; }
mv "$G1.tmp" "$G1"
mv "$G2.tmp" "$G2"
echo "CRS ready: $CRS_DIR"
