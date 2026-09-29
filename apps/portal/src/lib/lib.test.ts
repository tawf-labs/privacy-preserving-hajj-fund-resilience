import { keccak256 } from 'viem';
import { describe, expect, it } from 'vitest';
import { bps, hexToBytes, kb, short } from './format';
import { checkConsistency, type OnChainRecord } from './registry';
import type { ProofBundle } from './types';

const proof = '0xdeadbeef' as const;
const bundle = {
  proof,
  result: {
    scenarios: [
      { name: 'Baseline', pass: true },
      { name: 'Moderate', pass: true },
      { name: 'Acute', pass: false },
    ],
    statementId: '0x' + 'ab'.repeat(32),
    commitment: '0x' + 'cd'.repeat(32),
    attestorKeyHash: '0x' + '01'.repeat(32),
  },
} as unknown as ProofBundle;

const record = (over: Partial<OnChainRecord> = {}): OnChainRecord => ({
  periodId: 1,
  submittedAt: 0,
  blockNumber: 1,
  pass: [true, true, false],
  statementId: bundle.result.statementId,
  commitment: bundle.result.commitment,
  proofHash: keccak256(proof),
  submitter: '0x0000000000000000000000000000000000000001',
  ...over,
});

describe('checkConsistency (bundle vs on-chain record)', () => {
  it('accepts a matching record', () => {
    expect(checkConsistency(record(), bundle)).toEqual({ matches: true, reasons: [] });
  });

  it('flags a different proof', () => {
    const r = checkConsistency(record({ proofHash: keccak256('0x01') }), bundle);
    expect(r.matches).toBe(false);
    expect(r.reasons[0]).toMatch(/proof hash/);
  });

  it('flags a differing regime result', () => {
    const r = checkConsistency(record({ pass: [true, false, false] }), bundle);
    expect(r.matches).toBe(false);
    expect(r.reasons).toContain('Moderate result differs');
  });

  it('compares statement ids case-insensitively', () => {
    const r = checkConsistency(record({ statementId: bundle.result.statementId.toUpperCase().replace('0X', '0x') as `0x${string}` }), bundle);
    expect(r.matches).toBe(true);
  });
});

describe('format helpers', () => {
  it('formats basis points', () => {
    expect(bps(300)).toBe('3%');
    expect(bps(450)).toBe('4.50%');
  });
  it('shortens hashes and sizes', () => {
    expect(short('0x' + 'a'.repeat(64))).toBe('0xaaaaaa…aaaaaa');
    expect(kb(2048)).toBe('2.0 KB');
  });
  it('decodes hex', () => {
    expect([...hexToBytes('0x00ff10')]).toEqual([0, 255, 16]);
  });
});
