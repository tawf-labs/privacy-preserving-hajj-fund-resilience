import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '@hajj-zk/prover';

export const RESULTS_DIR = join(REPO_ROOT, 'evaluation/results');

export function writeResult(name: string, content: string | object): string {
  const path = join(RESULTS_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content, bigintReplacer, 2) + '\n');
  return path;
}

export const bigintReplacer = (_: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

export const STATES = ['healthy', 'strained', 'deteriorating'] as const;
export type StateId = (typeof STATES)[number];

export const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;
export const fixed = (x: number, d = 2) => x.toFixed(d);
export const stats = (xs: number[]) => ({
  avg: xs.reduce((a, b) => a + b, 0) / xs.length,
  min: Math.min(...xs),
  max: Math.max(...xs),
  n: xs.length,
});

export function mdTable(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}
