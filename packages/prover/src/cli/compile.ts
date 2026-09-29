import { compileCircuit, saveArtifact } from '../compile.js';
import { CIRCUIT_ARTIFACT } from '../paths.js';

const { program, ms } = await compileCircuit();
saveArtifact(program);
console.log(`compiled hajj_solvency (noir ${program.noir_version ?? '?'}) in ${ms.toFixed(0)} ms -> ${CIRCUIT_ARTIFACT}`);
