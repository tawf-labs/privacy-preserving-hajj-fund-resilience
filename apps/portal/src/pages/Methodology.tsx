import { Card, Eyebrow } from '../components/ui';

export function Methodology() {
  return (
    <article className="max-w-3xl space-y-8">
      <div>
        <Eyebrow>Methodology</Eyebrow>
        <h1 className="text-4xl sm:text-5xl">How the proof is built</h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl">The statement being proven</h2>
        <p className="text-muted">
          For each regime <em>s</em> in {'{'}Baseline, Moderate, Acute{'}'}, the fund&apos;s realisable assets <em>F<sub>s</sub></em> are compared with
          the present value of its outstanding obligations <em>PVO<sub>s</sub></em>. The circuit publishes one bit per regime:
        </p>
        <Card className="mono text-center text-base">F<sub>s</sub> · 10 000 ≥ τ · PVO<sub>s</sub></Card>
        <p className="text-muted">
          The comparison is a cross-multiplication in fixed-point arithmetic, so no division is needed. Obligations round up and
          assets round down, so integer rounding can never turn an insolvent fund into a solvent one.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">What the proof does and does not guarantee</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>
            <strong className="text-ink">Guaranteed:</strong> given the attested inputs, the three published bits are the result of the
            deterministic model. A tampered witness, a softer stress scenario, another attestor or a replayed period cannot produce an
            accepted proof.
          </li>
          <li>
            <strong className="text-ink">Not guaranteed by the proof alone:</strong> that the inputs are true. That is the oracle problem;
            the attestation layer authenticates each input against its issuer and binds it to the proof. Governance of that layer is
            where trust ultimately sits.
          </li>
          <li>
            <strong className="text-ink">Not a forecast:</strong> the model is deterministic and the regimes are set by the regulator. The
            proof verifies a claim; it does not predict.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Amanah and Sitr</h2>
        <p className="text-muted">
          <em>Amanah</em> obliges a trustee of public funds to be accountable and to permit oversight. <em>Sitr</em> obliges the protection of
          vulnerability from needless exposure. Full disclosure satisfies the first and violates the second; secrecy does the reverse. A
          zero-knowledge proof publishes verifiable accountability while keeping the portfolio covered.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl">Data Exposure Reduction</h2>
        <Card className="mono text-center text-base">DER = (1 − D<sub>disclosed</sub> / D<sub>total</sub>) × 100%</Card>
        <p className="text-muted">
          D<sub>total</sub> is the byte volume of sensitive data a conventional full-disclosure audit would publish; D<sub>disclosed</sub> is the
          witness-derived data the proof actually exposes. See the <em>What stays private</em> page for measured values.
        </p>
      </section>
    </article>
  );
}
