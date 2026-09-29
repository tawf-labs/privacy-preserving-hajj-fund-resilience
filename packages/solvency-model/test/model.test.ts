import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aggregateLedger,
  computeFixed,
  computeFloat,
  ModelInputError,
  prng,
  withScenario,
  type Ledger,
  type PrivateWitness,
  type PublicParams,
} from '../src/index.js';

const data = resolve(__dirname, '../../../data/synthetic');
const pub: PublicParams = JSON.parse(readFileSync(join(data, 'public-params.json'), 'utf8'));
const ledger = (id: string): Ledger => JSON.parse(readFileSync(join(data, 'ledgers', `${id}.json`), 'utf8'));

function witnessFor(id: string): PrivateWitness {
  const l = ledger(id);
  const agg = aggregateLedger(l);
  return {
    ...agg,
    subsidyPerPilgrim: BigInt(l.liabilities.subsidyPerPilgrim),
    waitlistDeposits: BigInt(l.liabilities.waitlistDeposits),
    salt: 42n,
  };
}

describe('ledger aggregation', () => {
  it('sums class holdings exactly to the fund-state targets', () => {
    const states = JSON.parse(readFileSync(join(data, 'fund-states.json'), 'utf8')).states;
    for (const s of states) {
      const agg = aggregateLedger(ledger(s.id));
      expect(agg.holdings.map(String)).toEqual(s.classes.map((c: { total: string }) => c.total));
    }
  });

  it('value-weights returns', () => {
    const l: Ledger = {
      ...ledger('healthy'),
      positions: [
        { ...ledger('healthy').positions[0], assetClass: 'sbsn', marketValue: '300', expectedReturnBps: 600 },
        { ...ledger('healthy').positions[0], assetClass: 'sbsn', marketValue: '100', expectedReturnBps: 1000 },
      ],
    };
    const agg = aggregateLedger(l);
    expect(agg.holdings[0]).toBe(400n);
    expect(agg.returnBps[0]).toBe(700);
  });

  it('rejects unknown asset classes', () => {
    const l = ledger('healthy');
    l.positions[0] = { ...l.positions[0], assetClass: 'crypto' as never };
    expect(() => aggregateLedger(l)).toThrow(/unknown asset class/);
  });
});

describe('solvency model (REQ-1: regime-sensitive)', () => {
  it('separates the three synthetic fund states across regimes', () => {
    const bits = (id: string) => computeFixed(pub, witnessFor(id)).map((r) => r.pass);
    expect(bits('healthy')).toEqual([true, true, true]);
    expect(bits('strained')).toEqual([true, true, false]);
    expect(bits('deteriorating')).toEqual([true, false, false]);
  });

  it('is monotone: every stress regime is weakly worse than baseline', () => {
    for (const id of ['healthy', 'strained', 'deteriorating']) {
      const r = computeFixed(pub, witnessFor(id));
      expect(r[1].ratioBps).toBeLessThanOrEqual(r[0].ratioBps);
      expect(r[2].ratioBps).toBeLessThanOrEqual(r[1].ratioBps);
    }
  });

  it('fixed-point tracks the float model within 0.1% of SR', () => {
    for (const id of ['healthy', 'strained', 'deteriorating']) {
      const fx = computeFixed(pub, witnessFor(id));
      const fl = computeFloat(pub, witnessFor(id));
      fx.forEach((r, i) => expect(Math.abs(Number(r.ratioBps) / 1e4 - fl[i].ratio)).toBeLessThan(1e-3));
    }
  });

  it('rounds conservatively: fixed SR never exceeds float SR', () => {
    const rnd = prng(7);
    for (let n = 0; n < 200; n++) {
      const w = witnessFor('strained');
      w.holdings = w.holdings.map((h) => (h * BigInt(Math.floor(500 + rnd() * 1000))) / 1000n);
      const fx = computeFixed(pub, w);
      const fl = computeFloat(pub, w);
      fx.forEach((r, i) => {
        expect(r.assets).toBeLessThanOrEqual(BigInt(Math.ceil(fl[i].assets)));
        expect(r.obligations).toBeGreaterThanOrEqual(BigInt(Math.floor(fl[i].obligations)));
      });
    }
  });

  it('higher inflation raises obligations', () => {
    const w = witnessFor('healthy');
    const base = computeFixed(pub, w)[0].obligations;
    const hot = computeFixed(withScenario(pub, 0, { inflationBps: 900 }), w)[0].obligations;
    expect(hot).toBeGreaterThan(base);
  });

  it('rupiah depreciation raises obligations through the SAR share', () => {
    const w = witnessFor('healthy');
    const base = computeFixed(pub, w)[0].obligations;
    const weak = computeFixed(withScenario(pub, 0, { fxIdrPerSar: 6000 }), w)[0].obligations;
    expect(weak).toBeGreaterThan(base);
  });

  it('pass boundary is exactly F * S >= tau * PVO', () => {
    const w = witnessFor('healthy');
    const r = computeFixed(pub, w)[0];
    const atBoundary = { ...pub, tauBps: Number(r.ratioBps) };
    expect(computeFixed(atBoundary, w)[0].pass).toBe(true);
    const above = { ...pub, tauBps: Number(r.ratioBps) + 1 };
    expect(computeFixed(above, w)[0].pass).toBe(false);
  });

  it('rejects out-of-range inputs the circuit would also reject', () => {
    const w = witnessFor('healthy');
    expect(() => computeFixed(withScenario(pub, 1, { haircutBps: [10001, 0, 0, 0, 0, 0] }), w)).toThrow(ModelInputError);
    expect(() => computeFixed({ ...pub, fxBaseIdrPerSar: 0 }, w)).toThrow(ModelInputError);
    expect(() => computeFixed(withScenario(pub, 2, { fxIdrPerSar: 4300 * 11 }), w)).toThrow(/10x/);
    expect(() => computeFixed(pub, { ...w, holdings: [...w.holdings, 1n] })).toThrow(ModelInputError);
    expect(() => computeFixed(pub, { ...w, holdings: w.holdings.map(() => 0n), waitlistDeposits: 0n, subsidyPerPilgrim: 0n })).toThrow(/positive/);
  });
});
