/** Mirrors packages/prover/src/bundle.ts (kept dependency-free for the browser). */
export interface ScenarioParams {
  name: string;
  inflationBps: number;
  fxIdrPerSar: number;
  discountBps: number;
  yieldShockBps: number;
  haircutBps: number[];
}

export interface PublicParams {
  periodId: number;
  fxBaseIdrPerSar: number;
  quota: number;
  sarShareBps: number;
  tauBps: number;
  scenarios: ScenarioParams[];
}

export interface ProofBundle {
  schema: 'hajj-zk/proof-bundle@1';
  circuit: string;
  noirVersion: string;
  backend: string;
  verifierTarget: 'evm';
  periodId: number;
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

export interface BundleEntry {
  state: string;
  bundle: ProofBundle;
}
