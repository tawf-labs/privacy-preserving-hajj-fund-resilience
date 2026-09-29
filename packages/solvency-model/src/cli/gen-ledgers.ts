/**
 * Generates the synthetic position-level ledgers (data/synthetic/ledgers/<state>.json)
 * from data/synthetic/fund-states.json. Deterministic: same seed, same ledger.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePositions, type ClassTarget, type Ledger } from '../ledger.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataDir = join(root, 'data/synthetic');
const states = JSON.parse(readFileSync(join(dataDir, 'fund-states.json'), 'utf8')).states as Array<{
  id: string;
  seed: number;
  waitlistPilgrims: number;
  waitlistDeposits: string;
  subsidyPerPilgrim: string;
  classes: ClassTarget[];
}>;
const pub = JSON.parse(readFileSync(join(dataDir, 'public-params.json'), 'utf8'));

mkdirSync(join(dataDir, 'ledgers'), { recursive: true });
const asOf = '2026-12-31';
for (const s of states) {
  const ledger: Ledger = {
    fundId: 'BPKH-SYNTHETIC',
    periodId: pub.periodId,
    asOf,
    currency: 'IDR_thousand',
    positions: generatePositions(s.classes, s.seed, asOf),
    liabilities: {
      waitlistDeposits: s.waitlistDeposits,
      waitlistPilgrims: s.waitlistPilgrims,
      subsidyPerPilgrim: s.subsidyPerPilgrim,
    },
  };
  const out = join(dataDir, 'ledgers', `${s.id}.json`);
  writeFileSync(out, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`${s.id}: ${ledger.positions.length} positions -> ${out}`);
}
