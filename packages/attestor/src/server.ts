/*
 * HTTP surface of the simulated enclave.
 *
 *   GET  /health              liveness
 *   GET  /info                enclave measurement, attestor key hash, registered source digests
 *   POST /attest              { ledger, sources, salt? } -> witness + signature + report
 *   POST /attest-and-prove    { ledger, sources }        -> proof bundle + report (witness never leaves)
 */
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { SimulatedEnclave } from './enclave.js';
import { AttestationError } from './sources.js';

export function createApp(enclave = new SimulatedEnclave()) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AttestationError) return c.json({ error: err.code, message: err.message }, 422);
    console.error(err);
    return c.json({ error: 'INTERNAL', message: 'attestation failed' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/info', async (c) => c.json(await enclave.info()));
  app.post('/attest', async (c) => c.json(await enclave.attest(await c.req.json())));
  app.post('/attest-and-prove', async (c) => c.json(await enclave.attestAndProve(await c.req.json())));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const enclave = await SimulatedEnclave.fromEnvironment();
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: createApp(enclave).fetch, port }, async () => {
    const info = await enclave.info();
    console.log(`attestor listening on :${port}`);
    console.log(`  measurement ${info.enclaveMeasurement}`);
    console.log(`  mode        ${info.mode}, key source: ${info.keySource}`);
    console.log(`  key hash    ${info.attestorKeyHash}${info.usingDevKey ? '  [DEV KEY: set ATTESTOR_SECRET_KEY or run in a TEE]' : ''}`);
  });
}
