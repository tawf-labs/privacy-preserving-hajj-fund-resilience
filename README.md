# ZK Verification for Privacy-Preserving Hajj Fund Resilience

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Noir](https://img.shields.io/badge/Noir-1.0.0--rc.3-purple.svg)](https://noir-lang.org/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.31-blue.svg)](https://soliditylang.org/)
[![React](https://img.shields.io/badge/React-19%20%2B%20Vite-black.svg)](https://vite.dev/)

Companion artifact for the paper *Zero-Knowledge Verification for Privacy-Preserving Hajj Fund Resilience*
(Fauzi, Fatonie, Muhammad, Hakim). It lets a Sharia-governed sovereign fund such as BPKH prove that its
solvency ratio stays at or above a statutory threshold under Baseline, Moderate and Acute stress regimes,
**without disclosing its portfolio**, and quantifies the privacy gain with the Data Exposure Reduction (DER) metric.

> **Everything here runs on synthetic data.** No BPKH data is used. Magnitudes follow publicly reported orders of
> magnitude only. The attestation layer is a *simulated* TEE (see [Limits](#limits-read-this)).

## The four layers

```
Layer 4  Public verification      React portal · HajjSolvencyRegistry (Sepolia) · bb.js in the browser
            ▲  proof + 3 result bits
Layer 3  ZK proof generation      Noir circuit `hajj_solvency` · Barretenberg UltraHONK
            ▲  attested witness
Layer 2  Trusted attestation      Simulated TEE: authenticates sources, aggregates ledger, signs commitment
            ▲  authenticated inputs
Layer 1  Deterministic solvency   SR = F / PVO under 3 regimes · fixed-point · conservative rounding
```

| Layer | Paper requirement | Code |
| --- | --- | --- |
| 1 Deterministic solvency model | REQ-1 regime-sensitive solvency | [`packages/solvency-model`](packages/solvency-model), [`circuits/hajj_solvency/src/model.nr`](circuits/hajj_solvency/src/model.nr) |
| 2 Trusted attestation | REQ-2 verified data provenance | [`packages/attestor`](packages/attestor), [`circuits/hajj_solvency/src/attest.nr`](circuits/hajj_solvency/src/attest.nr) |
| 3 ZK proof generation | REQ-3 non-disclosive proof generation | [`circuits/hajj_solvency`](circuits/hajj_solvency), [`packages/prover`](packages/prover) |
| 4 Public verification + DER | REQ-4 quantifiable privacy gain | [`contracts`](contracts), [`apps/portal`](apps/portal), [`evaluation`](evaluation) |

What the circuit proves, for each regime *s*: `F_s · 10000 ≥ τ · PVO_s`, publishing only three result bits,
a replay-safe statement id and a hiding commitment. See [docs/architecture.md](docs/architecture.md) and the
[circuit logic diagram](docs/circuit-logic.md).

## Results (synthetic data)

Full reports: [`evaluation/results`](evaluation/results).

**Financial stress test.** A baseline-only valuation certifies all three synthetic funds. Regime-aware
verification shows only the healthy fund is solvent in every regime (paper justification J1):

| Fund | Baseline | Moderate | Acute |
| --- | --- | --- | --- |
| Healthy | SR 1.46 PASS | SR 1.30 PASS | SR 1.02 PASS |
| Strained | SR 1.19 PASS | SR 1.05 PASS | SR 0.79 **FAIL** |
| Deteriorating | SR 1.04 PASS | SR 0.90 **FAIL** | SR 0.67 **FAIL** |

The bit the circuit publishes equals the reference model in all 9 cells, and a 500-case differential fuzz
agrees bit-for-bit.

**Cryptographic benchmark** (n = 10; 4-core Xeon, Barretenberg on WASM in Node):

| Metric | Value |
| --- | --- |
| ACIR opcodes / backend gates | 4,201 / 68,941 (circuit size 2^17) |
| Proof generation | 1.49 s avg (1.40 – 1.67 s) |
| Proof verification | 0.51 s avg in bb.js WASM |
| Proof / verification key | 9,152 B / 1,888 B |
| `HajjSolvencyRegistry.submitProof` (incl. on-chain verification) | 2.86 M gas (Cancun/Prague pricing), **4.12 M** (Osaka, EIP-7883 modexp repricing); 4.29 M total tx gas incl. calldata on a local Osaka chain |

Gates grow slowly with the projection horizon (66.5 k at H = 5, 78.7 k at H = 30) and prove time stays flat.

**Data Exposure Reduction** = `1 − D_disclosed / D_total`. We report it conservatively, charging the witness
commitment and statement id, not only the paper's limiting case:

| Fund | Full audit | DER, limiting (paper) | DER, conservative | DER vs. annual-report aggregate |
| --- | --- | --- | --- | --- |
| Healthy (150 positions) | 35,981 B | 99.997% | 99.819% | 98.72% |
| Strained (138) | 33,643 B | 99.997% | 99.807% | 98.63% |
| Deteriorating (126) | 30,612 B | 99.997% | 99.788% | 98.49% |

For transparency: counting *every* byte of the published proof bundle, including the 9 KB proof, the ratio is only
27 – 38%. The proof is public but carries no witness information. See [`evaluation/results/der.md`](evaluation/results/der.md).

## Quick start

Prerequisites: Node ≥ 22, pnpm ≥ 9. Nothing else: the Noir compiler, prover and Foundry all run from npm packages.

```bash
pnpm install
pnpm setup:crs            # seeds the Barretenberg SRS cache (~64 MB, one time)
bash scripts/e2e-pipeline.sh          # 13 steps: model, circuit, attestor, contracts, portal, evaluation tests
bash scripts/e2e-pipeline.sh --eval   # also regenerate evaluation/results (~1 min)
```

Individual pieces:

```bash
pnpm --filter @hajj-zk/prover prove --state strained --out proof.json    # attest + prove a synthetic fund
pnpm --filter @hajj-zk/prover verify --proof proof.json                  # verify with Barretenberg
pnpm attestor                                                            # Layer 2 HTTP service on :8787
pnpm test:contracts                                                      # Foundry, with real proofs
pnpm portal                                                              # React + Vite portal on :5173
pnpm eval                                                                # stress test + benchmark + DER
```

If you have native `nargo`, `bb`, `forge` and `solc`, they work on the same sources (`circuits/hajj_solvency`,
`contracts`). The scripts use the npm-distributed toolchain so the repo builds in restricted environments;
`scripts/forge.sh` falls back to `solc-js` when no native `solc` is installed.

### Deploy to Ethereum Sepolia

```bash
cp contracts/.env.example contracts/.env   # RPC URL, deployer key, regulator and prover addresses
cd contracts && bash ../scripts/forge.sh script script/Deploy.s.sol --rpc-url sepolia --broadcast --verify
```

Then have the regulator call `pinPeriod` with the first 36 public inputs of a bundle, have the fund call
`submitProof`, and set `VITE_REGISTRY_ADDRESS` so the portal cross-checks proofs against the on-chain record.
Both contracts fit the 24 KB limit (verifier 17.7 KB, registry 5.0 KB). **Not yet deployed**: this needs your RPC and funded key.

## Repository layout

```
circuits/hajj_solvency/   Noir circuit (model.nr, attest.nr, main.nr) + committed artifact and VK
packages/solvency-model/  Layer 1: float model + bit-exact BigInt reference of the circuit
packages/attestor/        Layer 2: simulated-TEE service (Hono), Dockerfile, phala.config.json
packages/prover/          Layer 3 driver: noir_wasm compile, noir_js witness, bb.js prove/verify, CLIs
contracts/                HonkVerifier (generated), HajjSolvencyRegistry, Foundry tests, deploy script
apps/portal/              Layer 4: React + Vite public verification portal
evaluation/               Stress test, benchmark, DER → evaluation/results
data/synthetic/           Synthetic ledgers, macro sources, scenario parameters
docs/                     Architecture, data classification, circuit logic, threat model, paper alignment
scripts/                  e2e pipeline, forge wrapper, SRS setup
```

## Limits (read this)

* **The proof verifies computation, not truth.** It shows the three bits follow from the attested inputs. Whether the
  inputs are true is the oracle problem, addressed by Layer 2. Governance of that layer is where trust sits.
* **The TEE is real only when deployed on Phala.** Locally the attestor is a plain process: it authenticates inputs against
  digests in a registry file and signs with a secp256k1 key, and its `report` is a signed JSON document (the default dev key is
  public; set `ATTESTOR_SECRET_KEY` for anything else). Deployed with [`deploy/phala`](deploy/phala/README.md), the key is derived
  inside an Intel TDX confidential VM by Phala's KMS and the report carries a real TDX quote. That quote is not yet
  verified end to end by anything in this repo, and the source registry is still a file in the pinned commit.
* **Three result bits are public** by design and reveal whether SR ≥ τ in each regime. DER measures volume, not
  information content.
* **Synthetic and stylised.** The model is a deterministic, deliberately simple liability/asset projection, not BPKH's
  actuarial model. Results show the mechanism works, not that any real fund is solvent.
* **Not audited.** Do not secure real value with this code. See [docs/threat-model.md](docs/threat-model.md).
* The portal verifies proofs in the browser but does not generate them. Proving runs in the attestor/prover, next to the authenticated inputs, so the fund's data never has to reach a viewer's browser.
* There are no native `nargo test` unit tests: circuit behaviour is covered by the TypeScript suite (completeness,
  soundness and the differential fuzz), which executes the compiled circuit.

## Documentation

* [Architecture](docs/architecture.md) · [Circuit logic](docs/circuit-logic.md) · [Data classification](docs/data-classification.md)
* [Threat model](docs/threat-model.md) · [Paper alignment and corrections](docs/paper-alignment.md)
* [Design guidelines](DESIGN_GUIDELINES.md) (shared Tawf design tokens)

## Consistency with other Tawf Labs repositories

Same proving stack and conventions as [`zkt-research`](https://github.com/tawf-labs/zkt-research) (Noir, Barretenberg
UltraHONK, `pedersen_hash`, Foundry, Solidity 0.8.31, Phala TEE config, `e2e-pipeline.sh`), and the append-only,
holds-no-funds registry pattern of [`tawf-verify`](https://github.com/tawf-labs/tawf-verify).

## License

Apache-2.0, see [LICENSE](LICENSE).
