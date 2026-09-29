// Layer 2 binding inside the circuit: the private witness is only accepted if a
// recognised attestor (the TEE enclave) signed a commitment to exactly this witness,
// for exactly these public parameters and this period.

use crate::model::{Macro, N_ASSETS, N_SCENARIOS, Position, Scenario};

/// Domain separator for statement ids ("HAJJ-SR" as ASCII).
pub global STATEMENT_DOMAIN: Field = 0x48414a4a2d5352;

/// Hiding commitment to the private witness (salt is the blinding factor).
pub fn commit(p: Position, salt: Field) -> Field {
    let mut xs: [Field; 15] = [0; 15];
    for i in 0..N_ASSETS {
        xs[i] = p.holdings[i] as Field;
        xs[N_ASSETS + i] = p.return_bps[i] as Field;
    }
    xs[12] = p.subsidy_per_pilgrim as Field;
    xs[13] = p.waitlist_deposits as Field;
    xs[14] = salt;
    std::hash::pedersen_hash(xs)
}

/// Hash of every public parameter, so the attestor's signature also covers the
/// macro assumptions (inflation, FX, quota, stress deltas) it certified.
pub fn params_hash(period_id: u64, m: Macro, scenarios: [Scenario; N_SCENARIOS]) -> Field {
    let mut xs: [Field; 35] = [0; 35];
    xs[0] = period_id as Field;
    xs[1] = m.fx_base as Field;
    xs[2] = m.quota as Field;
    xs[3] = m.sar_share_bps as Field;
    xs[4] = m.tau_bps as Field;
    for s in 0..N_SCENARIOS {
        let o = 5 + s * 10;
        xs[o] = scenarios[s].inflation_bps as Field;
        xs[o + 1] = scenarios[s].fx_idr_per_sar as Field;
        xs[o + 2] = scenarios[s].discount_bps as Field;
        xs[o + 3] = scenarios[s].yield_shock_bps as Field;
        for i in 0..N_ASSETS {
            xs[o + 4 + i] = scenarios[s].haircut_bps[i] as Field;
        }
    }
    std::hash::pedersen_hash(xs)
}

fn pack16(bytes: [u8; 32], offset: u32) -> Field {
    let mut acc: Field = 0;
    for i in 0..16 {
        acc = acc * 256 + bytes[offset + i] as Field;
    }
    acc
}

/// Identifier of the attestor's secp256k1 key; this is what the registry pins.
pub fn key_hash(pk_x: [u8; 32], pk_y: [u8; 32]) -> Field {
    std::hash::pedersen_hash([pack16(pk_x, 0), pack16(pk_x, 16), pack16(pk_y, 0), pack16(pk_y, 16)])
}

/// The 32-byte message the attestor signs.
pub fn attestation_message(commitment: Field, params: Field, period_id: u64) -> [u8; 32] {
    let digest = std::hash::pedersen_hash([commitment, params, period_id as Field]);
    digest.to_be_bytes()
}

/// Replay nullifier: one statement per (witness commitment, period).
pub fn statement_id(commitment: Field, period_id: u64) -> Field {
    std::hash::pedersen_hash([STATEMENT_DOMAIN, commitment, period_id as Field])
}

pub fn verify_attestation(
    pk_x: [u8; 32],
    pk_y: [u8; 32],
    signature: [u8; 64],
    message: [u8; 32],
    expected_key_hash: Field,
) {
    assert(key_hash(pk_x, pk_y) == expected_key_hash, "Unrecognised attestor key");
    let ok = std::ecdsa_secp256k1::verify_signature(pk_x, pk_y, signature, message);
    assert(ok, "Invalid attestation signature");
}
