// Hajj Fund Solvency Circuit (Layer 3)
//
// Proves, without revealing the fund's position, that for period `period_id`:
//   1. the private witness was attested (signed) by the registered TEE attestor
//      together with these exact public parameters (oracle-problem mitigation);
//   2. SR_s = F_s / PVO_s was computed by the deterministic model for each of the
//      Baseline, Moderate and Acute regimes; and
//   3. result_bits[s] == (SR_s >= tau).
//
// Public outputs: result_bits (3 bits), statement_id (replay nullifier) and the
// hiding witness commitment. F_s, PVO_s, holdings, returns and liabilities stay private.

mod model;
mod attest;

use model::{Macro, N_ASSETS, N_SCENARIOS, Position, Scenario};

fn main(
    // ---- private witness (paper V1-V4) ----
    holdings: [u64; N_ASSETS],
    return_bps: [u64; N_ASSETS],
    subsidy_per_pilgrim: u64,
    waitlist_deposits: u64,
    salt: Field,
    attestor_pk_x: [u8; 32],
    attestor_pk_y: [u8; 32],
    attestation_sig: [u8; 64],
    // ---- public inputs (paper V5-V9), pinned on-chain per period ----
    period_id: pub u64,
    fx_base: pub u64,
    quota: pub u64,
    sar_share_bps: pub u64,
    tau_bps: pub u64,
    inflation_bps: pub [u64; N_SCENARIOS],
    fx_idr_per_sar: pub [u64; N_SCENARIOS],
    discount_bps: pub [u64; N_SCENARIOS],
    yield_shock_bps: pub [u64; N_SCENARIOS],
    haircut_bps: pub [[u64; N_ASSETS]; N_SCENARIOS],
    attestor_key_hash: pub Field,
) -> pub ([bool; N_SCENARIOS], Field, Field) {
    let m = Macro { fx_base, quota, sar_share_bps, tau_bps };
    let mut scenarios: [Scenario; N_SCENARIOS] = [
        Scenario {
            inflation_bps: 0,
            fx_idr_per_sar: 0,
            discount_bps: 0,
            yield_shock_bps: 0,
            haircut_bps: [0; N_ASSETS],
        }; N_SCENARIOS
    ];
    for s in 0..N_SCENARIOS {
        scenarios[s] = Scenario {
            inflation_bps: inflation_bps[s],
            fx_idr_per_sar: fx_idr_per_sar[s],
            discount_bps: discount_bps[s],
            yield_shock_bps: yield_shock_bps[s],
            haircut_bps: haircut_bps[s],
        };
    }
    let p = Position { holdings, return_bps, subsidy_per_pilgrim, waitlist_deposits };

    // Layer 2 binding: witness + public params + period were attested.
    let commitment = attest::commit(p, salt);
    let params = attest::params_hash(period_id, m, scenarios);
    let message = attest::attestation_message(commitment, params, period_id);
    attest::verify_attestation(attestor_pk_x, attestor_pk_y, attestation_sig, message, attestor_key_hash);

    // Layer 1 model, arithmetised.
    let result_bits = model::evaluate(m, scenarios, p);

    (result_bits, attest::statement_id(commitment, period_id), commitment)
}
