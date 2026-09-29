import http from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadLedger, verifyMessage } from '@hajj-zk/prover';
import { getKmsKey, getTdxQuote, loadMacroSources, SimulatedEnclave } from '../src/index.js';

/** Stand-in for the dstack guest agent: same routes and JSON shapes, over a unix socket. */
const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
let dir: string;
let server: http.Server;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'dstack-'));
  const socket = join(dir, 'dstack.sock');
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      calls.push({ path: req.url ?? '', body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/GetKey') {
        // deterministic per (path, purpose), like the real KMS
        const seed = Buffer.from(`${body.path}|${body.purpose}`).toString('hex').padEnd(64, '7').slice(0, 64);
        return res.end(JSON.stringify({ key: seed, signature_chain: [] }));
      }
      if (req.url === '/GetQuote') return res.end(JSON.stringify({ quote: `0xquote${body.report_data}`, event_log: '[]' }));
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'no such route' }));
    });
  });
  await new Promise<void>((r) => server.listen(socket, r));
  process.env.DSTACK_SOCKET = socket;
});

afterAll(() => {
  server.close();
  delete process.env.DSTACK_SOCKET;
  rmSync(dir, { recursive: true, force: true });
});

const hexBytes = (h: string) => Uint8Array.from(Buffer.from(h.slice(2), 'hex'));

describe('dstack guest-agent client', () => {
  it('requests a secp256k1 key for a path and purpose', async () => {
    const key = await getKmsKey('a/b', 'signing');
    expect(key).toHaveLength(32);
    expect(calls.at(-1)).toEqual({ path: '/GetKey', body: { path: 'a/b', purpose: 'signing', algorithm: 'secp256k1' } });
  });

  it('requests a quote for report_data and rejects oversized data', async () => {
    expect(await getTdxQuote(new Uint8Array(32).fill(1))).toBe(`0xquote${'01'.repeat(32)}`);
    await expect(getTdxQuote(new Uint8Array(65))).rejects.toThrow(/64 bytes/);
  });
});

describe('attestor inside a (fake) TEE', () => {
  it('derives a stable key from the KMS, reports tdx mode and binds the quote to the signed message', async () => {
    const a = await SimulatedEnclave.fromEnvironment();
    const b = await SimulatedEnclave.fromEnvironment();
    const info = await a.info();
    expect(info.keySource).toBe('dstack-kms');
    expect(info.mode).toBe('tdx');
    expect(info.usingDevKey).toBe(false);
    expect(await a.keyHash()).toBe(await b.keyHash()); // same app identity, same key, across restarts

    const att = await a.attest({ ledger: loadLedger('strained'), sources: loadMacroSources(), salt: '0x2002' });
    expect(att.report.mode).toBe('tdx');
    expect(att.report.tdxQuote).toBe(`0xquote${att.report.reportData}`);
    const pk = { x: hexBytes(att.publicKey.x), y: hexBytes(att.publicKey.y) };
    expect(verifyMessage(pk, hexBytes(att.message), hexBytes(att.signature))).toBe(true);
  });

  it('an explicit ATTESTOR_SECRET_KEY still takes precedence', async () => {
    process.env.ATTESTOR_SECRET_KEY = '33'.repeat(32);
    try {
      const tee = await SimulatedEnclave.fromEnvironment();
      expect(tee.keySource).toBe('env');
      expect((await tee.info()).mode).toBe('simulated-tee');
    } finally {
      delete process.env.ATTESTOR_SECRET_KEY;
    }
  });
});
