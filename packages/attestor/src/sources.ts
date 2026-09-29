/*
 * Source authentication (oracle-problem mitigation, paper J3).
 *
 * Every document entering the enclave must match a digest registered in advance by
 * its issuing authority: Bank Indonesia (inflation), JISDOR (FX), Kemenag (quota),
 * the supervisor (stress scenarios) and the custodian (position ledger). In
 * production these digests arrive over authenticated channels (e.g. TLS-notarised
 * fetches or issuer signatures); here they live in data/synthetic/sources/registry.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '@hajj-zk/prover';
import type { Ledger, PublicParams, ScenarioParams } from '@hajj-zk/solvency-model';
import { canonicalJson, digestOf } from './canonical.js';

export interface MacroSources {
  biInflation: { periodId: number; inflationBps: number; [k: string]: unknown };
  jisdorFx: { periodId: number; idrPerSar: number; [k: string]: unknown };
  kemenagQuota: { periodId: number; quota: number; sarShareBps: number; [k: string]: unknown };
  regulatorStress: { periodId: number; tauBps: number; scenarios: ScenarioParams[]; [k: string]: unknown };
}

export type SourceKey = keyof MacroSources;

export interface SourceRegistry {
  periodId: number;
  macro: Record<SourceKey, string>;
  /** Custodian-issued digests of position ledgers accepted for this period. */
  ledgers: Record<string, string>;
}

export const SOURCE_FILES: Record<SourceKey, string> = {
  biInflation: 'bi-inflation.json',
  jisdorFx: 'jisdor-fx.json',
  kemenagQuota: 'kemenag-quota.json',
  regulatorStress: 'regulator-stress.json',
};

export const SOURCES_DIR = join(DATA_DIR, 'sources');

export class AttestationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function loadMacroSources(dir = SOURCES_DIR): MacroSources {
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  return {
    biInflation: read(SOURCE_FILES.biInflation),
    jisdorFx: read(SOURCE_FILES.jisdorFx),
    kemenagQuota: read(SOURCE_FILES.kemenagQuota),
    regulatorStress: read(SOURCE_FILES.regulatorStress),
  };
}

export function loadRegistry(dir = SOURCES_DIR): SourceRegistry {
  return JSON.parse(readFileSync(join(dir, 'registry.json'), 'utf8'));
}

/** Rejects any document whose digest differs from the one its issuer registered. */
export function authenticateSources(registry: SourceRegistry, sources: MacroSources, ledger: Ledger): void {
  for (const key of Object.keys(SOURCE_FILES) as SourceKey[]) {
    const doc = sources[key];
    if (!doc) throw new AttestationError('SOURCE_MISSING', `missing source ${key}`);
    if (digestOf(doc) !== registry.macro[key])
      throw new AttestationError('SOURCE_TAMPERED', `${key} does not match its registered digest`);
    if (doc.periodId !== registry.periodId)
      throw new AttestationError('PERIOD_MISMATCH', `${key} is for period ${doc.periodId}, expected ${registry.periodId}`);
  }
  if (ledger.periodId !== registry.periodId)
    throw new AttestationError('PERIOD_MISMATCH', `ledger is for period ${ledger.periodId}`);
  if (!Object.values(registry.ledgers).includes(digestOf(ledger)))
    throw new AttestationError('LEDGER_UNAUTHENTICATED', 'ledger digest is not registered by the custodian');
}

/** Builds the circuit's public parameters strictly from authenticated sources. */
export function publicParamsFromSources(s: MacroSources): PublicParams {
  const [baseline] = s.regulatorStress.scenarios;
  if (baseline.inflationBps !== s.biInflation.inflationBps)
    throw new AttestationError('SOURCE_INCONSISTENT', 'baseline inflation differs from the BI source');
  if (baseline.fxIdrPerSar !== s.jisdorFx.idrPerSar)
    throw new AttestationError('SOURCE_INCONSISTENT', 'baseline FX differs from the JISDOR source');
  return {
    periodId: s.regulatorStress.periodId,
    fxBaseIdrPerSar: s.jisdorFx.idrPerSar,
    quota: s.kemenagQuota.quota,
    sarShareBps: s.kemenagQuota.sarShareBps,
    tauBps: s.regulatorStress.tauBps,
    scenarios: s.regulatorStress.scenarios.map((x) => ({
      name: x.name,
      inflationBps: x.inflationBps,
      fxIdrPerSar: x.fxIdrPerSar,
      discountBps: x.discountBps,
      yieldShockBps: x.yieldShockBps,
      haircutBps: [...x.haircutBps],
    })),
  };
}

export function samePublicParams(a: PublicParams, b: PublicParams): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
