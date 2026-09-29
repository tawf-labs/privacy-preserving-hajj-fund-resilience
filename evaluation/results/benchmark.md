# Cryptographic benchmark

## Environment

| Metric | Value |
| --- | --- |
| Noir | 1.0.0-rc.3+5a7ee9bf5ed8973076df7bb0d2b723024db09ae7 |
| Backend | Barretenberg UltraHonk via @aztec/bb.js 5.2.0 (WASM), verifierTarget=evm |
| Node | v22.22.2 |
| OS | linux 6.18.44-fc-v37 |
| CPU | Intel(R) Xeon(R) Processor @ 2.10GHz x 4 |
| Memory | 15.7 GB |
| Runs (n) | 10 |

## Circuit (H = 10)

| Metric | Value |
| --- | --- |
| ACIR opcodes | 4,201 |
| Backend gates | 68,941 |
| Circuit size (dyadic) | 131,072 |
| Public inputs | 41 |
| Verification key | 1,888 B |
| Compile time | 1128.7 ms |

## Performance (avg (min - max), ms)

| Metric | Value |
| --- | --- |
| Witness generation | 31.0 (28.1 - 44.5) |
| Proof generation | 1491.2 (1396.6 - 1671.9) |
| Proof verification (bb.js) | 512.0 (486.8 - 533.7) |
| Proof size | 9,152 B |
| Peak RSS (after main run) | 565 MB |

## Horizon scaling

| H (years) | ACIR opcodes | Gates | Circuit size | Compile (ms) | Prove avg (ms) | Prove min-max (ms) | Proof (B) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 3,256 | 66,501 | 131,072 | 490.7 | 1362 | 1335 - 1380 | 9,152 |
| 10 | 4,201 | 68,941 | 131,072 | 1128.7 | 1436 | 1415 - 1451 | 9,152 |
| 20 | 6,091 | 73,824 | 131,072 | 473.9 | 1616 | 1528 - 1731 | 9,152 |
| 30 | 7,981 | 78,706 | 131,072 | 476.8 | 1626 | 1595 - 1664 | 9,152 |

## On-chain (Foundry, Solidity 0.8.31, optimizer runs=1)

| Function | EVM pricing | Gas |
| --- | --- | --- |
| HajjSolvencyRegistry.submitProof (incl. UltraHONK verification) | Cancun / Prague | 2,857,322 |
| HajjSolvencyRegistry.submitProof (incl. UltraHONK verification) | Osaka (EIP-7883 modexp repricing) | 4,115,356 |

Figures exclude the 21,000 base cost and calldata (~150k for a 9 KB proof). A local anvil transaction (Osaka pricing) used 4,285,115 gas in total.

Proving runs on WASM (single-threaded in Node); native `bb` is typically several times faster.
