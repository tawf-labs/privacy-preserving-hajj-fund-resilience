/*
 * Financial stress test (paper Section IV-A).
 *
 *  1. SR_s for three synthetic fund states x three regimes (float model, fixed-point model,
 *     and the bit the ZK circuit actually publishes; a proof is generated and verified per state).
 *  2. What a single-point baseline valuation would have certified (J1).
 *  3. SR sensitivity heatmap over inflation x rupiah depreciation in the Acute regime.
 */
import {
  aggregateLedger,
  computeFixed,
  computeFloat,
  withScenario,
  type PrivateWitness,
} from '@hajj-zk/solvency-model';
import {
  buildInputs,
  destroyBarretenberg,
  loadLedger,
  loadPublicParams,
  SolvencyProver,
  witnessFromLedger,
} from '@hajj-zk/prover';
import { fixed, mdTable, STATES, writeResult, type StateId } from './common.js';

const pub = loadPublicParams();

export interface StressRow {
  state: StateId;
  scenario: string;
  assetsTrillionIdr: number;
  obligationsTrillionIdr: number;
  srFloat: number;
  srFixedBps: string;
  passModel: boolean;
  passCircuit: boolean;
  proofVerified: boolean;
}

const T = 1e9; // Rp ribu -> Rp triliun

export async function runStress() {
  const prover = new SolvencyProver();
  const rows: StressRow[] = [];

  for (const state of STATES) {
    const w: PrivateWitness = witnessFromLedger(loadLedger(state), 0xabcdn);
    const fx = computeFixed(pub, w);
    const fl = computeFloat(pub, w);
    const proved = await prover.prove(await buildInputs(pub, w));
    const verified = await prover.verify(proved.proof);
    for (let s = 0; s < pub.scenarios.length; s++) {
      rows.push({
        state,
        scenario: pub.scenarios[s].name,
        assetsTrillionIdr: Number(fx[s].assets) / T,
        obligationsTrillionIdr: Number(fx[s].obligations) / T,
        srFloat: fl[s].ratio,
        srFixedBps: fx[s].ratioBps.toString(),
        passModel: fx[s].pass,
        passCircuit: proved.resultBits[s],
        proofVerified: verified,
      });
    }
  }

  const allAgree = rows.every((r) => r.passModel === r.passCircuit && r.proofVerified);

  // J1: what a single-point (baseline-only) valuation certifies vs regime-aware verification.
  const byState = Object.fromEntries(STATES.map((s) => [s, rows.filter((r) => r.state === s)]));
  const baselineOnly = STATES.filter((s) => byState[s][0].passCircuit);
  const allRegimes = STATES.filter((s) => byState[s].every((r) => r.passCircuit));
  const falseAssurance = baselineOnly.filter((s) => !allRegimes.includes(s));

  // Sensitivity: strained fund, Acute haircuts / discount / yield shock, vary inflation x depreciation.
  const strained = witnessFromLedger(loadLedger('strained'), 1n);
  const inflations = Array.from({ length: 13 }, (_, i) => i * 100); // 0-12 %
  const depreciations = Array.from({ length: 11 }, (_, i) => i * 5); // 0-50 %
  const grid: number[][] = depreciations.map((dep) =>
    inflations.map((infl) => {
      const fxIdr = Math.round(pub.fxBaseIdrPerSar * (1 + dep / 100));
      const p = withScenario(pub, 2, { inflationBps: infl, fxIdrPerSar: fxIdr });
      return Number(computeFixed(p, strained)[2].ratioBps) / 1e4;
    }),
  );

  const csv = [
    ['depreciation_pct\\inflation_pct', ...inflations.map((i) => i / 100)].join(','),
    ...grid.map((row, r) => [depreciations[r], ...row.map((v) => v.toFixed(4))].join(',')),
  ].join('\n');

  const result = {
    generatedAt: new Date().toISOString(),
    tauBps: pub.tauBps,
    allAgree,
    rows,
    baselineOnlyCertified: baselineOnly,
    fullyResilient: allRegimes,
    falseAssuranceUnderBaselineOnly: falseAssurance,
    sensitivity: { fund: 'strained', regime: 'Acute', inflationsPct: inflations.map((i) => i / 100), depreciationsPct: depreciations, sr: grid },
  };

  writeResult('stress.json', result);
  writeResult('sr-heatmap.csv', csv + '\n');
  writeResult('sr-heatmap.svg', heatmapSvg(grid, inflations.map((i) => i / 100), depreciations, pub.tauBps / 1e4));
  writeResult('stress.md', renderMarkdown(result, rows));
  await destroyBarretenberg();
  return result;
}

function renderMarkdown(r: Awaited<ReturnType<typeof runStress>> | Record<string, unknown>, rows: StressRow[]): string {
  const res = r as Awaited<ReturnType<typeof runStress>>;
  const table = mdTable(
    ['Fund state', 'Regime', 'F (Rp T)', 'PVO (Rp T)', 'SR', 'SR >= 1.00 (model)', 'Circuit output', 'Proof verified'],
    rows.map((x) => [
      x.state,
      x.scenario,
      fixed(x.assetsTrillionIdr, 1),
      fixed(x.obligationsTrillionIdr, 1),
      fixed(Number(x.srFixedBps) / 1e4, 4),
      x.passModel ? 'PASS' : 'FAIL',
      x.passCircuit ? 'PASS' : 'FAIL',
      x.proofVerified ? 'yes' : 'no',
    ]),
  );
  return `# Financial stress test

Synthetic fund states, deterministic solvency model, tau = ${res.tauBps / 1e4}. Each state was proven with the
Noir circuit; the published bit for every regime equals the bit computed by the reference model
(${res.allAgree ? '**all 9 agree**' : '**MISMATCH**'}).

${table}

## Why regime-sensitive verification (J1)

A single-point, baseline-only valuation would have certified: **${res.baselineOnlyCertified.join(', ')}**.
Only **${res.fullyResilient.join(', ') || 'none'}** remain solvent in every regime.
Funds certified by the baseline alone that fail under stress: **${res.falseAssuranceUnderBaselineOnly.join(', ') || 'none'}**.

## Sensitivity

\`sr-heatmap.csv\` / \`sr-heatmap.svg\`: SR of the strained fund under Acute haircuts, discount rate and yield shock,
across inflation (0-12 %) and rupiah depreciation against the riyal (0-50 %). Red cells are below tau (insolvent), green cells at or above tau.

All figures are computed from synthetic data and are not BPKH data.
`;
}

/** Heatmap: red shades below tau, Tawf-green shades at or above it; cell values are printed. */
function heatmapSvg(grid: number[][], xs: number[], ys: number[], tau: number): string {
  const cell = 46;
  const left = 90;
  const top = 50;
  const w = left + xs.length * cell + 20;
  const h = top + ys.length * cell + 60;
  const flat = grid.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const color = (v: number) => {
    // below tau: sand -> red ; above tau: sand -> Tawf green
    if (v < tau) {
      const t = Math.min(1, (tau - v) / Math.max(1e-6, tau - lo));
      return `rgb(${Math.round(249 - t * 40)},${Math.round(246 - t * 170)},${Math.round(240 - t * 170)})`;
    }
    const t = Math.min(1, (v - tau) / Math.max(1e-6, hi - tau));
    return `rgb(${Math.round(249 - t * 234)},${Math.round(246 - t * 185)},${Math.round(240 - t * 192)})`;
  };
  let cells = '';
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      const x = left + c * cell;
      const y = top + r * cell;
      const dark = v >= tau ? Math.min(1, (v - tau) / Math.max(1e-6, hi - tau)) > 0.55 : Math.min(1, (tau - v) / Math.max(1e-6, tau - lo)) > 0.55;
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${color(v)}" stroke="#ffffff" stroke-width="1"/>`;
      cells += `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" text-anchor="middle" font-size="11" fill="${dark ? '#ffffff' : '#1a1a1a'}">${v.toFixed(2)}</text>`;
    }),
  );
  const xl = xs.map((x, c) => `<text x="${left + c * cell + cell / 2}" y="${top - 10}" text-anchor="middle" font-size="11" fill="#6b7280">${x}%</text>`).join('');
  const yl = ys.map((y, r) => `<text x="${left - 10}" y="${top + r * cell + cell / 2 + 4}" text-anchor="end" font-size="11" fill="#6b7280">${y}%</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="Inter, Arial, sans-serif">
<rect width="${w}" height="${h}" fill="#F9F6F0"/>
<text x="${left}" y="22" font-size="14" font-weight="600" fill="#0F3D30">Acute-regime SR of the strained fund (tau = ${tau.toFixed(2)})</text>
${xl}${yl}${cells}
<text x="${left + (xs.length * cell) / 2}" y="${top + ys.length * cell + 30}" text-anchor="middle" font-size="12" fill="#1a1a1a">Annual inflation</text>
<text transform="translate(20 ${top + (ys.length * cell) / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#1a1a1a">IDR depreciation vs SAR</text>
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runStress();
  console.log(`stress: ${r.rows.length} cells, circuit/model agreement: ${r.allAgree}`);
  console.log(`baseline-only would certify: ${r.baselineOnlyCertified.join(', ')}; resilient in all regimes: ${r.fullyResilient.join(', ')}`);
}
