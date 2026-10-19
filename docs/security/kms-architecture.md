# Artifact Encryption Key Management Architecture

This document defines the model for generating, rotating, storing, and accessing encryption keys tied to asset privacy and verification flows. Closes #651.

This complements the key inventory in `docs/security/key-management.md`, which covers signing and deployment keys. This document is specifically about **encryption keys for artifact privacy** — keys used to encrypt content before it is stored or transmitted as part of the provenance flow.

---

## Scope

Keys covered by this document:

| Key type | Purpose | Owner |
|---|---|---|
| **Artifact content encryption key (CEK)** | Encrypts raw content files before off-chain storage | Creator |
| **Key encryption key (KEK)** | Wraps per-artifact CEKs for storage | System (per-environment) |
| **Manifest field encryption key** | Encrypts sensitive fields in the content manifest | Creator |

Keys out of scope (covered in `docs/security/key-management.md`):
- End-user wallet signing keys
- TEE oracle attestation keys
- CI/CD deployment secrets
- Application-issued API keys

---

## Key Generation

### Artifact content encryption keys (CEK)

- Algorithm: **AES-256-GCM**.
- Generated fresh for each artifact using `crypto.subtle.generateKey` with `{ name: "AES-GCM", length: 256 }` and `extractable: false` where the key is used in-browser, or `extractable: true` only when the key must be wrapped for transport to the service layer.
- A unique 96-bit IV is generated per encryption operation using `crypto.getRandomValues`. IVs are never reused for the same key.
- The CEK never appears in logs, error messages, or telemetry.

### Key encryption keys (KEK)

- Algorithm: **AES-256-KW** (key wrapping per RFC 3394).
- One KEK per deployment environment (development, staging, production).
- KEKs are stored outside the application: in AWS KMS (production) or a local secret manager (development).
- The application never holds the raw KEK in memory beyond the duration of a single wrap/unwrap operation.

### Manifest field encryption

- Uses the artifact's CEK with a field-specific additional authenticated data (AAD) string to bind the ciphertext to the specific manifest field, preventing cross-field ciphertext transplanting.

---

## Key Storage

### Wrapped CEK storage

After encryption, the CEK is exported and wrapped with the environment KEK using AES-KW. The wrapped CEK is stored alongside the encrypted artifact (e.g., in the artifact metadata record). The raw CEK is not persisted.

### KEK storage

| Environment | Storage | Access |
|---|---|---|
| Production | AWS KMS (CMK, key policy restricts to service role) | KMS API call; key never leaves KMS |
| Staging | AWS KMS (separate CMK from production) | Same pattern |
| Development | Local `.env` file (excluded from git via `.gitignore`) | Direct env var; acceptable for local-only use |

The production KEK must never be accessible to developers directly. Access is via the KMS API only, authenticated with short-lived IAM role credentials.

---

## Key Rotation

| Key | Rotation trigger | Procedure |
|---|---|---|
| Artifact CEK | Per-artifact by design — each artifact gets its own key | No rotation needed; a new key is generated at artifact creation time |
| KEK | Suspected compromise; or on a scheduled cadence (recommended: annually for production) | (1) Generate new KEK in KMS; (2) re-wrap all stored CEKs with the new KEK in a migration job; (3) mark old KEK as pending deletion in KMS; (4) after confirming all CEKs are re-wrapped, schedule old KEK deletion with a 7-day window |
| Manifest field key | Same as CEK — derived per-artifact | No separate rotation; regenerated with the artifact |

### Re-wrapping procedure for KEK rotation

Re-wrapping does not require decrypting the artifact content — only the wrapped CEK is touched:

```
for each artifact:
  old_cek = kms.unwrap(artifact.wrapped_cek, old_kek_id)
  new_wrapped_cek = kms.wrap(old_cek, new_kek_id)
  artifact.wrapped_cek = new_wrapped_cek
  artifact.kek_version = new_kek_version
  auditLogger.logEvent({ action: "cek_rewrapped", actor: "migration_service" })
```

The migration job should run in a read-consistent transaction to prevent partial re-wrapping state.

---

## Access Control

| Operation | Who can perform | Enforcement |
|---|---|---|
| Generate CEK | Creator (via browser or service) | `crypto.subtle` in browser; service-side generation requires authenticated session |
| Wrap CEK with KEK | Service layer only | KMS IAM policy — no direct app access to raw KEK |
| Unwrap CEK (for decryption) | Creator (own artifacts); Verifier (during TEE verification, scoped to assigned request); Admin (for incident response, logged) | Consent scope `read:certificate`; every unwrap logged in audit trail |
| Rotate KEK | Admin | KMS IAM policy + manual approval in migration runbook |
| Delete KEK | Admin + second approver | KMS scheduled deletion with minimum 7-day window |

---

## Auditing

Every key lifecycle operation is logged via `frontend/lib/security/auditLogger.ts`:

| Event | Action string | Severity |
|---|---|---|
| CEK generated | `cek_generated` | `info` |
| CEK wrapped | `cek_wrapped` | `info` |
| CEK unwrapped (access) | `cek_unwrapped` | `info` |
| CEK unwrapped by admin | `cek_unwrapped_admin` | `warning` |
| KEK rotation started | `kek_rotation_started` | `warning` |
| CEK re-wrapped during rotation | `cek_rewrapped` | `info` |
| KEK scheduled for deletion | `kek_deletion_scheduled` | `warning` |

Audit entries for key operations use `category: "admin"`. Admin-initiated unwraps use `severity: "warning"` so they appear prominently in compliance reviews.

---

## Incident Response

### Suspected CEK compromise

A CEK compromise affects one artifact. Procedure:
1. Revoke the artifact's provenance certificate via `contracts/provenance.revoke_certificate`.
2. Re-encrypt the artifact with a new CEK.
3. Submit a new verification request to obtain a new certificate for the re-encrypted artifact.
4. Notify the certificate owner.

### Suspected KEK compromise

A KEK compromise potentially affects all artifacts encrypted under that KEK. Procedure:
1. Immediately generate a new KEK in KMS and restrict access to the old KEK.
2. Run the re-wrapping migration job to move all CEKs to the new KEK.
3. After re-wrapping is complete, revoke the old KEK.
4. Audit all CEK unwrap events since the suspected compromise window to assess exposure.
5. For any artifact where the content was likely exposed, follow the CEK compromise procedure.

---

## Implementation

`frontend/lib/encryption/kmsService.ts` — generates, wraps, unwraps, and rotates artifact encryption keys. See that file for the full API and usage examples.

---

## Related Documents

- `docs/security/key-management.md` — signing key and API key inventory
- `frontend/lib/encryption/kmsService.ts` — implementation
- `frontend/lib/security/auditLogger.ts` — audit logging
- `SECURITY.md` — threat model and security controls
