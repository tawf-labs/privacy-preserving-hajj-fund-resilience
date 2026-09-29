/*
 * TypeScript mirror of circuits/hajj_solvency/src/attest.nr plus the mapping from
 * model types to the circuit ABI. Shared by the attestor (Layer 2), the prover
 * (Layer 3) and the evaluation harness.
 */
import { Barretenberg } from '@aztec/bb.js';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { N_ASSETS, N_SCENARIOS, type PrivateWitness, type PublicParams } from '@hajj-zk/solvency-model';
import type { InputMap } from '@noir-lang/noir_js';

export const STATEMENT_DOMAIN = 0x48414a4a2d5352n;

let bbPromise: Promise<Barretenberg> | null = null;

/** Lazily-initialised shared Barretenberg instance. */
export function getBarretenberg(): Promise<Barretenberg> {
  bbPromise ??= Barretenberg.new();
  return bbPromise;
}

export async function destroyBarretenberg(): Promise<void> {
  if (!bbPromise) return;
  const bb = await bbPromise;
  bbPromise = null;
  await bb.destroy();
}

export const toBytes32 = (x: bigint): Uint8Array => {
  const hex = x.toString(16).padStart(64, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
};
export const fromBytes = (b: Uint8Array): bigint => BigInt('0x' + Buffer.from(b).toString('hex'));
export const toHex32 = (x: bigint): `0x${string}` => `0x${x.toString(16).padStart(64, '0')}`;

/** Pedersen hash over BN254 field elements, identical to std::hash::pedersen_hash. */
export async function pedersen(fields: bigint[]): Promise<bigint> {
  const bb = await getBarretenberg();
  const { hash } = await bb.pedersenHash({ inputs: fields.map(toBytes32), hashIndex: 0 });
  return fromBytes(hash);
}

export async function commitWitness(w: PrivateWitness): Promise<bigint> {
  return pedersen([...w.holdings, ...w.returnBps.map(BigInt), w.subsidyPerPilgrim, w.waitlistDeposits, w.salt]);
}

export function paramsFields(pub: PublicParams): bigint[] {
  const xs: bigint[] = [pub.periodId, pub.fxBaseIdrPerSar, pub.quota, pub.sarShareBps, pub.tauBps].map(BigInt);
  for (const s of pub.scenarios) {
    xs.push(BigInt(s.inflationBps), BigInt(s.fxIdrPerSar), BigInt(s.discountBps), BigInt(s.yieldShockBps));
    xs.push(...s.haircutBps.map(BigInt));
  }
  return xs;
}

export async function paramsHash(pub: PublicParams): Promise<bigint> {
  return pedersen(paramsFields(pub));
}

export interface AttestorPublicKey {
  x: Uint8Array;
  y: Uint8Array;
}

export function publicKeyFromSecret(secret: Uint8Array): AttestorPublicKey {
  const pk = secp256k1.getPublicKey(secret, false); // 0x04 || X || Y
  return { x: pk.slice(1, 33), y: pk.slice(33, 65) };
}

export async function keyHash(pk: AttestorPublicKey): Promise<bigint> {
  const pack = (b: Uint8Array) => fromBytes(b);
  return pedersen([pack(pk.x.slice(0, 16)), pack(pk.x.slice(16)), pack(pk.y.slice(0, 16)), pack(pk.y.slice(16))]);
}

export async function attestationMessage(commitment: bigint, params: bigint, periodId: number): Promise<Uint8Array> {
  return toBytes32(await pedersen([commitment, params, BigInt(periodId)]));
}

export async function statementId(commitment: bigint, periodId: number): Promise<bigint> {
  return pedersen([STATEMENT_DOMAIN, commitment, BigInt(periodId)]);
}

/** Compact (r || s), low-s secp256k1 signature over the raw 32-byte message. */
export function signMessage(secret: Uint8Array, message: Uint8Array): Uint8Array {
  return secp256k1.sign(message, secret, { prehash: false, lowS: true, format: 'compact' });
}

export function verifyMessage(pk: AttestorPublicKey, message: Uint8Array, sig: Uint8Array): boolean {
  const full = new Uint8Array(65);
  full[0] = 4;
  full.set(pk.x, 1);
  full.set(pk.y, 33);
  return secp256k1.verify(sig, message, full, { prehash: false, lowS: true, format: 'compact' });
}

export interface Attestation {
  publicKey: AttestorPublicKey;
  signature: Uint8Array;
}

const u64 = (x: bigint | number) => BigInt(x).toString();
const bytes = (b: Uint8Array) => Array.from(b, (v) => v.toString());

/** Builds the Noir ABI input map. Field order is irrelevant here; noir_js encodes by name. */
export async function toCircuitInputs(pub: PublicParams, w: PrivateWitness, att: Attestation): Promise<InputMap> {
  if (pub.scenarios.length !== N_SCENARIOS) throw new Error(`need ${N_SCENARIOS} scenarios`);
  if (w.holdings.length !== N_ASSETS) throw new Error(`need ${N_ASSETS} holdings`);
  return {
    holdings: w.holdings.map(u64),
    return_bps: w.returnBps.map(u64),
    subsidy_per_pilgrim: u64(w.subsidyPerPilgrim),
    waitlist_deposits: u64(w.waitlistDeposits),
    salt: toHex32(w.salt),
    attestor_pk_x: bytes(att.publicKey.x),
    attestor_pk_y: bytes(att.publicKey.y),
    attestation_sig: bytes(att.signature),
    period_id: u64(pub.periodId),
    fx_base: u64(pub.fxBaseIdrPerSar),
    quota: u64(pub.quota),
    sar_share_bps: u64(pub.sarShareBps),
    tau_bps: u64(pub.tauBps),
    inflation_bps: pub.scenarios.map((s) => u64(s.inflationBps)),
    fx_idr_per_sar: pub.scenarios.map((s) => u64(s.fxIdrPerSar)),
    discount_bps: pub.scenarios.map((s) => u64(s.discountBps)),
    yield_shock_bps: pub.scenarios.map((s) => u64(s.yieldShockBps)),
    haircut_bps: pub.scenarios.map((s) => s.haircutBps.map(u64)),
    attestor_key_hash: toHex32(await keyHash(att.publicKey)),
  };
}

/**
 * Flattened public-input layout as it appears in `proof.publicInputs` and in the
 * Solidity verifier: declared public parameters first, then return values.
 */
export const PUBLIC_INPUT_LAYOUT = (() => {
  const names: string[] = ['period_id', 'fx_base', 'quota', 'sar_share_bps', 'tau_bps'];
  for (const k of ['inflation_bps', 'fx_idr_per_sar', 'discount_bps', 'yield_shock_bps'])
    for (let s = 0; s < N_SCENARIOS; s++) names.push(`${k}[${s}]`);
  for (let s = 0; s < N_SCENARIOS; s++) for (let i = 0; i < N_ASSETS; i++) names.push(`haircut_bps[${s}][${i}]`);
  names.push('attestor_key_hash');
  const paramCount = names.length;
  for (let s = 0; s < N_SCENARIOS; s++) names.push(`result_bits[${s}]`);
  names.push('statement_id', 'commitment');
  return {
    names,
    paramCount,
    index: Object.fromEntries(names.map((n, i) => [n, i])) as Record<string, number>,
  };
})();

/** Public parameters as the flat field array the registry pins (first `paramCount` inputs). */
export async function expectedPublicParams(pub: PublicParams, attestorKeyHash: bigint): Promise<bigint[]> {
  const xs: bigint[] = [pub.periodId, pub.fxBaseIdrPerSar, pub.quota, pub.sarShareBps, pub.tauBps].map(BigInt);
  xs.push(...pub.scenarios.map((s) => BigInt(s.inflationBps)));
  xs.push(...pub.scenarios.map((s) => BigInt(s.fxIdrPerSar)));
  xs.push(...pub.scenarios.map((s) => BigInt(s.discountBps)));
  xs.push(...pub.scenarios.map((s) => BigInt(s.yieldShockBps)));
  for (const s of pub.scenarios) xs.push(...s.haircutBps.map(BigInt));
  xs.push(attestorKeyHash);
  return xs;
}
