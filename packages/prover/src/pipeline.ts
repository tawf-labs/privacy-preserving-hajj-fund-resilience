/*
 * End-to-end helper used by tests, the CLI and the evaluation harness:
 * ledger -> (attestor) witness + signature -> circuit inputs -> proof.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aggregateLedger,
  type Ledger,
  type PrivateWitness,
  type PublicParams,
} from '@hajj-zk/solvency-model';
import {
  attestationMessage,
  commitWitness,
  paramsHash,
  publicKeyFromSecret,
  signMessage,
  toCircuitInputs,
  type Attestation,
} from './encoding.js';
import { DATA_DIR } from './paths.js';

export function loadPublicParams(path = join(DATA_DIR, 'public-params.json')): PublicParams {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadLedger(stateId: string): Ledger {
  return JSON.parse(readFileSync(join(DATA_DIR, 'ledgers', `${stateId}.json`), 'utf8'));
}

export function witnessFromLedger(ledger: Ledger, salt: bigint): PrivateWitness {
  const agg = aggregateLedger(ledger);
  return {
    holdings: agg.holdings,
    returnBps: agg.returnBps,
    subsidyPerPilgrim: BigInt(ledger.liabilities.subsidyPerPilgrim),
    waitlistDeposits: BigInt(ledger.liabilities.waitlistDeposits),
    salt,
  };
}

/**
 * Deterministic development attestor key. NOT a secret: it exists so tests,
 * fixtures and the evaluation are reproducible. Production keys live in the TEE.
 */
export const DEV_ATTESTOR_SECRET = Uint8Array.from(Buffer.from('4ba1c5b1d1e0b2a7c3f5e6d7c8b9a0f1e2d3c4b5a69788796a5b4c3d2e1f0a1b', 'hex'));

/** Signs exactly what the circuit's verify_attestation expects. */
export async function attest(pub: PublicParams, w: PrivateWitness, secret = DEV_ATTESTOR_SECRET): Promise<Attestation> {
  const msg = await attestationMessage(await commitWitness(w), await paramsHash(pub), pub.periodId);
  return { publicKey: publicKeyFromSecret(secret), signature: signMessage(secret, msg) };
}

export async function buildInputs(pub: PublicParams, w: PrivateWitness, secret = DEV_ATTESTOR_SECRET) {
  return toCircuitInputs(pub, w, await attest(pub, w, secret));
}
