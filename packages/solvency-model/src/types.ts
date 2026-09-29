/** One stress regime. All rates in basis points; FX in whole rupiah per riyal. */
export interface ScenarioParams {
  name: string;
  inflationBps: number;
  fxIdrPerSar: number;
  discountBps: number;
  yieldShockBps: number;
  /** Realisation haircut per asset class, same order as ASSET_CLASSES. */
  haircutBps: number[];
}

/**
 * Public inputs (paper Table: V5-V9). Set by external authorities, pinned on-chain
 * per period by the regulator, and attested before entering the circuit.
 */
export interface PublicParams {
  periodId: number;
  fxBaseIdrPerSar: number;
  /** Annual departures (Kemenag quota). */
  quota: number;
  /** Share of the per-pilgrim cost denominated in SAR. */
  sarShareBps: number;
  /** Statutory solvency threshold tau, e.g. 10_000 = SR >= 1.00. */
  tauBps: number;
  scenarios: ScenarioParams[];
}

/**
 * Private witness (paper Table: V1-V4). Never leaves the attestor/prover boundary.
 * Money in Rp ribu (thousands of rupiah).
 */
export interface PrivateWitness {
  holdings: bigint[];
  returnBps: number[];
  /** Nilai manfaat (subsidy from investment yield) per departing pilgrim. */
  subsidyPerPilgrim: bigint;
  /** Setoran awal held for pilgrims in the waiting queue; payable on demand. */
  waitlistDeposits: bigint;
  /** Blinding factor for the witness commitment. */
  salt: bigint;
}

export interface ScenarioResult {
  name: string;
  /** Realisable asset value F_s (liquid after haircut + PV of stressed income). */
  assets: bigint;
  liquidAssets: bigint;
  pvIncome: bigint;
  /** Present value of obligations PVO_s (waitlist + PV of subsidy stream). */
  obligations: bigint;
  pvSubsidy: bigint;
  /** SR_s in basis points (floor). Informational only: never published. */
  ratioBps: bigint;
  pass: boolean;
}

export interface FloatScenarioResult {
  name: string;
  assets: number;
  obligations: number;
  ratio: number;
  pass: boolean;
}
