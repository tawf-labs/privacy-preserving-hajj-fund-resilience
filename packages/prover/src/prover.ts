import { UltraHonkBackend, type ProofData } from '@aztec/bb.js';
import { Noir, type CompiledCircuit, type InputMap } from '@noir-lang/noir_js';
import { getBarretenberg } from './encoding.js';
import { loadArtifact } from './compile.js';

/** EVM target: keccak transcript + ZK, verifiable by the generated HonkVerifier.sol. */
export const VERIFIER_TARGET = 'evm' as const;

export interface CircuitOutputs {
  resultBits: boolean[];
  statementId: bigint;
  commitment: bigint;
}

export function decodeReturnValue(rv: unknown): CircuitOutputs {
  const [bits, sid, com] = rv as [Array<string | boolean>, string, string];
  return {
    resultBits: bits.map((b) => b === true || BigInt(b as string) === 1n),
    statementId: BigInt(sid),
    commitment: BigInt(com),
  };
}

export interface ProveResult extends CircuitOutputs {
  proof: ProofData;
  timings: { witnessMs: number; proveMs: number };
}

/** Thin wrapper over noir_js + bb.js UltraHonk for the solvency circuit. */
export class SolvencyProver {
  readonly noir: Noir;
  private backend: UltraHonkBackend | null = null;

  constructor(readonly program: CompiledCircuit & { noir_version?: string } = loadArtifact()) {
    this.noir = new Noir(program);
  }

  private async getBackend(): Promise<UltraHonkBackend> {
    this.backend ??= new UltraHonkBackend(this.program.bytecode, await getBarretenberg());
    return this.backend;
  }

  /** Executes the circuit (witness generation). Throws if any constraint fails. */
  async execute(inputs: InputMap): Promise<{ witness: Uint8Array; outputs: CircuitOutputs; ms: number }> {
    const t0 = performance.now();
    const { witness, returnValue } = await this.noir.execute(inputs);
    return { witness, outputs: decodeReturnValue(returnValue), ms: performance.now() - t0 };
  }

  async prove(inputs: InputMap): Promise<ProveResult> {
    const exec = await this.execute(inputs);
    const backend = await this.getBackend();
    const t0 = performance.now();
    const proof = await backend.generateProof(exec.witness, { verifierTarget: VERIFIER_TARGET });
    return { ...exec.outputs, proof, timings: { witnessMs: exec.ms, proveMs: performance.now() - t0 } };
  }

  async verify(proof: ProofData): Promise<boolean> {
    return (await this.getBackend()).verifyProof(proof, { verifierTarget: VERIFIER_TARGET });
  }

  async verificationKey(): Promise<Uint8Array> {
    return (await this.getBackend()).getVerificationKey({ verifierTarget: VERIFIER_TARGET });
  }

  async solidityVerifier(): Promise<string> {
    const backend = await this.getBackend();
    return backend.getSolidityVerifier(await this.verificationKey(), { verifierTarget: VERIFIER_TARGET });
  }
}
