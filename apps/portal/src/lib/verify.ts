import type { UltraHonkVerifierBackend as VerifierBackend } from '@aztec/bb.js';
import { hexToBytes } from './format';
import type { ProofBundle } from './types';

/*
 * Independent, in-browser verification. Nothing is sent anywhere: the proof bundle and the
 * circuit's verification key are checked locally by Barretenberg (WASM).
 * bb.js is imported lazily, so the (large) WASM only loads when a viewer asks to verify.
 */
let backendPromise: Promise<{ api: { destroy(): Promise<void> }; verifier: VerifierBackend }> | null = null;
let vkPromise: Promise<Uint8Array> | null = null;

const G1_POINTS = 16;

async function fetchBytes(path: string): Promise<Uint8Array> {
  const r = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!r.ok) throw new Error(`${path} not found (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/**
 * Verification needs only the G2 point and the first few G1 points of the SRS. bb.js would otherwise
 * download ~20 MB of proving-key points on init, so we skip that and load the tiny public SRS we ship.
 */
async function getBackend() {
  backendPromise ??= (async () => {
    const [{ Barretenberg, UltraHonkVerifierBackend }, g1, g2] = await Promise.all([
      import('@aztec/bb.js'),
      fetchBytes('srs/bn254_g1_first16.dat'),
      fetchBytes('srs/bn254_g2.dat'),
    ]);
    const api = await Barretenberg.new({ threads: 1, skipSrsInit: true });
    await api.srsInitSrs({ pointsBuf: g1, numPoints: G1_POINTS, g2Point: g2 });
    return { api, verifier: new UltraHonkVerifierBackend(api) };
  })();
  return backendPromise;
}

function getVk(): Promise<Uint8Array> {
  vkPromise ??= fetchBytes('vk_evm');
  return vkPromise;
}

export interface VerifyOutcome {
  valid: boolean;
  ms: number;
  error?: string;
}

export async function verifyBundle(b: ProofBundle): Promise<VerifyOutcome> {
  const t0 = performance.now();
  try {
    const [{ verifier }, verificationKey] = await Promise.all([getBackend(), getVk()]);
    const valid = await verifier.verifyProof(
      { proof: hexToBytes(b.proof), publicInputs: b.publicInputs, verificationKey },
      { verifierTarget: 'evm' },
    );
    return { valid, ms: performance.now() - t0 };
  } catch (e) {
    return { valid: false, ms: performance.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}
