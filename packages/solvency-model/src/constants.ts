/** Fixed-point scale: all rates are expressed in basis points (1.0000 = 10_000). */
export const S = 10_000n;

/** Number of asset classes carried into the circuit as private witness. */
export const N_ASSETS = 6;

/** Number of stress regimes evaluated per proof (Baseline, Moderate, Acute). */
export const N_SCENARIOS = 3;

/** Projection horizon in years. Must match `global H` in circuits/hajj_solvency/src/model.nr. */
export const DEFAULT_HORIZON = 10;

export const ASSET_CLASSES = [
  { id: 'sbsn', label: 'Sovereign sukuk (SBSN)' },
  { id: 'corporate_sukuk', label: 'Corporate sukuk' },
  { id: 'sharia_deposits', label: 'Sharia bank deposits' },
  { id: 'direct_investment', label: 'Direct investment' },
  { id: 'gold', label: 'Gold' },
  { id: 'cash', label: 'Cash & current accounts' },
] as const;

export type AssetClassId = (typeof ASSET_CLASSES)[number]['id'];

export const SCENARIO_NAMES = ['Baseline', 'Moderate', 'Acute'] as const;

/**
 * Input bounds enforced identically by the circuit (see `validate` in model.nr).
 * Money is denominated in thousands of rupiah (Rp ribu).
 */
export const BOUNDS = {
  maxHolding: 1n << 50n, // ~Rp 1.1 quintillion; far above any real fund
  maxSubsidy: 1n << 36n,
  maxWaitlist: 1n << 50n,
  maxQuota: 1n << 24n,
  maxFx: 1n << 32n,
  maxFxRatioBps: 10n * S, // a scenario may shock FX by at most 10x
} as const;
