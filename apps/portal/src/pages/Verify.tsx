import { useEffect, useState } from 'react';
import { Badge, Button, Card, Eyebrow } from '../components/ui';
import { loadBundles } from '../lib/data';
import { bps, kb, short } from '../lib/format';
import { checkConsistency, explorer, fetchRecord, REGISTRY, type Consistency, type OnChainRecord } from '../lib/registry';
import type { BundleEntry } from '../lib/types';
import { verifyBundle, type VerifyOutcome } from '../lib/verify';

const LABELS: Record<string, string> = {
  healthy: 'Healthy fund',
  strained: 'Strained fund',
  deteriorating: 'Deteriorating fund',
};

export function Verify() {
  const [entries, setEntries] = useState<BundleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBundles().then(setEntries).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow>Public verification</Eyebrow>
        <h1 className="text-4xl sm:text-5xl">Verify a solvency proof</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Each proof states, for three stress regimes, whether the fund&apos;s solvency ratio SR = F / PVO stays at or above the
          statutory threshold. Verification runs in your browser against the circuit&apos;s verification key: it needs no access
          to the fund&apos;s portfolio, and reveals none.
        </p>
      </div>

      {REGISTRY ? (
        <p className="text-sm text-muted">
          On-chain registry: <a href={explorer(REGISTRY)} className="mono">{short(REGISTRY, 10, 8)}</a> (Ethereum Sepolia)
        </p>
      ) : (
        <Card className="text-sm text-muted">
          No on-chain registry is configured for this deployment (<span className="mono">VITE_REGISTRY_ADDRESS</span>). Proofs below
          are verified locally; deploy the registry to cross-check them against the public record.
        </Card>
      )}

      {error && <Card className="text-bad">Could not load proofs: {error}</Card>}
      {!entries && !error && <p className="text-muted">Loading proofs…</p>}
      <div className="grid gap-6">{entries?.map((e) => <ProofCard key={e.state} entry={e} />)}</div>
    </div>
  );
}

function ProofCard({ entry }: { entry: BundleEntry }) {
  const { state, bundle } = entry;
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [rec, setRec] = useState<OnChainRecord | null>(null);
  const [recErr, setRecErr] = useState<string | null>(null);

  useEffect(() => {
    if (!REGISTRY) return;
    fetchRecord(bundle.periodId).then(setRec).catch((e) => setRecErr(e instanceof Error ? e.message : String(e)));
  }, [bundle.periodId]);

  const consistency: Consistency | null = rec ? checkConsistency(rec, bundle) : null;
  const proofBytes = (bundle.proof.length - 2) / 2;
  const tau = bundle.publicParams.tauBps;

  async function run() {
    setBusy(true);
    setOutcome(null);
    setOutcome(await verifyBundle(bundle));
    setBusy(false);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl">{LABELS[state] ?? state}</h2>
          <p className="text-sm text-muted">
            Period {bundle.periodId} · threshold SR ≥ {(tau / 10000).toFixed(2)} · proof {kb(proofBytes)}
          </p>
        </div>
        {outcome && (
          <Badge tone={outcome.valid ? 'ok' : 'bad'}>
            {outcome.valid ? `Proof valid · ${outcome.ms.toFixed(0)} ms` : 'Proof INVALID'}
          </Badge>
        )}
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {bundle.result.scenarios.map((s, i) => {
          const sc = bundle.publicParams.scenarios[i];
          return (
            <li key={s.name} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{s.name}</span>
                <Badge tone={s.pass ? 'ok' : 'bad'}>{s.pass ? 'SR ≥ τ' : 'SR < τ'}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">
                inflation {bps(sc.inflationBps)} · IDR/SAR {sc.fxIdrPerSar.toLocaleString('en-US')} · yield shock {bps(sc.yieldShockBps)}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy}>
          {busy ? 'Verifying…' : 'Verify independently in browser'}
        </Button>
        {outcome?.error && <span className="text-sm text-bad">{outcome.error}</span>}
      </div>

      {REGISTRY && (
        <div className="mt-5 border-t border-line pt-4 text-sm">
          <span className="font-medium">On-chain record: </span>
          {recErr && <span className="text-bad">{recErr}</span>}
          {!recErr && !rec && <span className="text-muted">none for this period</span>}
          {rec && consistency && (
            <>
              <Badge tone={consistency.matches ? 'ok' : 'bad'}>{consistency.matches ? 'matches this proof' : 'DIFFERS'}</Badge>{' '}
              <span className="text-muted">
                block {rec.blockNumber.toLocaleString('en-US')} · submitted by <span className="mono">{short(rec.submitter, 8, 6)}</span>
              </span>
              {!consistency.matches && <ul className="mt-2 list-disc pl-5 text-bad">{consistency.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            </>
          )}
        </div>
      )}

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted">What is published</summary>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted">Statement id</dt>
          <dd className="mono break-all">{bundle.result.statementId}</dd>
          <dt className="text-muted">Witness commitment</dt>
          <dd className="mono break-all">{bundle.result.commitment}</dd>
          <dt className="text-muted">Attestor key hash</dt>
          <dd className="mono break-all">{bundle.result.attestorKeyHash}</dd>
          <dt className="text-muted">Circuit</dt>
          <dd>
            {bundle.circuit} · Noir {bundle.noirVersion.split('+')[0]} · {bundle.backend}
          </dd>
        </dl>
        <p className="mt-3 text-muted">
          The bundle contains no portfolio data. Fund balance, allocation, returns, liabilities and the solvency ratio itself never
          leave the fund&apos;s attested environment.
        </p>
      </details>
    </Card>
  );
}
