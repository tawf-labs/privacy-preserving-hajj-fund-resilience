/*
 * Cryptographic benchmark (paper Section IV-B). Output format follows
 * tawf-labs/zkt-research benchmarks/v9-benchmarks-v2.md.
 *
 *   - compile time, ACIR opcodes, backend gates, circuit size
 *   - witness / prove / verify time (n = BENCH_RUNS, default 10) with avg / min / max
 *   - proof size, verification-key size, public inputs, peak RSS
 *   - horizon scaling: H in {5, 10, 20, 30}
 *   - on-chain gas for HajjSolvencyRegistry.submitProof (Foundry)
 */
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, totalmem } from 'node:os';
import { join } from 'node:path';
import {
  buildInputs,
  circuitStats,
  compileCircuit,
  compileWithHorizon,
  destroyBarretenberg,
  loadArtifact,
  loadLedger,
  loadPublicParams,
  REPO_ROOT,
  SolvencyProver,
  witnessFromLedger,
} from '@hajj-zk/prover';
import { mdTable, stats, writeResult } from './common.js';

const RUNS = Number(process.env.BENCH_RUNS ?? 10);
const HORIZONS = (process.env.BENCH_HORIZONS ?? '5,10,20,30').split(',').map(Number);
const HORIZON_RUNS = Number(process.env.BENCH_HORIZON_RUNS ?? 3);

const pub = loadPublicParams();
const witness = witnessFromLedger(loadLedger('strained'), 0x5eedn);
const peakRssMb = () => process.resourceUsage().maxRSS / 1024;
const ms = (x: number) => Number(x.toFixed(1));

async function measure(prover: SolvencyProver, runs: number) {
  const inputs = await buildInputs(pub, witness);
  await prover.prove(inputs); // warm-up (SRS load, JIT); not counted
  const witnessMs: number[] = [];
  const proveMs: number[] = [];
  const verifyMs: number[] = [];
  let proofBytes = 0;
  let publicInputs = 0;
  for (let i = 0; i < runs; i++) {
    const r = await prover.prove(inputs);
    witnessMs.push(r.timings.witnessMs);
    proveMs.push(r.timings.proveMs);
    const t0 = performance.now();
    const ok = await prover.verify(r.proof);
    verifyMs.push(performance.now() - t0);
    if (!ok) throw new Error('proof failed to verify during benchmark');
    proofBytes = r.proof.proof.length;
    publicInputs = r.proof.publicInputs.length;
  }
  return { witness: stats(witnessMs), prove: stats(proveMs), verify: stats(verifyMs), proofBytes, publicInputs };
}

/**
 * submitProof gas measured by Foundry (excludes calldata and the 21k base). The verifier calls the modexp
 * precompile heavily, and EIP-7883 (Osaka) reprices it, so we report both pricing regimes.
 */
function gasOnChain(): { submitProofCancun?: number; submitProofOsaka?: number; note?: string } {
  const out: { submitProofCancun?: number; submitProofOsaka?: number; note?: string } = {};
  for (const [key, evm] of [['submitProofCancun', 'cancun'], ['submitProofOsaka', 'osaka']] as const) {
    try {
      const text = execFileSync(
        'bash',
        [join(REPO_ROOT, 'scripts/forge.sh'), 'test', '--match-test', 'test_gas_submit', '-vv', '--evm-version', evm],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 },
      );
      const m = text.match(/submitProof gas:\s+(\d+)/);
      if (m) out[key] = Number(m[1]);
      else out.note = `gas line not found for ${evm}`;
    } catch (e) {
      out.note = `forge unavailable: ${(e as Error).message.split('\n')[0]}`;
    }
  }
  return out;
}

export async function runBench() {
  const compiled = await compileCircuit();
  const program = loadArtifact();
  const prover = new SolvencyProver(program);
  const cs = await circuitStats(program);
  const vk = await prover.verificationKey();

  const main = await measure(prover, RUNS);
  const rssAfterMain = peakRssMb();

  const horizon: Array<{ h: number; compileMs: number; acirOpcodes: number; gates: number; gatesDyadic: number; prove: ReturnType<typeof stats>; proofBytes: number }> = [];
  for (const h of HORIZONS) {
    const c = h === 10 ? { program, ms: compiled.ms } : await compileWithHorizon(h);
    const st = await circuitStats(c.program);
    const m = await measure(new SolvencyProver(c.program), HORIZON_RUNS);
    horizon.push({ h, compileMs: ms(c.ms), acirOpcodes: st.acirOpcodes, gates: st.gates, gatesDyadic: st.gatesDyadic, prove: m.prove, proofBytes: m.proofBytes });
  }

  const gas = gasOnChain();
  await destroyBarretenberg();

  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      os: `${platform()} ${release()}`,
      cpus: cpus().length,
      cpuModel: cpus()[0]?.model,
      memoryGb: Number((totalmem() / 2 ** 30).toFixed(1)),
      noir: (program as { noir_version?: string }).noir_version,
      backend: 'Barretenberg UltraHonk via @aztec/bb.js 5.2.0 (WASM), verifierTarget=evm',
      runs: RUNS,
    },
    circuit: {
      ...cs,
      compileMs: ms(compiled.ms),
      publicInputs: main.publicInputs,
      verificationKeyBytes: vk.length,
    },
    performance: {
      witnessMs: main.witness,
      proveMs: main.prove,
      verifyMs: main.verify,
      proofBytes: main.proofBytes,
      peakRssMbAfterMain: Number(rssAfterMain.toFixed(0)),
      peakRssMbTotal: Number(peakRssMb().toFixed(0)),
    },
    horizonScaling: horizon,
    onChain: gas,
  };
  writeResult('benchmark.json', result);
  writeResult('benchmark.md', renderMarkdown(result));
  return result;
}

function renderMarkdown(r: Awaited<ReturnType<typeof runBench>>): string {
  const p = r.performance;
  const f = (s: { avg: number; min: number; max: number }) => `${s.avg.toFixed(1)} (${s.min.toFixed(1)} - ${s.max.toFixed(1)})`;
  const hz = mdTable(
    ['H (years)', 'ACIR opcodes', 'Gates', 'Circuit size', 'Compile (ms)', 'Prove avg (ms)', 'Prove min-max (ms)', 'Proof (B)'],
    r.horizonScaling.map((x) => [x.h, x.acirOpcodes.toLocaleString('en-US'), x.gates.toLocaleString('en-US'), x.gatesDyadic.toLocaleString('en-US'), x.compileMs, x.prove.avg.toFixed(0), `${x.prove.min.toFixed(0)} - ${x.prove.max.toFixed(0)}`, x.proofBytes.toLocaleString('en-US')]),
  );
  return `# Cryptographic benchmark

## Environment

${mdTable(['Metric', 'Value'], [
    ['Noir', r.environment.noir ?? '?'],
    ['Backend', r.environment.backend],
    ['Node', r.environment.node],
    ['OS', r.environment.os],
    ['CPU', `${r.environment.cpuModel} x ${r.environment.cpus}`],
    ['Memory', `${r.environment.memoryGb} GB`],
    ['Runs (n)', r.environment.runs],
  ])}

## Circuit (H = 10)

${mdTable(['Metric', 'Value'], [
    ['ACIR opcodes', r.circuit.acirOpcodes.toLocaleString('en-US')],
    ['Backend gates', r.circuit.gates.toLocaleString('en-US')],
    ['Circuit size (dyadic)', r.circuit.gatesDyadic.toLocaleString('en-US')],
    ['Public inputs', r.circuit.publicInputs],
    ['Verification key', `${r.circuit.verificationKeyBytes.toLocaleString('en-US')} B`],
    ['Compile time', `${r.circuit.compileMs} ms`],
  ])}

## Performance (avg (min - max), ms)

${mdTable(['Metric', 'Value'], [
    ['Witness generation', f(p.witnessMs)],
    ['Proof generation', f(p.proveMs)],
    ['Proof verification (bb.js)', f(p.verifyMs)],
    ['Proof size', `${p.proofBytes.toLocaleString('en-US')} B`],
    ['Peak RSS (after main run)', `${p.peakRssMbAfterMain} MB`],
  ])}

## Horizon scaling

${hz}

## On-chain (Foundry, Solidity 0.8.31, optimizer runs=1)

${mdTable(['Function', 'EVM pricing', 'Gas'], [
    ['HajjSolvencyRegistry.submitProof (incl. UltraHONK verification)', 'Cancun / Prague', r.onChain.submitProofCancun?.toLocaleString('en-US') ?? `n/a (${r.onChain.note})`],
    ['HajjSolvencyRegistry.submitProof (incl. UltraHONK verification)', 'Osaka (EIP-7883 modexp repricing)', r.onChain.submitProofOsaka?.toLocaleString('en-US') ?? `n/a (${r.onChain.note})`],
  ])}

Figures exclude the 21,000 base cost and calldata (~150k for a 9 KB proof). A local anvil transaction (Osaka pricing) used 4,285,115 gas in total.

Proving runs on WASM (single-threaded in Node); native \`bb\` is typically several times faster.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await runBench();
  console.log(`gates ${r.circuit.gates} (size ${r.circuit.gatesDyadic}), opcodes ${r.circuit.acirOpcodes}`);
  console.log(`prove avg ${r.performance.proveMs.avg.toFixed(0)} ms, verify avg ${r.performance.verifyMs.avg.toFixed(0)} ms, proof ${r.performance.proofBytes} B, vk ${r.circuit.verificationKeyBytes} B`);
  for (const h of r.horizonScaling) console.log(`H=${h.h}: gates ${h.gates}, prove ${h.prove.avg.toFixed(0)} ms`);
  console.log(`gas submitProof: cancun ${r.onChain.submitProofCancun ?? r.onChain.note}, osaka ${r.onChain.submitProofOsaka ?? r.onChain.note}`);
}
