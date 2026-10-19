# TEE Remote Attestation Pipeline

> **Related issue:** Closes #677  
> **See also:** `packages/shared/tee-attestation/index.ts`, `docs/security/tee-attestation-service.md`, `contracts/oracle/src/lib.rs`

---

## Overview

This document describes the hardened remote attestation pipeline that validates AWS Nitro Enclave attestation documents before StellarVeriphy accepts a certificate mint.

The pipeline is implemented as a pure TypeScript validation layer in `packages/shared/tee-attestation/index.ts` and integrates with:

- `contracts/oracle` — on-chain attestation submission and signature verification.
- `contracts/registry` — approved TEE code hash allow-list.
- `frontend/services/teeAttestationService.ts` — off-chain orchestration.

---

## Trust assumptions

Before a certificate is minted, **all** of the following must be true:

1. The attestation document was produced by a genuine AWS Nitro Enclave (platform state validated by the hardware root of trust).
2. The enclave's PCR measurements (PCR0, PCR1, PCR2) match an approved set configured by the platform admin.
3. The enclave's code measurement hash (`enclaveImageHash`) is present in `contracts/registry` approved hash allow-list.
4. The attestation document was produced within the maximum allowed staleness window (default: 300 seconds).
5. The nonce in the attestation document matches the nonce supplied in the original verification request (preventing replay attacks).
6. The `userData` field encodes the expected verification job ID (binding the attestation to the specific job).
7. The signing public key matches a registered oracle provider key in `contracts/oracle`.

Failure of any single check causes the attestation to be **rejected**.  The failing check's `AttestationFailureCode` is recorded and an admin alert is generated.

---

## Pipeline validation checks

`evaluateAttestationPipeline` runs the following checks in order:

| Check | Failure code | Severity |
|---|---|---|
| Document well-formedness (required fields present) | `document_malformed` | Warning |
| Staleness (document age ≤ `maxAgeSeconds`) | `staleness_exceeded` | Warning |
| Nonce binding | `nonce_mismatch` | Critical |
| User data / job ID binding | `user_data_mismatch` | Warning |
| PCR0 measurement | `pcr_mismatch` | Critical |
| PCR1 measurement | `pcr_mismatch` | Critical |
| PCR2 measurement | `pcr_mismatch` | Critical |
| Code hash registry membership | `code_hash_not_approved` | Critical |
| Provider public key registration | `public_key_not_registered` | Critical |

The first failing check sets `primaryFailureCode` in the result.  All checks are run regardless, so the result includes the full diagnostic picture.

---

## Expected measurements configuration

Administrators configure expected measurements in `ExpectedMeasurements`:

| Field | Purpose |
|---|---|
| `approvedPcr0` | Approved PCR0 values (multiple allows brief overlap during enclave rotation) |
| `approvedPcr1` | Approved PCR1 values |
| `approvedPcr2` | Approved PCR2 values |
| `approvedCodeHashes` | Code hashes approved in `contracts/registry` |
| `maxAgeSeconds` | Maximum document age (default: 300) |

Multiple approved values per PCR register support zero-downtime enclave image rotation: the old and new code hash coexist in the approved set during the drain window.

---

## Failure codes and recommended actions

| Failure code | Recommended operator action |
|---|---|
| `document_malformed` | Inspect raw attestation document from oracle node logs; check for truncation or encoding issues |
| `signature_invalid` | Suspend the provider immediately; audit recent attestations; contact oracle operator |
| `certificate_invalid` | Rebuild the enclave image; re-register the new code hash |
| `pcr_mismatch` | Suspend the provider; audit the enclave build pipeline for tampering |
| `code_hash_not_approved` | Register the new hash in `contracts/registry`, or reject if the image is unexpected |
| `nonce_mismatch` | Reject; notify the security team (possible replay or substitution attack) |
| `staleness_exceeded` | Ensure oracle node clocks are synchronised; attestation must be generated close to submission time |
| `user_data_mismatch` | Reject; attestation is not bound to the expected job |
| `public_key_not_registered` | Register the provider via `contracts/oracle.register_provider` |
| `platform_state_invalid` | Suspend the provider; investigate the hardware environment |
| `unknown_module` | Verify oracle node configuration; check for unexpected NSM module version |

---

## Admin alerts

`buildAdminAlert` converts a failed pipeline result into a structured `AttestationAdminAlert` with:

- `severity` — `info`, `warning`, or `critical` (see severity map in the module).
- `title` / `message` — human-readable for dashboards and Slack/PagerDuty integration.
- `recommendedAction` — operator action in plain text.

`critical` alerts should trigger immediate operator notification.  `warning` alerts should be logged and reviewed within the next operational window.

---

## Adversarial testing

`buildAdversarialScenarios` generates test vectors for each failure code:

| Scenario | Expected failure code |
|---|---|
| Empty `documentId` | `document_malformed` |
| Timestamp 1 hour in the past | `staleness_exceeded` |
| Wrong nonce | `nonce_mismatch` |
| Wrong job ID in `userData` | `user_data_mismatch` |
| Unknown PCR0 value | `pcr_mismatch` |
| Unapproved code hash | `code_hash_not_approved` |
| Unregistered provider public key | `public_key_not_registered` |

These vectors are consumed by unit tests to ensure the pipeline rejects all documented adversarial inputs.

---

## Integration with the oracle contract

The on-chain `contracts/oracle.verify_attestation` function performs:

1. **Ed25519 signature verification** over the attestation payload using `env.crypto().ed25519_verify`.
2. **TEE hash approval** check against `contracts/registry`.
3. **Certificate minting** via `contracts/provenance.mint` on success.

The off-chain pipeline (`evaluateAttestationPipeline`) performs complementary structural and policy checks before the transaction is submitted to the chain.  Both layers must pass.

---

## Code hash lifecycle

When a new enclave image is built:

1. The new image's PCR measurements and `enclaveImageHash` are obtained from the build output.
2. A governance proposal (`register_tee_hash`) is submitted and approved.
3. The new hash is added to `contracts/registry` and to `ExpectedMeasurements.approvedCodeHashes`.
4. The old hash remains in both until all in-flight jobs using it have completed (drain window).
5. The old hash is removed via a `revoke_tee_hash` proposal.

See `docs/security/key-rotation-revocation.md` — TEE enclave rotation procedure.

---

## References

- `packages/shared/tee-attestation/index.ts` — pipeline implementation
- `docs/security/tee-attestation-service.md` — TEE service architecture
- `contracts/oracle/src/lib.rs` — on-chain attestation verification
- `contracts/registry/src/lib.rs` — code hash allow-list
- `docs/adr/0004-tee-oracle-trust-model.md` — why the TEE trust model was chosen
- `docs/security/key-rotation-revocation.md` — enclave key rotation procedures
