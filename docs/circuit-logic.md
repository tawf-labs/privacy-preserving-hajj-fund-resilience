# Circuit logic diagram

The paper's *Demonstration* phase calls for a circuit logic diagram that translates the economic solvency formula into arithmetic constraints.
This is the `hajj_solvency` circuit (`circuits/hajj_solvency/src`).

```mermaid
flowchart LR
    subgraph PRIV["Private witness (never in the proof)"]
      H["holdings[6]"]
      RT["return_bps[6]"]
      SUB["subsidy_per_pilgrim"]
      WL["waitlist_deposits"]
      SALT["salt"]
      SIG["attestor pk + signature"]
    end

    subgraph PUB["Public inputs"]
      PID["period_id"]
      MAC["fx_base, quota,<br/>sar_share_bps, tau_bps"]
      SCN["3 regimes:<br/>inflation, FX, discount,<br/>yield shock, haircuts[6]"]
      KH["attestor_key_hash"]
    end

    H & RT & SUB & WL & SALT --> COM["commitment =<br/>pedersen(witness, salt)"]
    MAC & SCN & PID --> PH["params_hash =<br/>pedersen(public params)"]
    COM & PH & PID --> MSG["message =<br/>pedersen(commitment, params_hash, period)"]
    SIG & MSG & KH --> VER{"key_hash(pk) == attestor_key_hash<br/>AND ecdsa_secp256k1 verifies"}
    VER -->|"constraint"| GO(("attested"))

    H & RT & SCN --> F["F_s = Σ h·(1-hc)<br/>+ PV of stressed income"]
    SUB & WL & MAC & SCN --> P["PVO_s = W + Σ_k q·m·esc_s(k) / (1+d_s)^k"]
    GO --> CMP
    F & P --> CMP{"F_s · 10000 ≥ tau · PVO_s"}
    CMP --> RB["result_bits[s]  (public)"]
    COM --> SID["statement_id =<br/>pedersen(domain, commitment, period)  (public)"]
    COM --> CO["commitment  (public)"]
```

## Constraints, in order

1. **Range checks** (`model.nr::validate`): every holding, return, subsidy, waitlist value, rate, haircut and FX ratio is bounded, so no free witness value can push arithmetic
   out of range. All intermediates are `u128`; an overflow is an assertion failure, never a silent wrap.
2. **Attestation** (`attest.nr`): recompute `commitment` and `params_hash` from the inputs, derive the message the attestor signs, require `key_hash(pk) == attestor_key_hash` and a valid
   secp256k1 signature. The signature covers the witness *and* every public parameter *and* the period.
3. **Model** (`model.nr`), for each regime *s*:
   * `fx_ratio = ⌈fx_s · 10000 / fx_base⌉`; `blend = ⌈((1−w)·10000 + w·fx_ratio) / 10000⌉`; `base = ⌈q · m · blend / 10000⌉`
   * escalate `H` times by `(1 + π_s)` (ceil), then discount by Horner's rule with `(1 + d_s)` (ceil): `PVO_s = W + PV`
   * `li_i = ⌊h_i · (1 − hc_{s,i}) / 10000⌋`; income `= Σ ⌊li_i · r_i / 10000⌋`; stressed by `(1 − ys_s)`; discounted `H` times (floor): `F_s = Σ li_i + PV`
   * assert `PVO_s > 0`; output `F_s · 10000 ≥ τ · PVO_s`
4. **Outputs**: `result_bits`, `statement_id`, `commitment`.

## Size

4,201 ACIR opcodes, 68,941 backend gates (circuit size 2^17) at H = 10; see `evaluation/results/benchmark.md` for H = 5 to 30.
