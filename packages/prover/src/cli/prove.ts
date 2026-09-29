/**
 * Proves a synthetic fund state end to end (dev attestor key):
 *   pnpm --filter @hajj-zk/prover prove --state strained --out proof.json
 */
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { computeFixed } from '@hajj-zk/solvency-model';
import { toBundle } from '../bundle.js';
import { destroyBarretenberg } from '../encoding.js';
import { buildInputs, loadLedger, loadPublicParams, witnessFromLedger } from '../pipeline.js';
import { SolvencyProver } from '../prover.js';
import { arg } from './args.js';

const state = arg('state', 'healthy');
const out = arg('out', `proof-${state}.json`);
const pub = loadPublicParams(process.argv.includes('--params') ? arg('params') : undefined);
const w = witnessFromLedger(loadLedger(state), BigInt('0x' + randomBytes(31).toString('hex')));

const prover = new SolvencyProver();
const r = await prover.prove(await buildInputs(pub, w));
const bundle = toBundle(pub, r, prover.program.noir_version ?? 'unknown');
writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n');
console.log(`state=${state} period=${pub.periodId}`);
for (const [i, s] of bundle.result.scenarios.entries())
  console.log(`  ${s.name.padEnd(9)} ${s.pass ? 'PASS' : 'FAIL'}  (model: ${computeFixed(pub, w)[i].pass ? 'PASS' : 'FAIL'})`);
console.log(`witness ${r.timings.witnessMs.toFixed(0)} ms, prove ${r.timings.proveMs.toFixed(0)} ms, proof ${r.proof.proof.length} bytes -> ${out}`);
await destroyBarretenberg();
