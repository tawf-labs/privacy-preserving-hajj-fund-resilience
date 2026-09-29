import type { BundleEntry, ProofBundle } from './types';

const base = import.meta.env.BASE_URL;

export async function loadBundles(): Promise<BundleEntry[]> {
  const idx: Array<{ state: string; file: string }> = await (await fetch(`${base}proofs/index.json`)).json();
  return Promise.all(
    idx.map(async ({ state, file }) => ({ state, bundle: (await (await fetch(`${base}proofs/${file}`)).json()) as ProofBundle })),
  );
}

export interface DerRow {
  state: string;
  positions: number;
  auditBytes: number;
  aggregateBytes: number;
  proofBundleBytes: number;
  witnessDerivedBytes: number;
  derLimiting: number;
  derConservative: number;
  derAggregateReport: number;
}

export interface StressRow {
  state: string;
  scenario: string;
  assetsTrillionIdr: number;
  obligationsTrillionIdr: number;
  srFixedBps: string;
  passCircuit: boolean;
}

export async function loadResults() {
  const get = async <T,>(f: string): Promise<T | null> => {
    try {
      const r = await fetch(`${base}results/${f}`);
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const [der, stress, bench] = await Promise.all([
    get<{ rows: DerRow[] }>('der.json'),
    get<{ rows: StressRow[]; falseAssuranceUnderBaselineOnly: string[] }>('stress.json'),
    get<{
      circuit: { gates: number; gatesDyadic: number; acirOpcodes: number; verificationKeyBytes: number };
      performance: { proveMs: { avg: number }; verifyMs: { avg: number }; proofBytes: number };
      onChain: { submitProof?: number };
    }>('benchmark.json'),
  ]);
  return { der, stress, bench };
}
