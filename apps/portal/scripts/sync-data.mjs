// Copies the verification key and evaluation results into public/ so the static
// portal can serve them. Proof bundles are written by `pnpm fixtures` (packages/prover).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const pub = join(root, 'apps/portal/public');
mkdirSync(join(pub, 'results'), { recursive: true });

const copy = (from, to) => {
  if (!existsSync(from)) return console.warn(`skip (missing): ${from}`);
  copyFileSync(from, to);
};
copy(join(root, 'circuits/hajj_solvency/target/vk_evm'), join(pub, 'vk_evm'));
for (const f of ['stress.json', 'benchmark.json', 'der.json', 'sr-heatmap.svg']) {
  copy(join(root, 'evaluation/results', f), join(pub, 'results', f));
}
