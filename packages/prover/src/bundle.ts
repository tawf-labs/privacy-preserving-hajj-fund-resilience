/*
 * The published proof bundle: everything a public verifier needs, nothing more.
 * This is D_disclosed in the DER metric. It contains no private witness data.
 */
import type { ProofData } from '@aztec/bb.js';
import type { PublicParams } from '@hajj-zk/solvency-model';
import { PUBLIC_INPUT_LAYOUT } from './encoding.js';
import { VERIFIER_TARGET, type ProveResult } from './prover.js';

export interface ProofBundle {
  schema: 'hajj-zk/proof-bundle@1';
  circuit: 'hajj_solvency';
  noirVersion: string;
  backend: 'barretenberg-ultrahonk';
  verifierTarget: typeof VERIFIER_TARGET;
  periodId: number;
  /** Public macro assumptions (already public; included for readability). */
  publicParams: PublicParams;
  result: {
    scenarios: Array<{ name: string; pass: boolean }>;
    statementId: `0x${string}`;
    commitment: `0x${string}`;
    attestorKeyHash: `0x${string}`;
  };
  proof: `0x${string}`;
  publicInputs: `0x${string}`[];
}

const hex = (b: Uint8Array): `0x${string}` => `0x${Buffer.from(b).toString('hex')}`;
const h32 = (x: bigint): `0x${string}` => `0x${x.toString(16).padStart(64, '0')}`;

export function toBundle(pub: PublicParams, r: ProveResult, noirVersion: string): ProofBundle {
  return {
    schema: 'hajj-zk/proof-bundle@1',
    circuit: 'hajj_solvency',
    noirVersion,
    backend: 'barretenberg-ultrahonk',
    verifierTarget: VERIFIER_TARGET,
    periodId: pub.periodId,
    publicParams: pub,
    result: {
      scenarios: pub.scenarios.map((s, i) => ({ name: s.name, pass: r.resultBits[i] })),
      statementId: h32(r.statementId),
      commitment: h32(r.commitment),
      attestorKeyHash: r.proof.publicInputs[PUBLIC_INPUT_LAYOUT.index.attestor_key_hash] as `0x${string}`,
    },
    proof: hex(r.proof.proof),
    publicInputs: r.proof.publicInputs as `0x${string}`[],
  };
}

export function fromBundle(b: ProofBundle): ProofData {
  return { proof: Uint8Array.from(Buffer.from(b.proof.slice(2), 'hex')), publicInputs: b.publicInputs };
}
