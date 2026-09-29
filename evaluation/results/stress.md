# Financial stress test

Synthetic fund states, deterministic solvency model, tau = 1. Each state was proven with the
Noir circuit; the published bit for every regime equals the bit computed by the reference model
(**all 9 agree**).

| Fund state | Regime | F (Rp T) | PVO (Rp T) | SR | SR >= 1.00 (model) | Circuit output | Proof verified |
| --- | --- | --- | --- | --- | --- | --- | --- |
| healthy | Baseline | 288.4 | 197.6 | 1.4593 | PASS | PASS | yes |
| healthy | Moderate | 269.2 | 207.0 | 1.3005 | PASS | PASS | yes |
| healthy | Acute | 235.7 | 231.7 | 1.0175 | PASS | PASS | yes |
| strained | Baseline | 249.8 | 209.8 | 1.1904 | PASS | PASS | yes |
| strained | Moderate | 231.2 | 221.0 | 1.0459 | PASS | PASS | yes |
| strained | Acute | 198.6 | 250.5 | 0.7927 | FAIL | FAIL | yes |
| deteriorating | Baseline | 228.4 | 220.0 | 1.0381 | PASS | PASS | yes |
| deteriorating | Moderate | 209.9 | 232.7 | 0.9021 | FAIL | FAIL | yes |
| deteriorating | Acute | 177.5 | 266.2 | 0.6668 | FAIL | FAIL | yes |

## Why regime-sensitive verification (J1)

A single-point, baseline-only valuation would have certified: **healthy, strained, deteriorating**.
Only **healthy** remain solvent in every regime.
Funds certified by the baseline alone that fail under stress: **strained, deteriorating**.

## Sensitivity

`sr-heatmap.csv` / `sr-heatmap.svg`: SR of the strained fund under Acute haircuts, discount rate and yield shock,
across inflation (0-12 %) and rupiah depreciation against the riyal (0-50 %). Red cells are below tau (insolvent), green cells at or above tau.

All figures are computed from synthetic data and are not BPKH data.
