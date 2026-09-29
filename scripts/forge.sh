#!/usr/bin/env bash
# Runs forge for ./contracts. Uses a native `forge` + `solc` when available; otherwise
# falls back to the npm-distributed forge (@foundry-rs/forge) with solc-js 0.8.31 via
# scripts/solc-shim.cjs (for sandboxes where GitHub/solc release downloads are blocked).
#
#   bash scripts/forge.sh test -vv
#   bash scripts/forge.sh test --gas-report
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"
[ -d lib/openzeppelin-contracts ] || bash "$ROOT/scripts/install-contract-deps.sh"

SUB="$1"; shift
if command -v forge >/dev/null 2>&1 && [ -z "${HAJJ_FORCE_NPM_FORGE:-}" ] && command -v solc >/dev/null 2>&1; then
  exec forge "$SUB" "$@"
fi

FORGE_BIN="$(find "$ROOT/node_modules/.pnpm" -path '*forge-linux-amd64*/bin/forge' -type f 2>/dev/null | head -1)"
[ -n "$FORGE_BIN" ] || FORGE_BIN="$(command -v forge)"
SOLC_WRAP="$ROOT/scripts/solc-shim.sh"
exec "$FORGE_BIN" "$SUB" --use "$SOLC_WRAP" "$@"
