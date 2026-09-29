# Threat model and known limitations

This is a research prototype and has **not been audited**. This document states what the design defends against, what it does not, and what is
still simulated.

## What the design defends against

| Threat | Defence | Test |
| --- | --- | --- |
| Prover alters the portfolio after attestation | Signature covers a Pedersen commitment to the exact witness; circuit re-derives it | `rejects a witness altered after attestation` |
| Prover proves easier stress scenarios | Signature covers `params_hash`; registry pins parameters per period | `rejects public parameters altered after attestation`, `test_reject_easier_stress_parameters` |
| Replay of an old attestation or proof in a later period | `period_id` is in the signed message and in `statement_id`; registry allows one proof per period and rejects reused statement ids and proof hashes | `rejects a replay ... different period`, `test_one_proof_per_period_and_replay_blocked` |
| Proof from a different attestor | `attestor_key_hash` is a public input, pinned on-chain | `rejects a signature from an unregistered key`, `test_reject_different_attestor_key` |
| Forged output bits | The verifier rejects any change to public inputs | `proofs with flipped outputs or bytes do not verify`, `test_reject_flipped_result_bit` |
| Tampered proof bytes | Same | `test_reject_tampered_proof_bytes`; also demonstrated in the browser portal |
| Tampered macro source or ledger | Attestor checks a digest registered by the issuer | 4 tests in `attestor.test.ts` |
| Overflow / out-of-range arithmetic | Range checks on every input, `u128` intermediates | `enforces range checks even on attested inputs` |
| Circuit disagrees with the intended model | 500-case differential fuzz against an independent `BigInt` implementation, including cases on the exact pass/fail boundary | `differential fuzz` |
| Rounding flips a failing fund to passing | Obligations round up, assets round down | `rounds conservatively` |
| Registry used to move value | No funds, no `payable`, append-only | `test_registry_holds_no_funds` |

## What it does not defend against

1. **Compromised or dishonest attestor.** A proof is only as good as the attestor's key and checks. The attestor can sign a false witness. In production the key must be
   sealed in an attested TEE and the enclave measurement pinned by the regulator; several independent attestors (threshold or multi-signature) would remove the single point of failure.
2. **The simulated TEE is not a TEE.** `SimulatedEnclave` runs as an ordinary process. Its `report` is a signed JSON document, not a hardware quote, and `enclaveMeasurement` is a hash
   of the source files. There is no protection against the host operator. TEEs also have their own side-channel exposure (Guo et al., 2025).
3. **Compromised source registry.** Source digests are read from `data/synthetic/sources/registry.json`. In production they must arrive over authenticated channels
   (issuer signatures or TLS-notarised fetches); whoever controls the registry controls what counts as authentic.
4. **Public dev key.** Without `ATTESTOR_SECRET_KEY`, the attestor uses a key committed to the repository. `GET /info` reports `usingDevKey`.
5. **Regulator key compromise.** The regulator role pins parameters and can pin a weak scenario set for a period. Use a multisig and publish the parameters for review.
6. **Information leakage beyond the three bits.** The result bits reveal whether SR ≥ τ per regime. Publishing the bits over time, together with public parameters, also tells an observer
   something about the fund's trajectory. The `commitment` is hiding only while `salt` stays secret and fresh; a 248-bit random salt is drawn per attestation unless one is supplied.
7. **Side channels of the prover.** Proving time does not depend on the witness values in this circuit (fixed control flow), but the prototype makes no constant-time claims for the surrounding code.
8. **Under-constrained circuit bugs.** The circuit was reviewed and tested as described above, but not analysed with a formal tool. The paper cites SMT-based uniqueness propagation (Pailoor et al.), which
   targets R1CS/Circom; an equivalent for Noir/ACIR would be worthwhile before any real use.
9. **Modelling risk.** The solvency model is a deliberately simple, deterministic projection with regulator-set regimes. A proof that SR ≥ τ under these regimes is not a claim that the fund is sound in a
   real crisis. The regime parameters are the political and actuarial substance and are public inputs for that reason.
10. **Zero-knowledge and the EVM verifier.** The generated `HonkVerifier` is unmodified Barretenberg output (Apache-2.0, © Aztec). Use it only with the matching circuit and verification key
    (`VK_HASH` is embedded); regenerate with `pnpm --filter @hajj-zk/prover export-verifier` whenever the circuit changes.

## Operational notes

* Proof bytes are randomised (UltraHONK-ZK); do not use them as identifiers. Use `statement_id`.
* Trusted setup: UltraHONK uses the universal Aztec Ignition SRS (public parameters, multi-party ceremony); no circuit-specific ceremony.
* The portal verifies with the shipped 1 KB SRS slice. Verifying only needs the G2 point and first G1 points, so this weakens nothing.
