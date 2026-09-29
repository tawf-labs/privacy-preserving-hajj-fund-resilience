import { ASSET_CLASSES, N_ASSETS, S, type AssetClassId } from './constants.js';

/**
 * Position-level ledger: the granular data a conventional audit would disclose.
 * The attestor aggregates it into the class-level private witness inside the enclave.
 */
export interface Position {
  id: string;
  assetClass: AssetClassId;
  instrument: string;
  issuer: string;
  custodian: string;
  /** Market value in Rp ribu. */
  marketValue: string;
  /** Expected annual return (coupon / ujrah / nisbah / dividend yield) in bps. */
  expectedReturnBps: number;
  maturity: string | null;
  acquired: string;
}

export interface Ledger {
  fundId: string;
  periodId: number;
  asOf: string;
  currency: 'IDR_thousand';
  positions: Position[];
  liabilities: {
    /** Setoran awal held for waiting pilgrims, Rp ribu. */
    waitlistDeposits: string;
    waitlistPilgrims: number;
    /** Nilai manfaat per departing pilgrim, Rp ribu. */
    subsidyPerPilgrim: string;
  };
}

export interface AggregatedWitness {
  holdings: bigint[];
  returnBps: number[];
}

/** Class-level aggregation: holdings are exact sums; returns are value-weighted (floor). */
export function aggregateLedger(ledger: Ledger): AggregatedWitness {
  const holdings = Array.from({ length: N_ASSETS }, () => 0n);
  const weighted = Array.from({ length: N_ASSETS }, () => 0n);
  for (const p of ledger.positions) {
    const i = ASSET_CLASSES.findIndex((c) => c.id === p.assetClass);
    if (i < 0) throw new Error(`unknown asset class ${p.assetClass} in ${p.id}`);
    const mv = BigInt(p.marketValue);
    if (mv < 0n) throw new Error(`negative market value in ${p.id}`);
    holdings[i] += mv;
    weighted[i] += mv * BigInt(p.expectedReturnBps);
  }
  const returnBps = holdings.map((h, i) => (h === 0n ? 0 : Number(weighted[i] / h)));
  for (const r of returnBps) if (BigInt(r) > S) throw new Error('aggregated return exceeds 100%');
  return { holdings, returnBps };
}

/** Deterministic PRNG (mulberry32) so synthetic ledgers are reproducible. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ClassTarget {
  assetClass: AssetClassId;
  /** Class total in Rp ribu. */
  total: string;
  /** Target value-weighted return in bps. */
  returnBps: number;
  positions: number;
}

const ISSUERS: Record<AssetClassId, { instrument: (n: number) => string; issuer: string[] }> = {
  sbsn: { instrument: (n) => `SBSN PBS${String(n).padStart(3, '0')}`, issuer: ['Republic of Indonesia (DJPPR)'] },
  corporate_sukuk: {
    instrument: (n) => `Sukuk Ijarah Series ${String.fromCharCode(65 + (n % 26))}${n}`,
    issuer: ['PLN Persero', 'Telkom Indonesia', 'Pegadaian', 'Indosat', 'Adhi Karya', 'Mayora Indah'],
  },
  sharia_deposits: {
    instrument: (n) => `Mudharabah Deposit #${n}`,
    issuer: ['Bank Syariah Indonesia', 'Bank Muamalat', 'BTPN Syariah', 'Bank Mega Syariah', 'CIMB Niaga Syariah'],
  },
  direct_investment: {
    instrument: (n) => `Direct Investment Project ${n}`,
    issuer: ['Hajj logistics JV (KSA)', 'Hotel concession Makkah', 'Catering JV Madinah', 'Domestic sharia fintech'],
  },
  gold: { instrument: (n) => `Allocated Gold Lot ${n}`, issuer: ['Antam'] },
  cash: { instrument: (n) => `Current Account ${n}`, issuer: ['Bank Syariah Indonesia', 'Bank Muamalat'] },
};

/**
 * Split class targets into individual positions whose market values sum exactly
 * to the class total and whose coupons scatter around the class target return.
 */
export function generatePositions(targets: ClassTarget[], seed: number, asOf: string): Position[] {
  const rnd = prng(seed);
  const out: Position[] = [];
  const asOfYear = Number(asOf.slice(0, 4));
  for (const t of targets) {
    const total = BigInt(t.total);
    const weights = Array.from({ length: t.positions }, () => 0.2 + rnd());
    const wsum = weights.reduce((a, b) => a + b, 0);
    let remaining = total;
    const meta = ISSUERS[t.assetClass];
    for (let j = 0; j < t.positions; j++) {
      const mv = j === t.positions - 1 ? remaining : (total * BigInt(Math.round((weights[j] / wsum) * 1e9))) / 1_000_000_000n;
      remaining -= mv;
      const jitter = t.returnBps === 0 ? 0 : Math.round((rnd() - 0.5) * 200);
      const hasMaturity = t.assetClass === 'sbsn' || t.assetClass === 'corporate_sukuk' || t.assetClass === 'sharia_deposits';
      out.push({
        id: `${t.assetClass}-${String(j + 1).padStart(3, '0')}`,
        assetClass: t.assetClass,
        instrument: meta.instrument(j + 1 + Math.floor(rnd() * 80)),
        issuer: meta.issuer[Math.floor(rnd() * meta.issuer.length)],
        custodian: rnd() < 0.5 ? 'Bank Indonesia (BI-SSSS)' : 'KSEI',
        marketValue: mv.toString(),
        expectedReturnBps: Math.max(0, t.returnBps + jitter),
        maturity: hasMaturity ? `${asOfYear + 1 + Math.floor(rnd() * 15)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-15` : null,
        acquired: `${asOfYear - Math.floor(rnd() * 8)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-01`,
      });
    }
  }
  return out;
}
