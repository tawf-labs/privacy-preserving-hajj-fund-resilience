# Data Exposure Reduction (DER)

`DER = (1 - D_disclosed / D_total) x 100 %`

* **D_total**: JSON bytes of the sensitive data a conventional full-disclosure audit publishes
  (every position with issuer, custodian, market value, return, maturity; plus liabilities).
* **Limiting case** (paper definition): the only witness-derived output is the 3 result bits (1 byte).
* **Conservative**: also charges the witness commitment (32 B) and statement id (32 B): 65 B.
* **Aggregate report**: an annual-report style disclosure (class totals, weighted returns, liabilities),
  the middle ground institutions use today.
* **All bundle bytes**: charges the entire published proof bundle, including the ~9 KB proof and the
  public parameters. The proof carries no witness information, so this is a worst-case size ratio,
  not a leakage measure. It is reported for transparency.

| Fund state | Positions | D_total: full audit (B) | Aggregate report (B) | Proof bundle (B) | DER: limiting | DER: conservative | DER: aggregate report | DER: all bundle bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| healthy | 150 | 35,981 | 460 | 22,202 | 99.997% | 99.819% | 98.72% | 38.30% |
| strained | 138 | 33,643 | 461 | 22,203 | 99.997% | 99.807% | 98.63% | 34.00% |
| deteriorating | 126 | 30,612 | 462 | 22,204 | 99.997% | 99.788% | 98.49% | 27.47% |

## Field level

| Fund state | Sensitive fields in a full audit | Sensitive fields disclosed | Field-level DER | Private variables (V1-V4) disclosed |
| --- | --- | --- | --- | --- |
| healthy | 1353 | 0 | 100.0% | 0 / 4 |
| strained | 1245 | 0 | 100.0% | 0 / 4 |
| deteriorating | 1137 | 0 | 100.0% | 0 / 4 |

## Reading the numbers

* Under the paper's limiting-case definition the private witness contributes **zero** disclosed bytes; the
  1 B figure is the three regime outcomes, which are the intended public statement.
* The conservative DER (still > 99.7 % for a 126-150 position ledger) is the number to quote.
* DER grows with ledger size while the proof bundle stays constant, so the reduction is larger for the real fund.
* DER measures volume, not information content. It does not claim the 3 result bits (plus the fact that the
  fund chose to publish) reveal nothing: they reveal exactly the statement SR >= tau per regime.

Source data are synthetic ledgers under `data/synthetic/ledgers`.
