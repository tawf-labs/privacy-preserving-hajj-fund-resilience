/*
 * Minimal client for the Phala dstack guest agent (JSON over HTTP on a unix socket).
 * Implements only what the attestor needs, with no third-party SDK in the key-derivation path:
 *
 *   POST /GetKey   { path, purpose, algorithm } -> { key: hex, signature_chain: hex[] }
 *   POST /GetQuote { report_data: hex }         -> { quote: hex, event_log: string, ... }
 *
 * Inside a Phala CVM the socket is mounted at /var/run/dstack.sock.
 */
import http from 'node:http';
import { existsSync } from 'node:fs';

export const dstackSocketPath = (): string => process.env.DSTACK_SOCKET ?? '/var/run/dstack.sock';
export const dstackAvailable = (): boolean => existsSync(dstackSocketPath());

function rpc<T>(path: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  const payload = JSON.stringify(body);
  return new Promise<T>((resolve, reject) => {
    const req = http.request(
      {
        socketPath: dstackSocketPath(),
        path,
        method: 'POST',
        timeout: timeoutMs,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            return reject(new Error(`dstack ${path}: unparseable response (HTTP ${res.statusCode})`));
          }
          const err = (parsed as { error?: unknown })?.error;
          if ((res.statusCode ?? 500) >= 400 || err) return reject(new Error(`dstack ${path}: ${String(err ?? res.statusCode)}`));
          resolve(parsed as T);
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`dstack ${path}: timed out`)));
    req.on('error', reject);
    req.end(payload);
  });
}

/** Key material derived inside the TEE from the app identity and `path`. Stable across restarts of the same app. */
export async function getKmsKey(path: string, purpose = ''): Promise<Uint8Array> {
  const r = await rpc<{ key: string }>('/GetKey', { path, purpose, algorithm: 'secp256k1' });
  return Uint8Array.from(Buffer.from(r.key, 'hex'));
}

/** Intel TDX quote whose report_data is `reportData` (at most 64 bytes). Returns the quote as hex. */
export async function getTdxQuote(reportData: Uint8Array): Promise<string> {
  if (reportData.length > 64) throw new Error('report_data must be at most 64 bytes');
  const r = await rpc<{ quote: string }>('/GetQuote', { report_data: Buffer.from(reportData).toString('hex') });
  return r.quote;
}
