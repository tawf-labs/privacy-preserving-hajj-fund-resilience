import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const CIRCUIT_DIR = join(REPO_ROOT, 'circuits/hajj_solvency');
export const CIRCUIT_ARTIFACT = join(CIRCUIT_DIR, 'target/hajj_solvency.json');
export const VK_PATH = join(CIRCUIT_DIR, 'target/vk_evm');
export const DATA_DIR = join(REPO_ROOT, 'data/synthetic');
export const CONTRACTS_DIR = join(REPO_ROOT, 'contracts');
