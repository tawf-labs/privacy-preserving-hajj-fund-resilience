import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Eyebrow, Stat } from '../components/ui';
import { loadResults } from '../lib/data';
import { kb } from '../lib/format';

const LAYERS = [
  {
    n: 4,
    title: 'Public verification',
    body: 'Any stakeholder verifies the proof and reads the Valid/Invalid result per regime, in the browser or against the on-chain registry.',
    bullets: ['Stakeholder access', 'Proof verification', 'Verifiable result'],
  },
  {
    n: 3,
    title: 'ZK proof generation',
    body: 'A Noir circuit recomputes the solvency ratio and outputs only whether SR ≥ τ, proved with Barretenberg UltraHONK.',
    bullets: ['Arithmetic circuit', 'Constraint compilation', 'Proof generation'],
  },
  {
    n: 2,
    title: 'Trusted attestation (TEE)',
    body: 'An enclave authenticates every input against its issuer and signs a commitment the circuit checks, closing the oracle gap.',
    bullets: ['Enclave validation', 'Source & integrity confirmation', 'Cryptographic pre-certification'],
  },
  {
    n: 1,
    title: 'Deterministic solvency model',
    body: 'SR = F / PVO under Baseline, Moderate and Acute regimes. Fixed-point arithmetic, conservative rounding, no forecasting.',
    bullets: ['Baseline', 'Moderate shock', 'Acute crisis'],
  },
];

export function Home() {
  const [res, setRes] = useState<Awaited<ReturnType<typeof loadResults>> | null>(null);
  useEffect(() => {
    loadResults().then(setRes);
  }, []);

  const der = res?.der?.rows.map((r) => r.derConservative);
  const derMin = der && Math.min(...der);

  return (
    <div className="space-y-14">
      <section>
        <Eyebrow>Zero-knowledge verification</Eyebrow>
        <h1 className="max-w-3xl text-5xl leading-[1.05] sm:text-6xl">Prove the Hajj fund is resilient without exposing it.</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Public accountability (<em>Amanah</em>) and institutional protection (<em>Sitr</em>) usually pull in opposite directions.
          A zero-knowledge proof satisfies both: the public learns whether the fund stays solvent under stress, and nothing about how
          it is invested.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/verify" className="rounded-lg bg-green px-5 py-2.5 text-sm font-medium text-sand no-underline hover:bg-green-light">
            Verify a proof
          </Link>
          <Link to="/methodology" className="rounded-lg border border-line px-5 py-2.5 text-sm font-medium no-underline hover:bg-line">
            How it works
          </Link>
        </div>
      </section>

      {res && (
        <section aria-label="Key figures">
          <Card>
            <div className="grid gap-6 sm:grid-cols-4">
              <Stat label="Data exposure reduction" value={derMin ? `${(derMin * 100).toFixed(2)}%` : '–'} hint="conservative, vs. full audit" />
              <Stat label="Proof size" value={res.bench ? kb(res.bench.performance.proofBytes) : '–'} hint="constant" />
              <Stat label="Verification" value={res.bench ? `${res.bench.performance.verifyMs.avg.toFixed(0)} ms` : '–'} hint="bb.js, WASM" />
              <Stat label="On-chain gas" value={res.bench?.onChain.submitProof ? `${(res.bench.onChain.submitProof / 1e6).toFixed(2)}M` : '–'} hint="submitProof, incl. verify" />
            </div>
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-3xl">The four-layer artifact</h2>
        <ol className="mt-6 grid gap-4">
          {LAYERS.map((l) => (
            <li key={l.n}>
              <Card className="flex gap-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line font-serif text-xl text-gold">{l.n}</div>
                <div>
                  <h3 className="text-2xl">{l.title}</h3>
                  <p className="mt-1 text-muted">{l.body}</p>
                  <p className="mt-2 text-xs text-muted">{l.bullets.join(' · ')}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {res?.stress && (
        <section>
          <h2 className="text-3xl">Why one baseline number is not enough</h2>
          <p className="mt-3 max-w-2xl text-muted">
            In our synthetic evaluation a baseline-only valuation certifies all three funds as solvent. Regime-aware verification
            separates them: {res.stress.falseAssuranceUnderBaselineOnly.length} of the 3 fail under stress.{' '}
            <Link to="/verify">See the proofs</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
