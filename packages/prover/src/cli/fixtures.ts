/**
 * Generates proof bundles for the three synthetic fund states. They are used by
 * the Foundry tests (real proof through HonkVerifier) and by the portal demo.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toBundle } from '../bundle.js';
import { destroyBarretenberg } from '../encoding.js';
import { CONTRACTS_DIR, REPO_ROOT } from '../paths.js';
import { buildInputs, loadLedger, loadPublicParams, witnessFromLedger } from '../pipeline.js';
import { SolvencyProver } from '../prover.js';

const pub = loadPublicParams();
const prover = new SolvencyProver();
const dirs = [join(CONTRACTS_DIR, 'test/fixtures'), join(REPO_ROOT, 'apps/portal/public/proofs')];
for (const d of dirs) mkdirSync(d, { recursive: true });

// Fixed salts keep fixtures reproducible in content (proof bytes are still randomised by ZK blinding).
const salts: Record<string, bigint> = { healthy: 0x1001n, strained: 0x2002n, deteriorating: 0x3003n };
const index: Array<{ state: string; file: string }> = [];
for (const [state, salt] of Object.entries(salts)) {
  const r = await prover.prove(await buildInputs(pub, witnessFromLedger(loadLedger(state), salt)));
  const bundle = toBundle(pub, r, prover.program.noir_version ?? 'unknown');
  for (const d of dirs) writeFileSync(join(d, `${state}.json`), JSON.stringify(bundle, null, 2) + '\n');
  index.push({ state, file: `${state}.json` });
  console.log(`${state}: ${bundle.result.scenarios.map((s) => (s.pass ? 'P' : 'F')).join('')} prove ${r.timings.proveMs.toFixed(0)} ms`);
}
writeFileSync(join(REPO_ROOT, 'apps/portal/public/proofs/index.json'), JSON.stringify(index, null, 2) + '\n');
await destroyBarretenberg();
