/*
 * Simulated Trusted Execution Environment (Layer 2).
 *
 * Inside the enclave boundary the service:
 *   1. authenticates every macro source and the custodian ledger against registered digests;
 *   2. derives the circuit's public parameters only from those sources;
 *   3. aggregates the position-level ledger into the class-level private witness;
 *   4. signs pedersen(commitment(witness, salt), params_hash, period) with its
 *      secp256k1 key, the exact message the circuit checks (attest.nr).
 *
 * The signing key never leaves the enclave. `attestAndProve` also runs the prover
 * inside the boundary, so the witness itself never leaves: only the proof bundle does.
 *
 * Key custody, in order of preference:
 *   1. `ATTESTOR_SECRET_KEY` (explicit, operator-held);
 *   2. Phala dstack KMS (`/var/run/dstack.sock`): the key is derived inside the TEE, bound to the
 *      app id, and never known to any human. The report then carries a real Intel TDX quote;
 *   3. the public development key (tests only; `usingDevKey` is reported by /info).
 *
 * Off-TEE the hardware root of trust is simulated: `report` is then a signed JSON document,
 * with `enclaveMeasurement` (a hash of the source files) standing in for MRTD.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  attestationMessage,
  CIRCUIT_ARTIFACT,
  commitWitness,
  DEV_ATTESTOR_SECRET,
  keyHash,
  paramsHash,
  publicKeyFromSecret,
  signMessage,
  SolvencyProver,
  toBundle,
  toCircuitInputs,
  toHex32,
  witnessFromLedger,
  type AttestorPublicKey,
  type ProofBundle,
} from '@hajj-zk/prover';
import { validate, witnessToJson, type Ledger, type PrivateWitnessJson, type PublicParams } from '@hajj-zk/solvency-model';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { canonicalJson, sha256Hex } from './canonical.js';
import {
  AttestationError,
  authenticateSources,
  loadRegistry,
  publicParamsFromSources,
  type MacroSources,
  type SourceRegistry,
} from './sources.js';

const hex = (b: Uint8Array) => `0x${Buffer.from(b).toString('hex')}` as const;

export interface AttestationRequest {
  ledger: Ledger;
  sources: MacroSources;
  /** Optional blinding factor; a fresh 248-bit salt is drawn if omitted. */
  salt?: string;
}

export interface AttestationReport {
  mode: 'simulated-tee' | 'tdx';
  platform: string;
  enclaveMeasurement: string;
  circuitArtifactDigest: string;
  attestorKeyHash: `0x${string}`;
  periodId: number;
  /** sha256 of the signed message: binds the report to one attestation. */
  reportData: string;
  sourceDigests: SourceRegistry['macro'];
  ledgerDigest: string;
  issuedAt: string;
  /** Intel TDX quote (hex) whose report_data commits to `reportData`. Present only inside a real TEE. */
  tdxQuote?: string;
  reportSignature: `0x${string}`;
}

export type KeySource = 'env' | 'dstack-kms' | 'dev';

/** Returns a TDX quote whose report_data is the given 32 bytes. */
export type QuoteFn = (reportData: Uint8Array) => Promise<string>;

export const DSTACK_SOCKET = process.env.DSTACK_SOCKET ?? '/var/run/dstack.sock';
const KMS_KEY_PATH = 'hajj-zk/attestor/secp256k1/v1';

export interface AttestationResult {
  periodId: number;
  publicParams: PublicParams;
  witness: PrivateWitnessJson;
  commitment: `0x${string}`;
  paramsHash: `0x${string}`;
  message: `0x${string}`;
  signature: `0x${string}`;
  publicKey: { x: `0x${string}`; y: `0x${string}` };
  attestorKeyHash: `0x${string}`;
  report: AttestationReport;
}

function measureEnclave(): string {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.ts')).sort();
  return sha256Hex(files.map((f) => `${f}\n${readFileSync(join(srcDir, f), 'utf8')}`).join('\n'));
}

export class SimulatedEnclave {
  readonly publicKey: AttestorPublicKey;
  readonly measurement: string;
  readonly circuitDigest: string;
  readonly usingDevKey: boolean;
  readonly keySource: KeySource;
  private readonly secret: Uint8Array;
  private readonly quoteFn?: QuoteFn;
  private prover: SolvencyProver | null = null;
  private keyHashCache: bigint | null = null;

  constructor(
    private readonly registry: SourceRegistry = loadRegistry(),
    secretHex = process.env.ATTESTOR_SECRET_KEY,
    extras: { keySource?: KeySource; quoteFn?: QuoteFn } = {},
  ) {
    this.usingDevKey = !secretHex;
    this.keySource = extras.keySource ?? (secretHex ? 'env' : 'dev');
    this.quoteFn = extras.quoteFn;
    this.secret = secretHex ? Uint8Array.from(Buffer.from(secretHex.replace(/^0x/, ''), 'hex')) : DEV_ATTESTOR_SECRET;
    if (this.secret.length !== 32) throw new Error('ATTESTOR_SECRET_KEY must be 32 bytes of hex');
    this.publicKey = publicKeyFromSecret(this.secret);
    this.measurement = measureEnclave();
    this.circuitDigest = sha256Hex(readFileSync(CIRCUIT_ARTIFACT));
  }

  /**
   * Chooses the key source for a running service: explicit env key, else the dstack KMS when the
   * TEE socket is present, else the public dev key.
   */
  static async fromEnvironment(registry: SourceRegistry = loadRegistry()): Promise<SimulatedEnclave> {
    const explicit = process.env.ATTESTOR_SECRET_KEY;
    if (explicit || !existsSync(DSTACK_SOCKET)) return new SimulatedEnclave(registry, explicit);

    const { DstackClient } = await import('@phala/dstack-sdk');
    const client = new DstackClient(DSTACK_SOCKET);
    const { key } = await client.getKey(KMS_KEY_PATH, 'signing');
    // Expand the KMS key material into a valid secp256k1 scalar (domain-separated, rejection-sampled).
    let secret: Uint8Array | undefined;
    for (let i = 0; i < 256 && !secret; i++) {
      const cand = createHash('sha256').update('hajj-zk/attestor/secp256k1').update(key).update(Buffer.from([i])).digest();
      if (secp256k1.utils.isValidSecretKey(cand)) secret = cand;
    }
    if (!secret) throw new Error('could not derive a valid secp256k1 key from the KMS');
    const quoteFn: QuoteFn = async (data) => (await client.getQuote(data)).quote;
    return new SimulatedEnclave(registry, Buffer.from(secret).toString('hex'), { keySource: 'dstack-kms', quoteFn });
  }

  async keyHash(): Promise<bigint> {
    this.keyHashCache ??= await keyHash(this.publicKey);
    return this.keyHashCache;
  }

  async info() {
    return {
      mode: this.quoteFn ? ('tdx' as const) : ('simulated-tee' as const),
      enclaveMeasurement: this.measurement,
      circuitArtifactDigest: this.circuitDigest,
      attestorKeyHash: toHex32(await this.keyHash()),
      publicKey: { x: hex(this.publicKey.x), y: hex(this.publicKey.y) },
      keySource: this.keySource,
      usingDevKey: this.usingDevKey,
      periodId: this.registry.periodId,
      registeredSources: this.registry.macro,
      registeredLedgers: Object.keys(this.registry.ledgers),
    };
  }

  async attest(req: AttestationRequest): Promise<AttestationResult> {
    if (!req?.ledger || !req?.sources) throw new AttestationError('BAD_REQUEST', 'ledger and sources are required');
    authenticateSources(this.registry, req.sources, req.ledger);
    const pub = publicParamsFromSources(req.sources);

    const salt = req.salt ? BigInt(req.salt) : BigInt(hex(randomBytes(31)));
    const witness = witnessFromLedger(req.ledger, salt);
    try {
      validate(pub, witness);
    } catch (e) {
      throw new AttestationError('OUT_OF_RANGE', (e as Error).message);
    }

    const commitment = await commitWitness(witness);
    const params = await paramsHash(pub);
    const message = await attestationMessage(commitment, params, pub.periodId);
    const signature = signMessage(this.secret, message);
    const attestorKeyHash = toHex32(await this.keyHash());

    const reportData = createHash('sha256').update(message).digest();
    const tdxQuote = this.quoteFn ? await this.quoteFn(reportData) : undefined;
    const unsigned = {
      mode: tdxQuote ? ('tdx' as const) : ('simulated-tee' as const),
      platform: tdxQuote ? 'Phala dstack / Intel TDX' : 'simulated (Phala dstack / Intel TDX ready)',
      enclaveMeasurement: this.measurement,
      circuitArtifactDigest: this.circuitDigest,
      attestorKeyHash,
      periodId: pub.periodId,
      reportData: reportData.toString('hex'),
      sourceDigests: this.registry.macro,
      ledgerDigest: sha256Hex(canonicalJson(req.ledger)),
      issuedAt: new Date().toISOString(),
      ...(tdxQuote ? { tdxQuote } : {}),
    };
    const reportDigest = Uint8Array.from(Buffer.from(sha256Hex(canonicalJson(unsigned)), 'hex'));
    const report: AttestationReport = { ...unsigned, reportSignature: hex(signMessage(this.secret, reportDigest)) };

    return {
      periodId: pub.periodId,
      publicParams: pub,
      witness: witnessToJson(witness),
      commitment: toHex32(commitment),
      paramsHash: toHex32(params),
      message: hex(message),
      signature: hex(signature),
      publicKey: { x: hex(this.publicKey.x), y: hex(this.publicKey.y) },
      attestorKeyHash,
      report,
    };
  }

  /** Attests and proves inside the enclave; only the public proof bundle leaves. */
  async attestAndProve(req: AttestationRequest): Promise<{ bundle: ProofBundle; report: AttestationReport; proveMs: number }> {
    const att = await this.attest(req);
    const witness = witnessFromLedger(req.ledger, BigInt(att.witness.salt));
    const inputs = await toCircuitInputs(att.publicParams, witness, {
      publicKey: this.publicKey,
      signature: Uint8Array.from(Buffer.from(att.signature.slice(2), 'hex')),
    });
    this.prover ??= new SolvencyProver();
    const r = await this.prover.prove(inputs);
    return {
      bundle: toBundle(att.publicParams, r, this.prover.program.noir_version ?? 'unknown'),
      report: att.report,
      proveMs: r.timings.proveMs,
    };
  }
}
