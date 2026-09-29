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
| Compile time | 1144.9 ms |

## Performance (avg (min - max), ms)

| Metric | Value |
| --- | --- |
| Witness generation | 31.4 (27.7 - 45.8) |
| Proof generation | 1488.5 (1410.6 - 1598.7) |
| Proof verification (bb.js) | 515.4 (483.9 - 536.7) |
| Proof size | 9,152 B |
| Peak RSS (after main run) | 615 MB |

## Horizon scaling

| H (years) | ACIR opcodes | Gates | Circuit size | Compile (ms) | Prove avg (ms) | Prove min-max (ms) | Proof (B) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 3,256 | 66,501 | 131,072 | 464.2 | 1468 | 1378 - 1555 | 9,152 |
| 10 | 4,201 | 68,941 | 131,072 | 1144.9 | 1553 | 1457 - 1629 | 9,152 |
| 20 | 6,091 | 73,824 | 131,072 | 550.7 | 1648 | 1617 - 1684 | 9,152 |
| 30 | 7,981 | 78,706 | 131,072 | 471.4 | 1603 | 1563 - 1674 | 9,152 |

## On-chain (Foundry, Solidity 0.8.31, optimizer runs=1)

| Function | Gas |
| --- | --- |
| HajjSolvencyRegistry.submitProof (incl. UltraHONK verification) | 2,857,322 |

Proving runs on WASM (single-threaded in Node); native `bb` is typically several times faster.
