# Data classification mapping

The paper partitions data by one criterion: can an external party verify the value **without** harming the institution, or is disclosure itself the
harm that *Sitr* forbids? Observed variables become **public inputs**; the fund's own position becomes the **private witness**.
This table completes the paper's variable definition (V1 – V11, including the empty V10 and V11 rows) and points at the code.

| ID | Variable | Type | Circuit name | Notes |
| --- | --- | --- | --- | --- |
| V1 | Total asset value A_t | Private witness | `holdings[6]` | Held per asset class: SBSN sukuk, corporate sukuk, sharia deposits, direct investment, gold, cash. Rp ribu. |
| V2 | Projected obligation O_t | Private witness | `waitlist_deposits`, `subsidy_per_pilgrim` | Setoran awal held for the waiting queue; nilai manfaat per departing pilgrim. |
| V3 | Investment portfolio composition | Private witness | `holdings[6]` (allocation is implicit) | Never published; attested by the custodian ledger. |
| V4 | Expected investment return | Private witness | `return_bps[6]` | Value-weighted per class, from position-level coupons and yields. |
| V5 | Inflation rate | Public input | `inflation_bps[3]` | Per regime. Source: Bank Indonesia. |
| V6 | Exchange rate | Public input | `fx_base`, `fx_idr_per_sar[3]` | IDR per SAR, base and per regime. Source: JISDOR-derived. |
| V7 | Discount rate | Public input | `discount_bps[3]` | Per regime. |
| V8 | Hajj quota | Public input | `quota`, `sar_share_bps` | Kemenag quota and the SAR-denominated share of the per-pilgrim cost. |
| V9 | Solvency threshold τ | Public input | `tau_bps` | Statutory; 10 000 means SR ≥ 1.00. The paper writes θ in this row and τ elsewhere. |
| V10 | Verification result | Public output | `result_bits[3]` | 1 iff SR_s ≥ τ, for Baseline / Moderate / Acute. |
| V11 | Cryptographic proof | Public output | proof (9,152 B) | UltraHONK, EVM target. |

Additional public values that are part of the artifact but absent from the paper's table:

| Value | Type | Purpose |
| --- | --- | --- |
| `period_id` | Public input | Binds proof, attestation and statement id to one reporting period. |
| Stress deltas (`yield_shock_bps[3]`, `haircut_bps[3][6]`) | Public input | Regulator-defined severity of each regime. |
| `attestor_key_hash` | Public input | Identifies the accepted attestor key; pinned on-chain. |
| `statement_id` | Public output | Replay nullifier: `pedersen(domain, commitment, period_id)`. |
| `commitment` | Public output | Hiding commitment to the private witness (blinded by the private `salt`). |

## What each party sees

| | Full audit | Annual-report aggregate | This artifact |
| --- | --- | --- | --- |
| Position-level ledger (issuer, custodian, value, return, maturity) | yes | no | **no** |
| Class totals and weighted returns | yes | yes | **no** |
| Liabilities | yes | yes | **no** |
| Solvency ratio value | derivable | derivable | **no** |
| Whether SR ≥ τ under each regime | derivable | derivable | **yes (3 bits)** |

See `evaluation/results/der.md` for the measured byte volumes.
