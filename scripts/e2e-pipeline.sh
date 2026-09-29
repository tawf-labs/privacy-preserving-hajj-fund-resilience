#!/usr/bin/env bash
# ============================================================================
# End-to-end pipeline: Layers 1-4 + evaluation, in the style of zkt-research's e2e-pipeline.sh.
#
#   bash scripts/e2e-pipeline.sh           # everything except the ~1 min evaluation
#   bash scripts/e2e-pipeline.sh --eval    # also regenerate evaluation/results/*
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WITH_EVAL=0
[[ "${1:-}" == "--eval" ]] && WITH_EVAL=1

PASS=0
FAIL=0
FAILED=()

header() { echo ""; echo "═══════════════════════════════════════"; echo "═══ $1"; echo "═══════════════════════════════════════"; echo ""; }

run_step() {
  local name="$1"; shift
  echo "--- $name ---"
  if "$@" 2>&1 | grep -v -E "^Generated proof|Compiling at|^Dependencies:|^Adding source"; [[ ${PIPESTATUS[0]} -eq 0 ]]; then
    echo "  >>> PASS: $name"; PASS=$((PASS + 1))
  else
    echo "  >>> FAIL: $name"; FAIL=$((FAIL + 1)); FAILED+=("$name")
  fi
  echo ""
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ZK Hajj Fund Resilience: End-to-End Pipeline                ║"
echo "╚══════════════════════════════════════════════════════════════╝"

header "Step 0: Toolchain and public parameters"
run_step "Install workspace dependencies" pnpm install --frozen-lockfile
run_step "Seed Barretenberg SRS cache" bash scripts/setup-crs.sh

header "Step 1: Layer 1, deterministic solvency model"
run_step "Model unit tests (regimes, rounding, bounds)" pnpm --filter @hajj-zk/solvency-model test

header "Step 2: Layer 3, Noir circuit"
run_step "Compile circuit (noir_wasm)" pnpm --filter @hajj-zk/prover compile
run_step "Circuit tests: completeness, soundness, 500-case differential fuzz" pnpm --filter @hajj-zk/prover test
run_step "Prove synthetic strained fund" pnpm --filter @hajj-zk/prover prove --state strained --out /tmp/hajj-e2e-proof.json
run_step "Verify proof bundle (bb.js)" pnpm --filter @hajj-zk/prover verify --proof /tmp/hajj-e2e-proof.json

header "Step 3: Layer 2, attestation service"
run_step "Attestor tests: source authentication, signature binding, HTTP API" pnpm --filter @hajj-zk/attestor test

header "Step 4: Layer 4, contracts"
run_step "Export Solidity verifier (must be reproducible)" pnpm --filter @hajj-zk/prover export-verifier
run_step "Foundry tests with real UltraHONK proofs" bash scripts/forge.sh test -vv

header "Step 5: Layer 4, public verification portal"
run_step "Portal unit tests" pnpm --filter @hajj-zk/portal test
run_step "Portal typecheck + production build" pnpm --filter @hajj-zk/portal build

header "Step 6: Evaluation"
run_step "Evaluation unit tests" pnpm --filter @hajj-zk/evaluation test
if [[ $WITH_EVAL -eq 1 ]]; then
  run_step "Stress test + benchmark + DER" pnpm eval
else
  echo "(skipped: pass --eval to regenerate evaluation/results)"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
printf "║  E2E Pipeline Complete   Passed: %-3s |  Failed: %-3s          ║\n" "$PASS" "$FAIL"
echo "╚══════════════════════════════════════════════════════════════╝"
if [[ $FAIL -gt 0 ]]; then
  printf '  failed: %s\n' "${FAILED[@]}"
  exit 1
fi
