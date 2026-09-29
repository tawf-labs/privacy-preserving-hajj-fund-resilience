/*
 * Data Exposure Reduction (paper Section 3.3.5):
 *
 *     DER = (1 - D_disclosed / D_total) x 100 %
 *
 * D_total       bytes of sensitive data a conventional full-disclosure audit would publish.
 * D_disclosed   bytes of sensitive-derived data actually published under the artifact.
 *
 * The paper defines the limiting case (private witness contributes zero bytes). We report the
 * limiting case AND a conservative accounting that also charges every byte that is derived from
 * the private witness (commitment, statement id, result bits), so the headline is not flattering.
 * We also report the naive "all published bytes" ratio, which counts the proof itself, to be honest
 * about the size of the artifact: the proof is public but carries no witness information.
 */
import { aggregateLedger, ASSET_CLASSES, type Ledger } from '@hajj-zk/solvency-model';
import { buildInputs, loadLedger, loadPublicParams, SolvencyProver, toBundle, witnessFromLedger, destroyBarretenberg } from '@hajj-zk/prover';
import { mdTable, pct, STATES, writeResult, type StateId } from './common.js';

const enc = new TextEncoder();
const bytes = (v: unknown) => enc.encode(JSON.stringify(v)).length;

/** Every sensitive datum a conventional audit would publish: position-level ledger and liabilities. */
export function fullAuditPackage(ledger: Ledger) {
  return { positions: ledger.positions, liabilities: ledger.liabilities };
}

/** An aggregate annual-report style disclosure: class totals, weighted returns, liabilities. */
export function aggregateDisclosure(ledger: Ledger) {
  const agg = aggregateLedger(ledger);
  return {
    classes: ASSET_CLASSES.map((c, i) => ({ id: c.id, total: agg.holdings[i].toString(), returnBps: agg.returnBps[i] })),
    liabilities: ledger.liabilities,
  };
}

/** Counts scalar leaf fields in a JSON value. */
export function countFields(v: unknown): number {
  if (v === null || typeof v !== 'object') return 1;
  return Object.values(v as object).reduce<number>((a, x) => a + countFields(x), 0);
}

export interface DerRow {
  state: StateId;
  positions: number;
  auditBytes: number;
  auditFields: number;
  aggregateBytes: number;
  proofBundleBytes: number;
  proofBytes: number;
  publicParamBytes: number;
  /** Bytes derived from the private witness that the bundle publishes (conservative). */
  witnessDerivedBytes: number;
  derLimiting: number;
  derConservative: number;
  derAggregateReport: number;
  derAllPublishedBytes: number;
  fieldLevel: { sensitiveFields: number; sensitiveFieldsDisclosed: number; derField: number };
  variableLevel: { privateVars: number; privateVarsDisclosed: number; publicVars: number };
}

export async function runDer() {
  const pub = loadPublicParams();
  const prover = new SolvencyProver();
  const rows: DerRow[] = [];

  for (const state of STATES) {
    const ledger = loadLedger(state);
    const audit = fullAuditPackage(ledger);
    const dTotal = bytes(audit);
    const r = await prover.prove(await buildInputs(pub, witnessFromLedger(ledger, 0x77n)));
    const bundle = toBundle(pub, r, 'x');

    const proofBytes = r.proof.proof.length;
    const publicParamBytes = bytes(pub);
    const bundleBytes = bytes(bundle);

    // Witness-derived bytes: commitment (32) + statement id (32) + 3 result bits packed in 1 byte.
    const derived = 32 + 32 + 1;
    const disclosedConservative = derived;
    const disclosedLimiting = 1; // 3 result bits only

    const sensitiveFields = countFields(audit);
    // Fields whose value is disclosed in any form: none; 3 boolean outcomes derived from them.
    const fieldsDisclosed = 0;

    rows.push({
      state,
      positions: ledger.positions.length,
      auditBytes: dTotal,
      auditFields: sensitiveFields,
      aggregateBytes: bytes(aggregateDisclosure(ledger)),
      proofBundleBytes: bundleBytes,
      proofBytes,
      publicParamBytes,
      witnessDerivedBytes: derived,
      derLimiting: 1 - disclosedLimiting / dTotal,
      derConservative: 1 - disclosedConservative / dTotal,
      derAggregateReport: 1 - bytes(aggregateDisclosure(ledger)) / dTotal,
      derAllPublishedBytes: 1 - bundleBytes / dTotal,
      fieldLevel: { sensitiveFields, sensitiveFieldsDisclosed: fieldsDisclosed, derField: 1 - fieldsDisclosed / sensitiveFields },
      variableLevel: { privateVars: 4, privateVarsDisclosed: 0, publicVars: 5 + 2 },
    });
  }

  await destroyBarretenberg();
  const result = { generatedAt: new Date().toISOString(), rows };
  writeResult('der.json', result);
  writeResult('der.md', renderMarkdown(rows));
  return result;
}

function renderMarkdown(rows: DerRow[]): string {
  const t = mdTable(
    ['Fund state', 'Positions', 'D_total: full audit (B)', 'Aggregate report (B)', 'Proof bundle (B)', 'DER: limiting', 'DER: conservative', 'DER: aggregate report', 'DER: all bundle bytes'],
    rows.map((r) => [
      r.state,
      r.positions,
      r.auditBytes.toLocaleString('en-US'),
      r.aggregateBytes.toLocaleString('en-US'),
      r.proofBundleBytes.toLocaleString('en-US'),
      pct(r.derLimiting, 3),
      pct(r.derConservative, 3),
      pct(r.derAggregateReport, 2),
      pct(r.derAllPublishedBytes, 2),
    ]),
  );
  const f = mdTable(
    ['Fund state', 'Sensitive fields in a full audit', 'Sensitive fields disclosed', 'Field-level DER', 'Private variables (V1-V4) disclosed'],
    rows.map((r) => [r.state, r.fieldLevel.sensitiveFields, r.fieldLevel.sensitiveFieldsDisclosed, pct(r.fieldLevel.derField, 1), `${r.variableLevel.privateVarsDisclosed} / ${r.variableLevel.privateVars}`]),
  );
  return `# Data Exposure Reduction (DER)

\`DER = (1 - D_disclosed / D_total) x 100 %\`

* **D_total**: JSON bytes of the sensitive data a conventional full-disclosure audit publishes
  (every position with issuer, custodian, market value, return, maturity; plus liabilities).
* **Limiting case** (paper definition): the only witness-derived output is the 3 result bits (1 byte).
* **Conservative**: also charges the witness commitment (32 B) and statement id (32 B): 65 B.
* **Aggregate report**: an annual-report style disclosure (class totals, weighted returns, liabilities),
  the middle ground institutions use today.
* **All bundle bytes**: charges the entire published proof bundle, including the ~9 KB proof and the
  public parameters. The proof carries no witness information, so this is a worst-case size ratio,
  not a leakage measure. It is reported for transparency.

${t}

## Field level

${f}

## Reading the numbers

* Under the paper's limiting-case definition the private witness contributes **zero** disclosed bytes; the
  1 B figure is the three regime outcomes, which are the intended public statement.
* The conservative DER (still > 99.7 % for a 126-150 position ledger) is the number to quote.
* DER grows with ledger size while the proof bundle stays constant, so the reduction is larger for the real fund.
* DER measures volume, not information content. It does not claim the 3 result bits (plus the fact that the
  fund chose to publish) reveal nothing: they reveal exactly the statement SR >= tau per regime.

Source data are synthetic ledgers under \`data/synthetic/ledgers\`.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runDer();
  for (const x of r.rows) console.log(`${x.state.padEnd(14)} audit ${x.auditBytes} B  bundle ${x.proofBundleBytes} B  DER(conservative) ${pct(x.derConservative, 3)}  DER(limiting) ${pct(x.derLimiting, 3)}`);
}
