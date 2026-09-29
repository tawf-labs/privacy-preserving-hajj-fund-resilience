# Paper alignment

How the implementation maps onto the paper's design requirements (REQ-1..4) and theoretical justifications (J1..J11),
what is deliberately different, and corrections worth making in the manuscript.

## Requirements → code

| Req | Statement | Layer | Implemented in | Evidence |
| --- | --- | --- | --- | --- |
| REQ-1 | Regime-sensitive solvency logic | 1 | `packages/solvency-model/src/model.ts`, `circuits/hajj_solvency/src/model.nr` | 3 regimes per proof; `evaluation/results/stress.md` |
| REQ-2 | Verified data provenance | 2 | `packages/attestor/src/{sources,enclave}.ts`, `circuits/.../attest.nr` | tamper tests in `attestor.test.ts`, `circuit.test.ts` |
| REQ-3 | Non-disclosive proof generation | 3 | `circuits/hajj_solvency/src/main.nr`, `packages/prover` | 14 circuit tests incl. 500-case fuzz |
| REQ-4 | Quantifiable privacy gain | 4 | `evaluation/src/der.ts` | `evaluation/results/der.md` |

## Justifications → code

| J | Justification | Where it is realised |
| --- | --- | --- |
| J1 | Single-point valuation understates tail risk; account for regime shifts | Three regimes in one proof. In the synthetic evaluation baseline-only certifies **3 of 3** funds; only 1 survives every regime. |
| J2 | Liability valuation follows intertemporal budget logic | `PVO_s`: waitlist deposits plus the discounted, inflation- and FX-escalated subsidy stream over horizon H (`obligations()` in `model.nr`). |
| J3 | Oracle problem: no single feed is trustworthy without independent attestation | Each macro source and the custodian ledger is checked against a digest registered by its issuer (`sources.ts`); the circuit rejects witnesses not signed by the registered attestor key. |
| J4 | TEE enclaves isolate off-chain computation and shrink the trusted base | `SimulatedEnclave` (`enclave.ts`) + `phala.config.json` / `Dockerfile`. **Simulated**, see the threat model. |
| J6 | Cryptographic attestation fulfils Amanah while preserving Sitr | Public: 3 result bits, statement id, commitment. Private: everything else (`docs/data-classification.md`). |
| J7 | Detect and prevent under-constrained circuits | Every private input range-checked; no `unconstrained` hints; negative tests for tampered witness, parameters, period, key and signature; differential fuzz against an independent BigInt implementation. **Not** SMT/Picus analysis, see below. |
| J8 | Anti-malleability / replay protection | `period_id` inside the signed message and `statement_id`; the registry rejects a reused `statement_id`, a reused proof hash, and a second proof per period; UltraHONK-ZK proofs are re-randomised per run, so proof bytes are not a stable identifier and the statement id is used instead. |
| J10 | Enterprise-scale compilation, non-interactive verification | 68,941 gates compile in ~1 s; one 9 KB proof verified in ~0.5 s (WASM) or ~2.9 M gas on-chain under Cancun pricing (~4.1 M under Osaka, plus ~150k calldata); no auditor interaction at verification time. |
| J11 | Privacy must be measured, not asserted | DER, reported four ways (limiting, conservative, vs. aggregate report, whole bundle). |

## Corrections and clarifications for the manuscript

1. **Proving system.** §3.3.4 says the circuit is compiled to R1CS following CIRCOM. The implementation, like the abstract,
   uses **Noir**, which compiles to ACIR and is proven with **Barretenberg UltraHONK** (a PLONK-ish system). The R1CS/CIRCOM
   references (Bellés-Muñoz et al.; Peng et al.) remain valid as scalability precedent, but "R1CS" should not describe the artifact.
   The Layer 3 box in the architecture figure lists "Arithmetic Circuit (R1CS)" and "Constraint Compilation" and should be updated accordingly.
2. **Threshold symbol.** The manuscript uses both τ (§1, §3.3.2) and θ (variable table row V9). The code and this documentation use **τ**
   (`tau_bps`); pick one.
3. **Variable table rows V10 and V11 are empty.** Suggested content, matching the implementation:
   V10 *Verification Result*: three booleans `result_bits[s] = (SR_s ≥ τ)`, Public Output; V11 *Cryptographic Proof*: UltraHONK proof
   (9,152 B) with 41 public inputs, Public Output. Two further public outputs exist and should probably be listed: the witness
   **commitment** and the **statement id**.
4. **Layer numbering.** §1 names the layers "Real-World Data, Trusted Attestation, ZKP Circuit, Public Verification"; §3.3 and the figure name
   Layer 1 "Deterministic Solvency Model". The code follows §3.3 / the figure.
5. **Scenario naming.** The text alternates Baseline/Moderate/**Stress** (§3.3.2) and Baseline/Moderate/**Acute** (figure). The code uses Acute.
6. **Justification numbering.** Table 2 skips J5 and J9. Please also re-check the column placement of the marks in Table 3 against the text of
   §3.2 (for example, the text ties the oracle-problem justifications J3/J4 to Requirement 2, which the flattened table appears to place elsewhere).
   The code follows the text of §3.2.
7. **Notation.** `SR_t` is indexed by period t in the paper, but each proof here covers one period and indexes by **regime** s. A period id is
   bound into every proof instead.
8. **What the ZKP does not show.** The paper states this correctly in the abstract; the portal repeats it. In particular the three result
   bits are public and reveal SR ≥ τ per regime, and DER measures volume, not information content.
9. **Threshold interpretation.** τ = 1.00 (SR ≥ 1). The paper leaves the statutory value open; it is a public parameter pinned per period.

## Where the implementation goes beyond or differs from the paper text

* **Attestation is verified inside the circuit.** The paper describes the TEE as "pre-certifying" inputs. Here the attestor signs a Pedersen commitment
  to the witness and the public parameters, and the circuit verifies that secp256k1 signature. Without it, a prover could feed any witness
  into the circuit; with it, only attested witnesses yield a proof.
* **Regulator-pinned parameters.** `HajjSolvencyRegistry` pins each period's public parameters and attestor key hash on-chain (regulator role),
  so the fund cannot choose easier scenarios. This is an addition; the paper's Layer 4 only describes publication.
* **Rounding is conservative by construction** (obligations round up, assets round down). This is a soundness argument the paper does not make.
* **No SMT uniqueness analysis.** Pailoor et al. target R1CS/Circom (Picus). We could not apply that tool to Noir/ACIR; the substitute is
  range checks, no hints, negative tests and differential fuzzing. Running a Noir-native under-constraint analysis (e.g. Picus/other ACIR tooling)
  remains future work.
* **Simulated TEE.** Called out in the README and the threat model; the paper's evaluation is explicitly simulated, consistent with its stated scope.

## Suggested reproducibility statement

> The artifact (circuit, attestor, contracts, portal and evaluation harness) is available at
> `github.com/tawf-labs/privacy-preserving-hajj-fund-resilience`. `bash scripts/e2e-pipeline.sh --eval` reproduces every table in Section IV from
> synthetic data with a fixed random seed (proof bytes vary because UltraHONK-ZK proofs are randomised; verdicts and public inputs do not).
