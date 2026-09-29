import { BOUNDS, DEFAULT_HORIZON, N_ASSETS, N_SCENARIOS, S } from './constants.js';
import type {
  FloatScenarioResult,
  PrivateWitness,
  PublicParams,
  ScenarioParams,
  ScenarioResult,
} from './types.js';

/*
 * Deterministic solvency model, Layer 1 of the artifact.
 *
 *   SR_s = F_s / PVO_s,     compliant for regime s iff SR_s >= tau
 *
 *   PVO_s = W + sum_{k=1..H} q * m * esc_s(k) / (1 + d_s)^k
 *   esc_s(k) = (1 + pi_s)^k * [ (1 - w) + w * fx_s / fx_0 ]
 *   F_s   = sum_i h_i (1 - hc_{s,i})
 *         + sum_{k=1..H} (1 - ys_s) * sum_i h_i (1 - hc_{s,i}) r_i / (1 + d_s)^k
 *
 * `computeFixed` is the bit-exact mirror of circuits/hajj_solvency/src/model.nr.
 * Rounding is conservative: obligations round up, assets round down, so integer
 * rounding can never turn a failing fund into a passing one.
 */

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;

export class ModelInputError extends Error {}

function check(cond: boolean, msg: string): void {
  if (!cond) throw new ModelInputError(msg);
}

/** Same range checks the circuit enforces; failing inputs cannot be proven. */
export function validate(pub: PublicParams, priv: PrivateWitness): void {
  check(pub.scenarios.length === N_SCENARIOS, `expected ${N_SCENARIOS} scenarios`);
  check(priv.holdings.length === N_ASSETS, `expected ${N_ASSETS} holdings`);
  check(priv.returnBps.length === N_ASSETS, `expected ${N_ASSETS} returns`);
  check(pub.fxBaseIdrPerSar > 0 && BigInt(pub.fxBaseIdrPerSar) < BOUNDS.maxFx, 'fx base out of range');
  check(pub.quota > 0 && BigInt(pub.quota) < BOUNDS.maxQuota, 'quota out of range');
  check(pub.sarShareBps >= 0 && BigInt(pub.sarShareBps) <= S, 'sar share out of range');
  check(pub.tauBps > 0 && BigInt(pub.tauBps) <= 10n * S, 'tau out of range');
  for (const h of priv.holdings) check(h >= 0n && h < BOUNDS.maxHolding, 'holding out of range');
  for (const r of priv.returnBps) check(r >= 0 && BigInt(r) <= S, 'return out of range');
  check(priv.subsidyPerPilgrim >= 0n && priv.subsidyPerPilgrim < BOUNDS.maxSubsidy, 'subsidy out of range');
  check(priv.waitlistDeposits >= 0n && priv.waitlistDeposits < BOUNDS.maxWaitlist, 'waitlist out of range');
  for (const sc of pub.scenarios) {
    check(sc.haircutBps.length === N_ASSETS, `expected ${N_ASSETS} haircuts`);
    check(sc.inflationBps >= 0 && BigInt(sc.inflationBps) <= S, 'inflation out of range');
    check(sc.discountBps >= 0 && BigInt(sc.discountBps) <= S, 'discount out of range');
    check(sc.yieldShockBps >= 0 && BigInt(sc.yieldShockBps) <= S, 'yield shock out of range');
    check(sc.fxIdrPerSar > 0 && BigInt(sc.fxIdrPerSar) < BOUNDS.maxFx, 'fx out of range');
    const fxRatio = ceilDiv(BigInt(sc.fxIdrPerSar) * S, BigInt(pub.fxBaseIdrPerSar));
    check(fxRatio <= BOUNDS.maxFxRatioBps, 'fx shock exceeds 10x');
    for (const hc of sc.haircutBps) check(hc >= 0 && BigInt(hc) <= S, 'haircut out of range');
  }
}

export function scenarioObligations(
  pub: PublicParams,
  priv: PrivateWitness,
  sc: ScenarioParams,
  horizon = DEFAULT_HORIZON,
): { obligations: bigint; pvSubsidy: bigint } {
  const fxRatio = ceilDiv(BigInt(sc.fxIdrPerSar) * S, BigInt(pub.fxBaseIdrPerSar));
  const w = BigInt(pub.sarShareBps);
  const blend = ceilDiv((S - w) * S + w * fxRatio, S);
  const base = ceilDiv(BigInt(pub.quota) * priv.subsidyPerPilgrim * blend, S);

  const infl = BigInt(sc.inflationBps);
  const vals: bigint[] = [];
  let esc = base;
  for (let k = 0; k < horizon; k++) {
    esc = ceilDiv(esc * (S + infl), S);
    vals.push(esc);
  }
  // Horner from the far end: acc <- (acc + v_k) / (1 + d), k = H..1
  const disc = BigInt(sc.discountBps);
  let acc = 0n;
  for (let k = horizon - 1; k >= 0; k--) acc = ceilDiv((acc + vals[k]) * S, S + disc);
  return { obligations: priv.waitlistDeposits + acc, pvSubsidy: acc };
}

export function scenarioAssets(
  priv: PrivateWitness,
  sc: ScenarioParams,
  horizon = DEFAULT_HORIZON,
): { assets: bigint; liquidAssets: bigint; pvIncome: bigint } {
  let liquid = 0n;
  let income = 0n;
  for (let i = 0; i < N_ASSETS; i++) {
    const li = (priv.holdings[i] * (S - BigInt(sc.haircutBps[i]))) / S;
    liquid += li;
    income += (li * BigInt(priv.returnBps[i])) / S;
  }
  const stressedIncome = (income * (S - BigInt(sc.yieldShockBps))) / S;
  const disc = BigInt(sc.discountBps);
  let acc = 0n;
  for (let k = 0; k < horizon; k++) acc = ((acc + stressedIncome) * S) / (S + disc);
  return { assets: liquid + acc, liquidAssets: liquid, pvIncome: acc };
}

/** Bit-exact reference of the circuit. Returns one result per stress regime. */
export function computeFixed(
  pub: PublicParams,
  priv: PrivateWitness,
  horizon = DEFAULT_HORIZON,
): ScenarioResult[] {
  validate(pub, priv);
  const tau = BigInt(pub.tauBps);
  return pub.scenarios.map((sc) => {
    const { obligations, pvSubsidy } = scenarioObligations(pub, priv, sc, horizon);
    const { assets, liquidAssets, pvIncome } = scenarioAssets(priv, sc, horizon);
    if (obligations === 0n) throw new ModelInputError('obligations must be positive');
    return {
      name: sc.name,
      assets,
      liquidAssets,
      pvIncome,
      obligations,
      pvSubsidy,
      ratioBps: (assets * S) / obligations,
      pass: assets * S >= tau * obligations,
    };
  });
}

/** Result bitmap as published by the circuit: bit s set iff regime s passes. */
export function resultBits(results: ScenarioResult[]): boolean[] {
  return results.map((r) => r.pass);
}

/** Continuous (float) version of the same model, used for reporting and sensitivity plots. */
export function computeFloat(
  pub: PublicParams,
  priv: PrivateWitness,
  horizon = DEFAULT_HORIZON,
): FloatScenarioResult[] {
  const tau = pub.tauBps / 1e4;
  const w = pub.sarShareBps / 1e4;
  return pub.scenarios.map((sc) => {
    const pi = sc.inflationBps / 1e4;
    const d = sc.discountBps / 1e4;
    const blend = 1 - w + (w * sc.fxIdrPerSar) / pub.fxBaseIdrPerSar;
    const base = pub.quota * Number(priv.subsidyPerPilgrim) * blend;
    let pvSubsidy = 0;
    for (let k = 1; k <= horizon; k++) pvSubsidy += (base * (1 + pi) ** k) / (1 + d) ** k;
    const obligations = Number(priv.waitlistDeposits) + pvSubsidy;

    let liquid = 0;
    let income = 0;
    for (let i = 0; i < N_ASSETS; i++) {
      const li = Number(priv.holdings[i]) * (1 - sc.haircutBps[i] / 1e4);
      liquid += li;
      income += (li * priv.returnBps[i]) / 1e4;
    }
    const stressed = income * (1 - sc.yieldShockBps / 1e4);
    let pvIncome = 0;
    for (let k = 1; k <= horizon; k++) pvIncome += stressed / (1 + d) ** k;
    const assets = liquid + pvIncome;
    const ratio = assets / obligations;
    return { name: sc.name, assets, obligations, ratio, pass: ratio >= tau };
  });
}
