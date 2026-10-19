# Long-Term Archive and Retention Strategy for Provenance Records

> **⚠ WARNING: Implementation Pending**
> This document defines the target strategy. Nothing described here has been built yet.
> Closes #683.

This document defines how provenance records, attestation proofs, and associated metadata will
be retained, archived, and eventually pruned over the operational lifetime of StellarVeriphy.
It balances storage cost, data availability, legal obligations, and the immutable nature of
the Stellar ledger.

---

## 1. Scope

This strategy covers the following data categories:

| Category                                               | Where it lives                                                  | Mutability                                |
| ------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------- |
| On-chain provenance certificates                       | Stellar ledger (Soroban contract storage)                       | Immutable once minted                     |
| On-chain oracle request records                        | Stellar ledger                                                  | Immutable once settled                    |
| On-chain registry entries (TEE code hashes, providers) | Stellar ledger                                                  | Append-only (can be revoked, not deleted) |
| Off-chain manifest JSON                                | IPFS / MongoDB (storage layer)                                  | Content-addressed; immutable on IPFS      |
| Off-chain encrypted content files                      | IPFS / MongoDB                                                  | Content-addressed; immutable on IPFS      |
| Attestation documents (raw Nitro output)               | Off-chain operator storage                                      | Immutable after issuance                  |
| Compliance audit trail                                 | `frontend/lib/compliance/complianceAuditTrail.ts`               | Append-only, hash-chained                 |
| Application-level audit logs                           | `frontend/lib/security/auditLogger.ts` (browser `localStorage`) | Pruned at 90 days (current behavior)      |
| Verification job records                               | Off-chain database                                              | Mutable until finalized                   |

Data **not** covered here (handled elsewhere):

- CI/CD build artifacts and logs → see [`docs/ci/CI.md`](../ci/CI.md)
- Deployment records → see [`docs/deployment/ci-cd-pipeline.md`](../deployment/ci-cd-pipeline.md)
- End-user wallet keys → user-controlled, see [`docs/security/key-management.md`](../security/key-management.md)

---

## 2. Guiding Principles

1. **On-chain data is permanent by design.** The Stellar ledger provides the trust anchor; StellarVeriphy cannot and should not attempt to delete or obscure on-chain records. Provenance certificates exist to be auditable indefinitely.

2. **Off-chain data must survive as long as on-chain references to it do.** A certificate that references a lost IPFS CID or a deleted manifest record becomes unverifiable — exactly the failure case the platform exists to prevent.

3. **Cost scales with tier, not age.** Frequently accessed recent records belong in fast, expensive storage. Older records can migrate to cheaper archival tiers without affecting on-chain validity.

4. **Legal obligations set the floor.** Compliance audit trail entries are retained for 7 years (`COMPLIANCE_RETENTION_YEARS = 7` in `complianceAuditTrail.ts`). No data subject to an active legal hold may be deleted regardless of any other schedule.

5. **Deletion is only for non-essential operational records.** Core provenance data (certificates, attestation proofs, manifests) is never actively deleted by the platform. Deletion of user-supplied content files may be permitted subject to creator consent and legal review.

---

## 3. Retention Schedule by Data Category

### 3.1 On-Chain Data (Stellar Ledger)

**Retention: Permanent (inherent to the public blockchain).**

The Stellar ledger is the authoritative source of truth for provenance certificates, oracle
requests, and registry state. StellarVeriphy cannot delete or modify on-chain data.

Implications:

- Creators should be informed at upload time that a provenance certificate, once minted, is
  a permanent public record (see [`docs/legal/privacy-policy.md`](../legal/privacy-policy.md#blockchain-data-is-public)).
- The on-chain record contains only the `storage_ref`, `manifest_hash`, `attestation_hash`,
  `creator`, and `timestamp` — no raw content bytes are stored on-chain.
- Revocation of a certificate (via `contracts/provenance.revoke_certificate`) marks it
  revoked on-chain but does not erase it. The revocation itself is a permanent event.

### 3.2 Off-Chain Manifests and Attestation Documents

**Retention: Indefinite (as long as the corresponding on-chain certificate exists).**

These records are the evidence layer that gives the on-chain certificate meaning. Losing them
converts a valid certificate into an unverifiable claim.

**Implementation target:**

```
Active storage (IPFS / MongoDB):      0 – 2 years
Warm archival tier:                   2 – 10 years   (e.g. AWS S3 Standard-IA or Glacier Instant Retrieval)
Cold archival tier:                   10 years+       (e.g. AWS S3 Glacier Deep Archive)
```

- IPFS-pinned content is retained as long as at least one node in the configured pinning
  service (e.g. Pinata, web3.storage) pins the CID. The platform must maintain its own
  pinning subscriptions and monitor for unpin events.
- MongoDB records move to a time-series archive collection after the active window. A
  background job (not yet implemented) compresses and migrates documents older than the
  active window threshold.

### 3.3 Encrypted Content Files

**Retention: Creator-controlled, subject to legal holds.**

Raw content files are encrypted before storage (see [`docs/security/kms-architecture.md`](../security/kms-architecture.md)).
The creator may request deletion of their content file while the provenance certificate
remains on-chain. The platform should support this by:

1. Deleting or unregistering the storage reference from its pinning services and database.
2. Revoking the certificate (so downstream verifiers know the artifact file is no longer
   available).
3. Retaining the manifest and attestation document, since these contain only hashes and
   do not constitute the raw content.

**Legal hold override:** If a content file is subject to an active legal hold (e.g. evidence
in a dispute), it must not be deleted regardless of creator request. Holds are tracked in the
compliance audit trail.

### 3.4 Verification Job Records

**Retention: 2 years from job completion, then pruned.**

Job records (`VerificationJob` type in `packages/shared/types/index.ts`) are operational state.
Once a job has reached a terminal state (`certified` or `failed`) and its outcome is reflected
on-chain, the job record's primary purpose shifts to support and debugging.

- **Active:** 0–90 days — available via the API for user-facing history views.
- **Archived:** 90 days–2 years — available via operator admin queries, not exposed to the UI.
- **Pruned:** after 2 years — deleted from the database.

Failed job records that were never retried should be reviewed before pruning to ensure there
is no unresolved data integrity issue.

### 3.5 Compliance Audit Trail

**Retention: 7 years (current enforced value in `complianceAuditTrail.ts`).**

The compliance audit trail records GDPR/CCPA data-subject rights exercises, content disputes,
DMCA notices, and policy changes. Seven years satisfies typical financial and regulatory
record-keeping periods in most jurisdictions.

This is enforced at the application layer (`COMPLIANCE_RETENTION_YEARS = 7`). The storage
backing this trail must itself be retained for at least 7 years — this is not yet enforced at
the infrastructure level and is a gap to close before production deployment.

### 3.6 Application-Level Audit Logs (Browser `localStorage`)

**Retention: 90 days (current enforced value in `auditLogger.ts`).**

These logs are client-side only and cover API key lifecycle events and security-relevant
frontend actions. They are pruned automatically at 90 days on next app load via
`pruneExpiredEntries`. This is appropriate for a browser-local store.

---

## 4. Storage Tiering and Cost Model

The platform's storage strategy uses three tiers:

| Tier                    | Target latency       | Example services                                          | Cost profile        |
| ----------------------- | -------------------- | --------------------------------------------------------- | ------------------- |
| **Hot** (active)        | < 100 ms             | IPFS pinning service, MongoDB Atlas M10+, AWS S3 Standard | Highest per-GB      |
| **Warm** (archive)      | < 1 s                | AWS S3 Standard-IA, Glacier Instant Retrieval             | ~40–60% of hot cost |
| **Cold** (deep archive) | 1–12 hours retrieval | AWS S3 Glacier Deep Archive, Backblaze B2                 | ~5–10% of hot cost  |

**Cost projection (approximate, for planning):**

At 1 million certificates:

- Average manifest + attestation document: ~5 KB each = ~10 GB total
- Average encrypted content file: varies widely; assume 2 MB average = ~2 TB total
- On-chain storage: paid per ledger entry on Stellar; at current rates (~0.00001 XLM / entry),
  1 million certificates ≈ 10 XLM in base fees (negligible).

After 2 years, the bulk of content files are expected to migrate from hot to warm tier,
reducing per-year storage cost by roughly 50%.

---

## 5. IPFS Pinning Governance

IPFS content is addressed by CID. Pinning must be explicitly maintained.

- The platform must maintain subscriptions with at least **two independent pinning services**
  to avoid single-provider loss.
- CID registrations must be tracked in a database table (`ipfs_pins`) that records:
  `cid`, `certificate_id`, `pinned_at`, `pinning_service`, `last_verified_at`.
- A scheduled integrity job (suggested: weekly) should verify each pinned CID is still
  retrievable and alert if any CID becomes unavailable.
- When migrating from IPFS to MongoDB or vice versa, the `storage_ref` field on the
  certificate is the canonical reference. Migration requires a new verification job and
  certificate update if the `storage_ref` changes.

---

## 6. Legal and Compliance Constraints

| Regulation / Requirement                  | Impact on this strategy                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GDPR Article 17 (right to erasure)        | Applies to off-chain content files and metadata; does not and cannot apply to on-chain data. Creators must be informed at upload.             |
| GDPR Article 5(1)(e) (storage limitation) | Verification job records and operational logs should not be retained longer than necessary — hence the 2-year prune schedule for job records. |
| CCPA                                      | Same as GDPR erasure; California residents may request deletion of their off-chain content.                                                   |
| Evidence preservation obligations         | Any record subject to an active legal hold is exempt from all automated deletion schedules.                                                   |
| Contractual SLAs                          | If SLAs guarantee certificate verifiability for N years, the off-chain evidence layer must be retained for at least N years.                  |
| SOC 2 / ISO 27001 (future)                | Requires documented retention policies, enforced at the infrastructure level, with audit evidence of enforcement.                             |

---

## 7. Implementation Roadmap

This strategy is aspirational. The following gaps exist today and must be addressed before
the strategy is fully operational:

| Gap                                                              | Priority | Suggested resolution                                                                 |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| No automated IPFS pin monitoring                                 | High     | Implement `ipfs_pins` table + weekly integrity check job                             |
| Compliance audit trail not backed by durable server-side storage | High     | Migrate `complianceAuditTrail.ts` writes to a server-side database before production |
| No MongoDB archival/migration job                                | Medium   | Implement time-series archive job for manifests and job records                      |
| No legal hold mechanism                                          | Medium   | Add `legal_hold` flag to content records; exclude flagged records from deletion jobs |
| Content file deletion not implemented                            | Medium   | Add creator-initiated deletion flow with certificate revocation                      |
| Cold-tier migration not implemented                              | Low      | Implement S3 lifecycle policy after warm tier is established                         |
| Pinning service redundancy not configured                        | High     | Configure two independent pinning services; test failover                            |

---

## 8. Governance

- This document must be reviewed and updated whenever:
  - A new persistent data category is introduced.
  - A retention period changes.
  - A new legal or contractual obligation is accepted.
- Any change to a retention period must be recorded in the compliance audit trail.
- The `COMPLIANCE_RETENTION_YEARS` constant in `complianceAuditTrail.ts` and the
  `RETENTION_DAYS` constant in `auditLogger.ts` must stay consistent with this document.

---

## Related Documents

- [`docs/legal/data-retention-policy.md`](../legal/data-retention-policy.md) — end-user-facing retention summary
- [`docs/legal/privacy-policy.md`](../legal/privacy-policy.md) — privacy and erasure rights
- [`docs/legal/compliance-audit-trail.md`](../legal/compliance-audit-trail.md) — compliance audit trail details
- [`docs/security/kms-architecture.md`](../security/kms-architecture.md) — content encryption and key management
- [`docs/security/key-management.md`](../security/key-management.md) — signing key inventory
- [`docs/adr/0005-pluggable-storage-layer.md`](../adr/0005-pluggable-storage-layer.md) — storage layer architecture
- [`frontend/lib/compliance/complianceAuditTrail.ts`](../../frontend/lib/compliance/complianceAuditTrail.ts) — compliance trail implementation
- [`frontend/lib/security/auditLogger.ts`](../../frontend/lib/security/auditLogger.ts) — application audit log
