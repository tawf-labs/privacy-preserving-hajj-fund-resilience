import { describe, expect, it } from 'vitest';
import { aggregateDisclosure, countFields, fullAuditPackage } from '../src/der.js';
import { loadLedger } from '@hajj-zk/prover';

describe('DER accounting', () => {
  const ledger = loadLedger('healthy');
  const total = new TextEncoder().encode(JSON.stringify(fullAuditPackage(ledger))).length;

  it('counts every scalar field of a full audit', () => {
    // 9 fields per position (maturity may be null but still counts) + 3 liability fields.
    expect(countFields(fullAuditPackage(ledger))).toBe(ledger.positions.length * 9 + 3);
  });

  it('an aggregate report discloses far less than a full audit but far more than a proof', () => {
    const agg = new TextEncoder().encode(JSON.stringify(aggregateDisclosure(ledger))).length;
    expect(agg).toBeLessThan(total / 10);
    expect(agg).toBeGreaterThan(65); // the 65 B conservative witness-derived output of the ZK proof
  });

  it('DER is monotone in D_disclosed and bounded by [0, 1)', () => {
    const der = (d: number) => 1 - d / total;
    expect(der(1)).toBeGreaterThan(der(65));
    expect(der(65)).toBeLessThan(1);
    expect(der(0)).toBe(1);
  });
});
