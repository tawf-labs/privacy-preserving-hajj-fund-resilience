// Layer 1 solvency model, arithmetised (bit-exact with packages/solvency-model/src/model.ts).
//
//   PVO_s = W + sum_{k=1..H} q * m * esc_s(k) / (1 + d_s)^k
//   F_s   = sum_i h_i (1 - hc_{s,i}) + sum_{k=1..H} (1 - ys_s) * income_s / (1 + d_s)^k
//   pass_s  <=>  F_s * S >= tau * PVO_s          (no division in the comparison)
//
// All rates are basis points (S = 10_000). Money is Rp ribu. Obligations round UP
// and assets round DOWN, so fixed-point rounding can only make the fund look worse.
// Every intermediate is u128: an overflow is an assertion failure (no proof), never
// a silent wrap-around.

pub global S: u128 = 10_000;
pub global N_ASSETS: u32 = 6;
pub global N_SCENARIOS: u32 = 3;
pub global H: u32 = 10;

pub global MAX_HOLDING: u64 = 1 << 50;
pub global MAX_SUBSIDY: u64 = 1 << 36;
pub global MAX_WAITLIST: u64 = 1 << 50;
pub global MAX_QUOTA: u64 = 1 << 24;
pub global MAX_FX: u64 = 1 << 32;
pub global MAX_FX_RATIO: u128 = 100_000; // 10x shock ceiling, in bps

pub struct Scenario {
    pub inflation_bps: u64,
    pub fx_idr_per_sar: u64,
    pub discount_bps: u64,
    pub yield_shock_bps: u64,
    pub haircut_bps: [u64; N_ASSETS],
}

pub struct Macro {
    pub fx_base: u64,
    pub quota: u64,
    pub sar_share_bps: u64,
    pub tau_bps: u64,
}

pub struct Position {
    pub holdings: [u64; N_ASSETS],
    pub return_bps: [u64; N_ASSETS],
    pub subsidy_per_pilgrim: u64,
    pub waitlist_deposits: u64,
}

pub fn ceil_div(a: u128, b: u128) -> u128 {
    (a + b - 1) / b
}

fn bps(x: u64) -> u128 {
    x as u128
}

/// Range checks shared with `validate()` in the TS model. Every private input is
/// bounded here so no free witness value can drive the arithmetic out of range.
pub fn validate(m: Macro, scenarios: [Scenario; N_SCENARIOS], p: Position) {
    assert((m.fx_base > 0) & (m.fx_base < MAX_FX), "fx base out of range");
    assert((m.quota > 0) & (m.quota < MAX_QUOTA), "quota out of range");
    assert(bps(m.sar_share_bps) <= S, "sar share out of range");
    assert((m.tau_bps > 0) & (bps(m.tau_bps) <= 10 * S), "tau out of range");
    for i in 0..N_ASSETS {
        assert(p.holdings[i] < MAX_HOLDING, "holding out of range");
        assert(bps(p.return_bps[i]) <= S, "return out of range");
    }
    assert(p.subsidy_per_pilgrim < MAX_SUBSIDY, "subsidy out of range");
    assert(p.waitlist_deposits < MAX_WAITLIST, "waitlist out of range");
    for s in 0..N_SCENARIOS {
        let sc = scenarios[s];
        assert(bps(sc.inflation_bps) <= S, "inflation out of range");
        assert(bps(sc.discount_bps) <= S, "discount out of range");
        assert(bps(sc.yield_shock_bps) <= S, "yield shock out of range");
        assert((sc.fx_idr_per_sar > 0) & (sc.fx_idr_per_sar < MAX_FX), "fx out of range");
        let fx_ratio = ceil_div((sc.fx_idr_per_sar as u128) * S, m.fx_base as u128);
        assert(fx_ratio <= MAX_FX_RATIO, "fx shock exceeds 10x");
        for i in 0..N_ASSETS {
            assert(bps(sc.haircut_bps[i]) <= S, "haircut out of range");
        }
    }
}

/// PVO_s: waitlist deposits (payable on demand, undiscounted) plus the present value
/// of the nilai-manfaat subsidy stream over the horizon, escalated by inflation and
/// by the SAR-denominated share of the per-pilgrim cost.
pub fn obligations(m: Macro, sc: Scenario, p: Position) -> u128 {
    let fx_ratio = ceil_div((sc.fx_idr_per_sar as u128) * S, m.fx_base as u128);
    let w = bps(m.sar_share_bps);
    let blend = ceil_div((S - w) * S + w * fx_ratio, S);
    let base = ceil_div((m.quota as u128) * (p.subsidy_per_pilgrim as u128) * blend, S);

    let infl = bps(sc.inflation_bps);
    let mut vals: [u128; H] = [0; H];
    let mut esc = base;
    for k in 0..H {
        esc = ceil_div(esc * (S + infl), S);
        vals[k] = esc;
    }
    // Horner from the far end: acc <- (acc + v_k) / (1 + d), k = H..1
    let disc = bps(sc.discount_bps);
    let mut acc: u128 = 0;
    for j in 0..H {
        let k = H - 1 - j;
        acc = ceil_div((acc + vals[k]) * S, S + disc);
    }
    (p.waitlist_deposits as u128) + acc
}

/// F_s: holdings after scenario haircuts plus the present value of the stressed
/// investment income they generate over the horizon.
pub fn assets(sc: Scenario, p: Position) -> u128 {
    let mut liquid: u128 = 0;
    let mut income: u128 = 0;
    for i in 0..N_ASSETS {
        let li = (p.holdings[i] as u128) * (S - bps(sc.haircut_bps[i])) / S;
        liquid += li;
        income += li * bps(p.return_bps[i]) / S;
    }
    let stressed = income * (S - bps(sc.yield_shock_bps)) / S;
    let disc = bps(sc.discount_bps);
    let mut acc: u128 = 0;
    for _ in 0..H {
        acc = (acc + stressed) * S / (S + disc);
    }
    liquid + acc
}

/// Evaluates SR_s >= tau for every regime. Returns one bit per regime.
pub fn evaluate(m: Macro, scenarios: [Scenario; N_SCENARIOS], p: Position) -> [bool; N_SCENARIOS] {
    validate(m, scenarios, p);
    let tau = bps(m.tau_bps);
    let mut bits = [false; N_SCENARIOS];
    for s in 0..N_SCENARIOS {
        let pvo = obligations(m, scenarios[s], p);
        assert(pvo > 0, "obligations must be positive");
        let f = assets(scenarios[s], p);
        bits[s] = f * S >= tau * pvo;
    }
    bits
}
