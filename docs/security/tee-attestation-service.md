# TEE Attestation Verification Service

This document describes the attestation verification service that validates AWS Nitro Enclave attestations and binds verification results to the correct content registration and provenance context. Closes #657.

See `docs/adr/0004-tee-oracle-trust-model.md` for the architectural decision that established the TEE trust model this service operates within.

---

## Overview

Off-chain verification runs inside an AWS Nitro Enclave. The enclave produces a signed attestation document after running content verification. This service — implemented in `frontend/services/teeAttestationService.ts` — is the off-chain component that:

1. Receives a raw Nitro attestation document from the enclave.
2. Validates enclave identity (code hash, PCR values, signing certificate chain).
3. Extracts and verifies the verification payload bound inside the attestation.
4. Confirms the payload matches the content record being processed.
5. Returns a structured, auditable result ready for submission to `contracts/oracle.verify_attestation`.

---

## Trust Chain

```
AWS Nitro Enclave
  │  generates attestation document at verification time
  │  signs with enclave-internal ed25519 key (never exported)
  ▼
TEE Attestation Service (this service)
  │  validates Nitro attestation CBOR structure
  │  checks PCR0 (enclave image hash) against registry-approved list
  │  verifies AWS Nitro root certificate chain
  │  extracts payload and confirms content/record binding
  ▼
contracts/oracle.verify_attestation()
  │  re-verifies ed25519 signature on-chain
  │  cross-calls contracts/registry.is_tee_hash_approved()
  │  cross-calls contracts/registry.is_provider()
  ▼
contracts/provenance.mint()
  mints certificate if all checks pass
```

---

## Attestation Validation Steps

### Step 1: Structural Validation

The Nitro attestation document is a CBOR-encoded COSE_Sign1 structure. The service validates:
- The outer COSE_Sign1 envelope is well-formed.
- The protected header specifies the expected algorithm (`ES384`).
- The payload is a valid attestation document.

Any structural failure produces `AttestationError.MalformedDocument` and is logged with severity `critical`.

### Step 2: Certificate Chain Verification

The attestation document includes a certificate chain terminating at the AWS Nitro root CA. The service:
- Verifies the certificate chain up to the pinned AWS Nitro root certificate.
- Checks that no certificate in the chain is expired.
- Confirms the leaf certificate is bound to this specific enclave instance.

Failure: `AttestationError.InvalidCertificateChain`.

### Step 3: PCR Validation (Enclave Identity)

Platform Configuration Registers (PCRs) uniquely identify the enclave image:
- **PCR0**: SHA-384 hash of the enclave image. Must match an entry in `contracts/registry`'s approved TEE code hash list.
- **PCR1**: Hash of the kernel and boot ramfs. Validated against expected values.
- **PCR2**: Hash of the application. Validated against expected values.

A PCR mismatch means the attestation came from an unauthorized enclave image and must be rejected.

Failure: `AttestationError.UnauthorizedEnclaveImage`.

### Step 4: Payload Extraction and Content Binding

The attestation payload contains:
- `content_hash`: SHA-256 of the content being verified.
- `manifest_hash`: SHA-256 of the associated content manifest.
- `request_id`: The oracle contract request ID this verification addresses.
- `verification_result`: `passed` | `failed` | `inconclusive`.
- `timestamp`: Unix timestamp of the verification.

The service confirms:
- `content_hash` matches the hash stored in the oracle contract for `request_id`.
- `manifest_hash` matches the manifest hash stored for `request_id`.
- `timestamp` is within an acceptable skew window (±5 minutes) to prevent replay.

Failure: `AttestationError.PayloadMismatch` or `AttestationError.TimestampOutOfRange`.

### Step 5: Signature Verification

The service verifies the enclave's ed25519 signature over the payload using the provider's registered public key. This is a pre-check before submitting on-chain — the contract will re-verify, but catching the failure off-chain avoids a failed on-chain transaction.

Failure: `AttestationError.InvalidSignature`.

---

## Failure Handling

| Error Code | Condition | Logged Severity | Operator Action |
|---|---|---|---|
| `MalformedDocument` | Unparseable CBOR or missing fields | `critical` | Investigate enclave output pipeline |
| `InvalidCertificateChain` | Chain fails to verify to AWS root | `critical` | Possible MITM or stale root cert — alert immediately |
| `UnauthorizedEnclaveImage` | PCR0 not in approved hash list | `critical` | Enclave image changed without registry update, or unauthorized deployment |
| `PayloadMismatch` | Content/manifest hash mismatch | `warning` | Request routing error or content substitution attempt |
| `TimestampOutOfRange` | Attestation timestamp outside ±5 min window | `warning` | Possible replay attack or enclave clock skew |
| `InvalidSignature` | ed25519 signature invalid | `critical` | Key compromise or forgery attempt — alert immediately |

All failures are logged via `frontend/lib/security/auditLogger.ts` with `category: "system"` and the error code in `details`. Critical failures also emit to the operator's configured alerting channel.

---

## Output

On success, the service returns `AttestationVerificationResult`:

```typescript
{
  requestId: string;
  contentHash: string;
  manifestHash: string;
  verificationResult: "passed" | "failed" | "inconclusive";
  providerAddress: string;
  teeHash: string;       // hex-encoded PCR0 — used as the tee_hash argument to oracle.verify_attestation
  signature: string;     // hex-encoded ed25519 signature — passed to oracle.verify_attestation
  attestedAt: number;    // Unix timestamp from the attestation payload
}
```

This output is the direct input to `contracts/oracle.verify_attestation()`.

---

## Implementation

`frontend/services/teeAttestationService.ts` — see inline documentation for parameter types and error handling.

---

## Operational Notes

- **Enclave image rotation:** When the enclave image is rebuilt, its PCR0 changes. Update `contracts/registry` with the new approved code hash _before_ routing live requests to the new image. The 180-day TEE hash expiry window in the registry provides advance warning; see `docs/security/key-management.md`.
- **Root certificate pinning:** The AWS Nitro root certificate is pinned in the service. If AWS rotates it (rare but possible), the service must be updated before attestation verification will succeed again.
- **Clock skew:** The ±5 minute replay window assumes enclave and service clocks are synchronized via NTP. Monitor for clock drift in the enclave hosting environment.

---

## Related Documents

- `docs/adr/0004-tee-oracle-trust-model.md` — architectural decision and trust properties
- `docs/security/key-management.md` — TEE attestation key custody
- `contracts/oracle/src/lib.rs` — `verify_attestation()` on-chain counterpart
- `contracts/registry/src/lib.rs` — `is_tee_hash_approved()`, `rotate_tee_hash()`
- `SECURITY.md` section 6 — TEE and Oracle Trust Model
