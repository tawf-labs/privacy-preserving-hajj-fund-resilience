import type { PrivateWitness, PublicParams } from './types.js';

/** JSON form of the private witness (bigints as decimal strings). */
export interface PrivateWitnessJson {
  holdings: string[];
  returnBps: number[];
  subsidyPerPilgrim: string;
  waitlistDeposits: string;
  salt: string;
}

export function witnessFromJson(j: PrivateWitnessJson): PrivateWitness {
  return {
    holdings: j.holdings.map(BigInt),
    returnBps: [...j.returnBps],
    subsidyPerPilgrim: BigInt(j.subsidyPerPilgrim),
    waitlistDeposits: BigInt(j.waitlistDeposits),
    salt: BigInt(j.salt),
  };
}

export function witnessToJson(w: PrivateWitness): PrivateWitnessJson {
  return {
    holdings: w.holdings.map(String),
    returnBps: [...w.returnBps],
    subsidyPerPilgrim: w.subsidyPerPilgrim.toString(),
    waitlistDeposits: w.waitlistDeposits.toString(),
    salt: '0x' + w.salt.toString(16),
  };
}

/** Deep-copies public params with one scenario field overridden (used by sensitivity sweeps). */
export function withScenario(
  pub: PublicParams,
  index: number,
  patch: Partial<PublicParams['scenarios'][number]>,
): PublicParams {
  return {
    ...pub,
    scenarios: pub.scenarios.map((s, i) => (i === index ? { ...s, ...patch, haircutBps: [...(patch.haircutBps ?? s.haircutBps)] } : { ...s, haircutBps: [...s.haircutBps] })),
  };
}

/** Formats Rp ribu as "Rp 171.60 T". */
export function formatTrillion(ribu: bigint | number): string {
  const t = Number(ribu) / 1e9;
  return `Rp ${t.toFixed(2)} T`;
}
