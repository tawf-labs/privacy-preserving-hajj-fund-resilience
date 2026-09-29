import { afterAll, describe, expect, it } from 'vitest';
import {
  destroyBarretenberg,
  fromBundle,
  loadLedger,
  loadPublicParams,
  SolvencyProver,
  verifyMessage,
  witnessFromLedger,
  toCircuitInputs,
} from '@hajj-zk/prover';
import { witnessFromJson, type Ledger } from '@hajj-zk/solvency-model';
import { createApp, loadMacroSources, SimulatedEnclave, type AttestationRequest } from '../src/index.js';

const enclave = new SimulatedEnclave();
const app = createApp(enclave);
const hexBytes = (h: string) => Uint8Array.from(Buffer.from(h.slice(2), 'hex'));
const request = (state = 'strained'): AttestationRequest => ({
  ledger: loadLedger(state),
  sources: loadMacroSources(),
  salt: '0x2002',
});

afterAll(async () => {
  await destroyBarretenberg();
});

describe('attestor: source authentication (REQ-2)', () => {
  it('derives public params from sources that match the published period params', async () => {
    const att = await enclave.attest(request());
    expect(att.publicParams).toEqual(loadPublicParams());
  });

  it('aggregates the ledger into the private witness', async () => {
    const att = await enclave.attest(request());
    expect(witnessFromJson(att.witness)).toEqual(witnessFromLedger(loadLedger('strained'), 0x2002n));
  });

  it('signs exactly the message the circuit verifies', async () => {
    const att = await enclave.attest(request());
    const pk = { x: hexBytes(att.publicKey.x), y: hexBytes(att.publicKey.y) };
    expect(verifyMessage(pk, hexBytes(att.message), hexBytes(att.signature))).toBe(true);
    const inputs = await toCircuitInputs(att.publicParams, witnessFromJson(att.witness), {
      publicKey: pk,
      signature: hexBytes(att.signature),
    });
    const { outputs } = await new SolvencyProver().execute(inputs);
    expect(outputs.resultBits).toEqual([true, true, false]);
    expect('0x' + outputs.commitment.toString(16).padStart(64, '0')).toBe(att.commitment);
  });

  it('rejects a ledger altered after the custodian registered it', async () => {
    const req = request();
    const ledger: Ledger = structuredClone(req.ledger);
    ledger.positions[0].marketValue = (BigInt(ledger.positions[0].marketValue) + 1_000_000n).toString();
    await expect(enclave.attest({ ...req, ledger })).rejects.toMatchObject({ code: 'LEDGER_UNAUTHENTICATED' });
  });

  it('rejects a tampered macro source (softer stress scenario)', async () => {
    const req = request();
    const sources = structuredClone(req.sources);
    sources.regulatorStress.scenarios[2].haircutBps = [0, 0, 0, 0, 0, 0];
    await expect(enclave.attest({ ...req, sources })).rejects.toMatchObject({ code: 'SOURCE_TAMPERED' });
  });

  it('rejects a tampered FX source', async () => {
    const req = request();
    const sources = structuredClone(req.sources);
    sources.jisdorFx.idrPerSar = 4000;
    await expect(enclave.attest({ ...req, sources })).rejects.toMatchObject({ code: 'SOURCE_TAMPERED' });
  });

  it('draws a fresh salt when none is supplied', async () => {
    const { salt: _, ...req } = request();
    const a = await enclave.attest(req);
    const b = await enclave.attest(req);
    expect(a.commitment).not.toBe(b.commitment);
  });

  it('emits a report bound to the signed message', async () => {
    const att = await enclave.attest(request());
    expect(att.report.mode).toBe('simulated-tee');
    expect(att.report.enclaveMeasurement).toMatch(/^[0-9a-f]{64}$/);
    expect(att.report.attestorKeyHash).toBe(att.attestorKeyHash);
    const { createHash } = await import('node:crypto');
    expect(att.report.reportData).toBe(createHash('sha256').update(hexBytes(att.message)).digest('hex'));
  });
});

describe('attestor: HTTP API', () => {
  it('GET /info exposes the key hash and measurement, never the key', async () => {
    const res = await app.request('/info');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.attestorKeyHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(body)).not.toMatch(/secret/i);
  });

  it('POST /attest returns 422 with an error code for tampered input', async () => {
    const req = request();
    req.ledger.positions[3].expectedReturnBps += 50;
    const res = await app.request('/attest', { method: 'POST', body: JSON.stringify(req), headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('LEDGER_UNAUTHENTICATED');
  });

  it('POST /attest-and-prove returns a verifiable bundle and no witness', async () => {
    const res = await app.request('/attest-and-prove', {
      method: 'POST',
      body: JSON.stringify(request('deteriorating')),
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.witness).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(loadLedger('deteriorating').positions[0].marketValue);
    expect(body.bundle.result.scenarios.map((s: { pass: boolean }) => s.pass)).toEqual([true, false, false]);
    expect(await new SolvencyProver().verify(fromBundle(body.bundle))).toBe(true);
  });
});
