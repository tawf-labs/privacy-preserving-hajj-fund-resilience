import { runBench } from './bench.js';
import { runDer } from './der.js';
import { runStress } from './stress.js';
import { pct, RESULTS_DIR, writeResult } from './common.js';

const stress = await runStress();
const der = await runDer();
const bench = await runBench();

const summary = `# Evaluation summary

Generated ${new Date().toISOString()} from synthetic data. See stress.md, benchmark.md and der.md.

* Stress test: circuit output equals the reference model in all ${stress.rows.length} (state, regime) cells: **${stress.allAgree}**.
  Baseline-only valuation would certify ${stress.baselineOnlyCertified.length} of 3 funds; only ${stress.fullyResilient.length} survive every regime.
* Benchmark: ${bench.circuit.gates.toLocaleString('en-US')} gates, prove ${bench.performance.proveMs.avg.toFixed(0)} ms, verify ${bench.performance.verifyMs.avg.toFixed(0)} ms, proof ${bench.performance.proofBytes.toLocaleString('en-US')} B, submitProof gas ${bench.onChain.submitProof?.toLocaleString('en-US') ?? 'n/a'}.
* DER (conservative): ${der.rows.map((r) => `${r.state} ${pct(r.derConservative, 3)}`).join(', ')}.
`;
writeResult('SUMMARY.md', summary);
console.log(summary);
console.log(`results in ${RESULTS_DIR}`);
