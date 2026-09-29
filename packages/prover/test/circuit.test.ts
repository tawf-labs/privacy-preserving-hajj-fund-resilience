import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeFixed,
  prng,
  S,
  withScenario,
  type PrivateWitness,
  type PublicParams,
} from '@hajj-zk/solvency-model';
import {
  attest,
  buildInputs,
  commitWitness,
  destroyBarretenberg,
  DEV_ATTESTOR_SECRET,
  keyHash,
  loadLedger,
  loadPublicParams,
  PUBLIC_INPUT_LAYOUT,
  publicKeyFromSecret,
  SolvencyProver,
  statementId,
  toCircuitInputs,
  toHex32,
  witnessFromLedger,
} from '../src/index.js';

const pub = loadPublicParams();
const witness = (id: string, salt = 99n) => witnessFromLedger(loadLedger(id), salt);
let prover: SolvencyProver;

beforeAll(() => {
  prover = new SolvencyProver();
});
afterAll(async () => {
  await destroyBarretenberg();
});

/** Expects circuit execution to fail with a message matching `re`. */
async function expectReject(inputs: Awaited<ReturnType<typeof buildInputs>>, re: RegExp) {
  await expect(prover.execute(inputs)).rejects.toThrow(re);
}

describe('solvency circuit: completeness', () => {
  it.each(['healthy', 'strained', 'deteriorating'])('%s: circuit bits equal the model', async (id) => {
    const w = witness(id);
    const { outputs } = await prover.execute(await buildInputs(pub, w));
    expect(outputs.resultBits).toEqual(computeFixed(pub, w).map((r) => r.pass));
    expect(outputs.commitment).toBe(await commitWitness(w));
    expect(outputs.statementId).toBe(await statementId(outputs.commitment, pub.periodId));
  });

  it('produces an EVM-target UltraHONK proof that verifies', async () => {
    const r = await prover.prove(await buildInputs(pub, witness('strained')));
    expect(r.proof.publicInputs).toHaveLength(PUBLIC_INPUT_LAYOUT.names.length);
    const at = (n: string) => BigInt(r.proof.publicInputs[PUBLIC_INPUT_LAYOUT.index[n]]);
    expect(at('period_id')).toBe(BigInt(pub.periodId));
    expect(at('tau_bps')).toBe(BigInt(pub.tauBps));
    expect([at('result_bits[0]'), at('result_bits[1]'), at('result_bits[2]')]).toEqual([1n, 1n, 0n]);
    expect(at('attestor_key_hash')).toBe(await keyHash(publicKeyFromSecret(DEV_ATTESTOR_SECRET)));
    expect(await prover.verify(r.proof)).toBe(true);
  }, 120_000);
});

describe('solvency circuit: soundness (J7 under-constraint, J8 malleability)', () => {
  it('rejects a witness altered after attestation', async () => {
    const w = witness('deteriorating');
    const inputs = await toCircuitInputs(pub, { ...w, holdings: w.holdings.map((h, i) => (i === 0 ? h + 10_000_000_000n : h)) }, await attest(pub, w));
    await expectReject(inputs, /Invalid attestation signature/);
  });

  it('rejects public parameters altered after attestation (easier stress scenario)', async () => {
    const w = witness('deteriorating');
    const att = await attest(pub, w);
    const softer = withScenario(pub, 1, { yieldShockBps: 0, haircutBps: [0, 0, 0, 0, 0, 0] });
    await expectReject(await toCircuitInputs(softer, w, att), /Invalid attestation signature/);
  });

  it('rejects a replay of an attestation into a different period', async () => {
    const w = witness('healthy');
    const att = await attest(pub, w);
    await expectReject(await toCircuitInputs({ ...pub, periodId: pub.periodId + 1 }, w, att), /Invalid attestation signature/);
  });

  it('rejects a signature from an unregistered key', async () => {
    const w = witness('healthy');
    const rogue = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
    const inputs = await buildInputs(pub, w, rogue);
    inputs.attestor_key_hash = toHex32(await keyHash(publicKeyFromSecret(DEV_ATTESTOR_SECRET)));
    await expectReject(inputs, /Unrecognised attestor key/);
  });

  it('rejects a registered key paired with a forged signature', async () => {
    const w = witness('healthy');
    const inputs = await buildInputs(pub, w);
    const sig = inputs.attestation_sig as string[];
    inputs.attestation_sig = sig.map((b, i) => (i === 40 ? String((Number(b) + 1) % 256) : b));
    await expectReject(inputs, /Invalid attestation signature|signature/i);
  });

  it('enforces range checks even on attested inputs', async () => {
    const w = witness('healthy');
    await expectReject(await buildInputs(withScenario(pub, 2, { haircutBps: [10_001, 0, 0, 0, 0, 0] }), w), /haircut out of range/);
    await expectReject(await buildInputs(pub, { ...w, holdings: w.holdings.map((h, i) => (i === 3 ? 1n << 50n : h)) }), /holding out of range/);
    await expectReject(await buildInputs({ ...pub, tauBps: 0 }, w), /tau out of range/);
    await expectReject(await buildInputs(withScenario(pub, 2, { fxIdrPerSar: pub.fxBaseIdrPerSar * 11 }), w), /fx shock exceeds 10x/);
  });

  it('rejects a fund with zero obligations', async () => {
    const w: PrivateWitness = { ...witness('healthy'), waitlistDeposits: 0n, subsidyPerPilgrim: 0n };
    await expectReject(await buildInputs(pub, w), /obligations must be positive/);
  });

  it('proofs with flipped outputs or bytes do not verify', async () => {
    const r = await prover.prove(await buildInputs(pub, witness('deteriorating')));
    const bits = PUBLIC_INPUT_LAYOUT.index['result_bits[1]'];
    const flipped = [...r.proof.publicInputs];
    flipped[bits] = toHex32(1n);
    expect(await prover.verify({ ...r.proof, publicInputs: flipped })).toBe(false);
    const tampered = Uint8Array.from(r.proof.proof);
    tampered[200] ^= 1;
    expect(await prover.verify({ ...r.proof, proof: tampered })).toBe(false);
  }, 120_000);

  it('re-proving the same statement yields a different proof but the same statement_id (registry dedupes)', async () => {
    const inputs = await buildInputs(pub, witness('healthy'));
    const a = await prover.prove(inputs);
    const b = await prover.prove(inputs);
    expect(Buffer.from(a.proof.proof).equals(Buffer.from(b.proof.proof))).toBe(false);
    expect(a.statementId).toBe(b.statementId);
  }, 120_000);
});

describe('differential fuzz: circuit == bit-exact model', () => {
  const N = Number(process.env.FUZZ_CASES ?? 500);

  function randomCase(rnd: () => number): { pub: PublicParams; w: PrivateWitness } {
    const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
    const big = (lo: bigint, span: bigint) => lo + (BigInt(Math.floor(rnd() * 2 ** 30)) * span) / (1n << 30n);
    const fxBase = int(1000, 9000);
    const w: PrivateWitness = {
      holdings: Array.from({ length: 6 }, () => (rnd() < 0.1 ? 0n : big(0n, 80_000_000_000n))),
      returnBps: Array.from({ length: 6 }, () => int(0, 1500)),
      subsidyPerPilgrim: big(1n, 80_000n),
      waitlistDeposits: big(0n, 200_000_000_000n),
      salt: BigInt(int(1, 2 ** 30)),
    };
    const p: PublicParams = {
      periodId: int(202001, 205012),
      fxBaseIdrPerSar: fxBase,
      quota: int(1, 400_000),
      sarShareBps: int(0, Number(S)),
      tauBps: int(5_000, 15_000),
      scenarios: ['Baseline', 'Moderate', 'Acute'].map((name) => ({
        name,
        inflationBps: int(0, 2000),
        fxIdrPerSar: Math.max(1, Math.floor(fxBase * (0.5 + rnd() * 2))),
        discountBps: int(0, 2000),
        yieldShockBps: int(0, Number(S)),
        haircutBps: Array.from({ length: 6 }, () => int(0, Number(S))),
      })),
    };
    // Pull tau onto the exact boundary of one regime in ~20% of cases.
    if (rnd() < 0.2) {
      const r = computeFixed(p, w)[int(0, 2)];
      p.tauBps = Math.min(Number(10n * S), Math.max(1, Number(r.ratioBps) + int(-1, 1)));
    }
    return { pub: p, w };
  }

  it(`${N} random witnesses agree bit-for-bit`, async () => {
    const rnd = prng(20270101);
    let passes = 0;
    let fails = 0;
    for (let n = 0; n < N; n++) {
      const c = randomCase(rnd);
      const expected = computeFixed(c.pub, c.w).map((r) => r.pass);
      const { outputs } = await prover.execute(await buildInputs(c.pub, c.w));
      expect(outputs.resultBits, `case ${n}`).toEqual(expected);
      expected.forEach((b) => (b ? passes++ : fails++));
    }
    // Both outcomes must be exercised or the fuzz is vacuous.
    expect(passes).toBeGreaterThan(N / 10);
    expect(fails).toBeGreaterThan(N / 10);
  }, 600_000);
});
