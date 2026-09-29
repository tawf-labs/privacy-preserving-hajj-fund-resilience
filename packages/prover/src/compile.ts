import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, createFileManager } from '@noir-lang/noir_wasm';
import type { CompiledCircuit } from '@noir-lang/noir_js';
import { CIRCUIT_ARTIFACT, CIRCUIT_DIR } from './paths.js';

export interface CompileResult {
  program: CompiledCircuit & { noir_version?: string };
  ms: number;
}

/** Compiles circuits/hajj_solvency with noir_wasm (no native nargo required). */
export async function compileCircuit(dir = CIRCUIT_DIR): Promise<CompileResult> {
  const t0 = performance.now();
  const fm = createFileManager(dir);
  const res = (await compile(fm)) as { program: CompileResult['program'] };
  return { program: res.program, ms: performance.now() - t0 };
}

/**
 * Compiles a copy of the circuit with a different projection horizon H
 * (used by the horizon-scaling benchmark).
 */
export async function compileWithHorizon(horizon: number): Promise<CompileResult> {
  const tmp = mkdtempSync(join(tmpdir(), `hajj-h${horizon}-`));
  try {
    cpSync(join(CIRCUIT_DIR, 'Nargo.toml'), join(tmp, 'Nargo.toml'));
    cpSync(join(CIRCUIT_DIR, 'src'), join(tmp, 'src'), { recursive: true });
    const modelPath = join(tmp, 'src/model.nr');
    const src = readFileSync(modelPath, 'utf8');
    const patched = src.replace(/pub global H: u32 = \d+;/, `pub global H: u32 = ${horizon};`);
    if (patched === src && horizon !== 10) throw new Error('could not patch horizon');
    writeFileSync(modelPath, patched);
    return await compileCircuit(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function loadArtifact(path = CIRCUIT_ARTIFACT): CompileResult['program'] {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveArtifact(program: CompileResult['program'], path = CIRCUIT_ARTIFACT): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(program));
}
