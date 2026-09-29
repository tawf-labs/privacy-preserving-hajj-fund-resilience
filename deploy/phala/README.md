# Attestor on Phala Cloud (Intel TDX)

Runs Layer 2 (`packages/attestor`) inside a Phala confidential VM.

```bash
phala deploy --compose deploy/phala/docker-compose.yml --name hajj-attestor -t tdx.medium --wait
phala apps --search hajj-attestor
phala cvms attestation hajj-attestor
```

## How it is put together

* **Code identity.** The stock `node:22-bookworm` image clones this repository at the commit pinned in
  `COMMIT` and fails if `HEAD` differs. The compose file, and therefore the commit, is covered by the
  `compose-hash` event in the TDX event log (RTMR3). Changing the commit changes the attested identity.
* **Key custody.** With no `ATTESTOR_SECRET_KEY`, the attestor asks the dstack KMS for a key
  (`/var/run/dstack.sock`, path `hajj-zk/attestor/secp256k1/v1`). The key is derived inside the TEE, is bound to the
  app id, is stable across restarts, and is never visible to the operator. No secret is passed in.
* **Report.** Each attestation report carries a real TDX quote whose `report_data` is the SHA-256 of the
  message the attestor signed, so the quote is bound to that exact attestation.
* **Endpoints.** `GET /info` shows `mode: "tdx"`, `keySource: "dstack-kms"`, the enclave measurement and the
  attestor key hash the regulator pins on-chain. `POST /attest-and-prove` returns only the proof bundle.

## Current deployment

| | |
| --- | --- |
| Name / instance | `hajj-attestor`, `tdx.medium` (2 vCPU, 4 GB) |
| App ID | `56591b977ab4bfba15c6283fbe0dc838f0e33330` |
| Public URL | `https://56591b977ab4bfba15c6283fbe0dc838f0e33330.dstack-pha-prod5.phala.network` |
| Attestor key hash | `0x17f720e1abdf1265189cfd1371a33d44d14ea0bd39179052449cbdc3cc90978d` |

The key hash is what the regulator passes to `pinPeriod` (public input 35). It is derived from the app id, so it
changes if the app is recreated under a new id.

## Caveats

* **The remote quote is not yet verified end to end.** Phala reports the CVM attestation as online, but nothing in this repo
  yet verifies the quote against the `attestorKeyHash` (for example, checking the quote's `report_data` and the
  compose hash against a pinned value). Until a verifier does that, a reader has to trust Phala's attestation page.
* **Trust in the operator is reduced, not removed.** The image is pulled by tag (`node:22-bookworm`), and the
  install step downloads npm packages at boot. Pin the image by digest and vendor dependencies before relying on
  this for anything real.
* **Inputs are still synthetic.** The source registry (`data/synthetic/sources/registry.json`) lives in the pinned commit.
  In production the digests must come from the issuers over authenticated channels.
