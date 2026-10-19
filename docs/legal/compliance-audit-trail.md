# Compliance Audit Trail

**Module:** `frontend/lib/compliance/complianceAuditTrail.ts`  
**API:** `GET /api/compliance/audit`, `POST /api/compliance/audit`  
**UI:** `/tools/compliance-audit`  
**Closes:** #688

## Purpose

The compliance audit trail is a structured, tamper-evident record of legal, policy, and compliance decisions tied to provenance events. It is distinct from the security audit log (`frontend/lib/security/auditLogger.ts`), which tracks system/admin actions.

The compliance trail is concerned with legal obligations:
- **GDPR / CCPA** data subject rights (access, erasure, portability)
- **Data retention** milestones (scheduled deletion, retention extension)
- **Content disputes** (DMCA takedowns, ownership challenges, resolution)
- **Policy changes** affecting stored provenance records
- **Third-party disclosures** and associated legal bases

## What to record

| Condition | Action type | Legal basis |
|---|---|---|
| Data subject requests their data | `data_access_request` | `data_subject_request` |
| Data subject requests deletion (off-chain) | `erasure_request` | `data_subject_request` |
| 90-day off-chain retention window reached | `retention_milestone` | `legal_obligation` |
| DMCA takedown notice received | `dmca_notice` | `legal_obligation` |
| Ownership dispute opened | `content_dispute_opened` | `legal_obligation` |
| Ownership dispute resolved | `content_dispute_resolved` | `legal_obligation` |
| Policy document updated | `policy_change` | `legitimate_interest` |
| Internal or external audit performed | `audit_review` | `legal_obligation` |

## Sensitive data policy

Compliance records **must not** contain:
- Private keys or wallet credentials
- Unredacted names, email addresses, or other personal data
- Internal API keys or session tokens

Records **should** contain:
- Stable, pseudonymous identifiers (certificate IDs, job IDs, hashed wallet addresses)
- Action type and legal basis from the controlled vocabulary
- Brief reason code (max 200 chars) consistent with documented policy
- Outcome (e.g. "completed", "rejected", "pending review")

## Chain-hash tamper evidence

Each entry includes a `chainHash` field computed as:

```
SHA-256(previousHash | timestamp | actor | actionType | legalBasis | entityId | reason | outcome | severity)
```

This links each entry to its predecessor. The viewer page and export confirm chain integrity (`tamperProof` flag in the summary).

## Data retention

Compliance audit entries are retained for **7 years** (`COMPLIANCE_RETENTION_YEARS = 7`). The `pruneExpiredEntries()` method removes entries older than this window, but should only be called after confirming no ongoing regulatory requirement extends retention further.

## API

### `GET /api/compliance/audit`

Returns entries with optional filtering:

| Parameter | Type | Description |
|---|---|---|
| `actionType` | string | Filter by `ComplianceActionType` |
| `legalBasis` | string | Filter by `ComplianceLegalBasis` |
| `severity` | string | `routine`, `notable`, or `high` |
| `entityId` | string | Filter entries for a specific entity |
| `summary` | `"true"` | Include a summary object |

### `POST /api/compliance/audit`

Records a new compliance entry. Required fields: `actionType`, `legalBasis`, `actor`, `reason`, `outcome`.

## Integration with other modules

- **Fraud detection (#689):** When a `CONFLICT` alert is raised by `duplicateDetection.ts`, record a `content_dispute_opened` entry in the compliance trail.
- **Transaction recovery (#690):** When a job is abandoned or escalated, record the outcome as an `other` entry with the relevant context.
- **Data retention policy:** The 90-day off-chain retention window in `docs/legal/data-retention-policy.md` should trigger a `retention_milestone` entry for each affected job.
