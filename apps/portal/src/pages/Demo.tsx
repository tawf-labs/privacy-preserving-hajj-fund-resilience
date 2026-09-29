import { useEffect, useState } from 'react';
import { Badge, Card, Eyebrow } from '../components/ui';
import { loadResults, type DerRow } from '../lib/data';
import { kb } from '../lib/format';

const PRIVATE_VARS = [
  ['V1', 'Total asset value', 'holdings by asset class'],
  ['V2', 'Projected obligation', 'waitlist deposits + subsidy per pilgrim'],
  ['V3', 'Portfolio composition', 'six asset-class allocations'],
  ['V4', 'Expected investment return', 'value-weighted return per class'],
];
const PUBLIC_VARS = [
  ['V5', 'Inflation rate', 'per regime'],
  ['V6', 'Exchange rate', 'IDR per SAR, per regime'],
  ['V7', 'Discount rate', 'per regime'],
  ['V8', 'Hajj quota', 'annual departures'],
  ['V9', 'Solvency threshold τ', 'statutory'],
  ['V10', 'Verification result', 'SR ≥ τ per regime'],
  ['V11', 'Cryptographic proof', 'UltraHONK'],
];

export function Demo() {
  const [rows, setRows] = useState<DerRow[] | null>(null);
  const [sel, setSel] = useState('strained');
  useEffect(() => {
    loadResults().then((r) => setRows(r.der?.rows ?? null));
  }, []);
  const row = rows?.find((r) => r.state === sel);
  const total = row ? row.auditBytes : 0;
  const share = (n: number) => (total ? Math.max(0.4, (n / total) * 100) : 0);

  return (
    <div className="space-y-10">
      <div>
        <Eyebrow>Amanah and Sitr</Eyebrow>
        <h1 className="text-4xl sm:text-5xl">What stays private</h1>
        <p className="mt-3 max-w-2xl text-muted">
          The circuit separates public macro assumptions from the fund&apos;s private witness. A conventional audit publishes the
          private side; the proof publishes only the answer.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl">Private witness</h2>
            <Badge tone="bad">never published</Badge>
          </div>
          <VarTable rows={PRIVATE_VARS} />
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl">Public inputs & outputs</h2>
            <Badge tone="ok">published</Badge>
          </div>
          <VarTable rows={PUBLIC_VARS} />
        </Card>
      </div>

      <section>
        <h2 className="text-3xl">Disclosure compared</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Fund state">
          {rows?.map((r) => (
            <button
              key={r.state}
              role="tab"
              aria-selected={sel === r.state}
              onClick={() => setSel(r.state)}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm capitalize ${sel === r.state ? 'border-green bg-green text-sand' : 'border-line hover:bg-line'}`}
            >
              {r.state}
            </button>
          ))}
        </div>

        {row ? (
          <Card className="mt-4 space-y-5">
            <Bar label={`Full audit · ${row.positions} positions`} bytes={row.auditBytes} width={100} tone="bad" />
            <Bar label="Annual-report style aggregate" bytes={row.aggregateBytes} width={share(row.aggregateBytes)} tone="gold" />
            <Bar label="Zero-knowledge proof (witness-derived bytes)" bytes={row.witnessDerivedBytes} width={share(row.witnessDerivedBytes)} tone="ok" />
            <p className="text-sm text-muted">
              Data Exposure Reduction: <strong className="text-ink">{(row.derConservative * 100).toFixed(3)}%</strong> (conservative: charges the
              witness commitment and statement id) ·{' '}
              <strong className="text-ink">{(row.derLimiting * 100).toFixed(3)}%</strong> (limiting case: result bits only). The published
              proof bundle itself is {kb(row.proofBundleBytes)}, but it carries no witness information.
            </p>
          </Card>
        ) : (
          <p className="mt-4 text-muted">Loading…</p>
        )}
      </section>

      <Card className="text-sm text-muted">
        <strong className="text-ink">Limits of this guarantee.</strong> The proof establishes that the computation is correct given the
        inputs. The attestation layer (a TEE in production; simulated in this prototype) is what ties the inputs to authenticated sources.
        The three result bits are intentionally public and do reveal whether SR ≥ τ in each regime.
      </Card>
    </div>
  );
}

function VarTable({ rows }: { rows: string[][] }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map(([id, name, note]) => (
        <li key={id} className="flex gap-3 py-2">
          <span className="mono w-9 shrink-0 text-gold">{id}</span>
          <span>
            {name} <span className="text-muted">· {note}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Bar({ label, bytes, width, tone }: { label: string; bytes: number; width: number; tone: 'bad' | 'gold' | 'ok' }) {
  const color = { bad: 'bg-bad', gold: 'bg-gold', ok: 'bg-ok' }[tone];
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="mono text-muted">{bytes.toLocaleString('en-US')} B</span>
      </div>
      <div className="h-3 rounded-full bg-line" role="img" aria-label={`${label}: ${bytes} bytes`}>
        <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.min(100, width)}%` }} />
      </div>
    </div>
  );
}
