/**
 * Verifies a published proof bundle with Barretenberg. Needs only the bundle and
 * the committed circuit artifact, no private data:
 *   pnpm --filter @hajj-zk/prover verify --proof proof.json
 */
import { readFileSync } from 'node:fs';
import { fromBundle, type ProofBundle } from '../bundle.js';
import { destroyBarretenberg } from '../encoding.js';
import { SolvencyProver } from '../prover.js';
import { arg } from './args.js';

const bundle: ProofBundle = JSON.parse(readFileSync(arg('proof'), 'utf8'));
const t0 = performance.now();
const ok = await new SolvencyProver().verify(fromBundle(bundle));
console.log(`period ${bundle.periodId}: proof ${ok ? 'VALID' : 'INVALID'} (${(performance.now() - t0).toFixed(0)} ms)`);
if (ok) for (const s of bundle.result.scenarios) console.log(`  ${s.name.padEnd(9)} SR >= tau: ${s.pass}`);
await destroyBarretenberg();
process.exit(ok ? 0 : 1);
