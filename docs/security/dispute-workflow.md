# Content Dispute and Governance Workflow

This document defines how StellarVeriphy handles disputed provenance records — from a reporter raising a concern through to a final resolution. It covers both tracks, their boundaries, and the audit guarantees that keep the process credible.

## Two dispute tracks

StellarVeriphy has two distinct dispute mechanisms that operate in parallel and should not be confused:

| Track | What it covers | Where it lives | Who resolves it |
|-------|---------------|---------------|----------------|
| **Content dispute** | A provenance certificate or the content it represents is wrong, fraudulent, or legally problematic | Off-chain admin moderation queue (`/api/disputes`) | A StellarVeriphy operator |
| **Provider dispute** | An oracle provider produced an incorrect or fraudulent attestation | On-chain oracle contract (`oracle.file_dispute`) | Oracle contract admin via `resolve_dispute` |

This document focuses on content disputes. Provider disputes are covered by the oracle contract's `Dispute` struct and `resolve_dispute` / `dismiss_dispute` functions — see `contracts/oracle/src/lib.rs` and the [INTEGRATION_GUIDE](../INTEGRATION_GUIDE.md).

---

## Content dispute lifecycle

```
Reporter raises dispute
        │
        ▼
  status: open  ◄──────────────────────────────────┐
        │                                           │
        │  Operator claims it                       │
        ▼                                           │
  status: under_review                              │
        │                                           │
        ├─── Operator needs more info ──────────────►  status: evidence_requested
        │                                           │          (reporter attaches evidence)
        │  Operator has enough to decide            │
        ▼                                           │
   ┌────┴──────────────────────────────────────┐    │
   │  Outcome                                  │    │
   │  upheld       → resolved_upheld           │    │
   │  rejected     → resolved_rejected         │    │
   │  inconclusive → resolved_inconclusive     │    │
   │  dismissed    → dismissed                 │    │
   └───────────────────────────────────────────┘    │
                                                    │
   (At any point the operator may escalate ─────────┘
    to a more senior reviewer)
```

### Status definitions

| Status | Meaning |
|--------|---------|
| `open` | Newly raised, not yet reviewed |
| `under_review` | An operator has assigned themselves and is actively reviewing |
| `evidence_requested` | The operator asked the reporting party for more information |
| `resolved_upheld` | Dispute was valid — a corrective action was taken (e.g. revocation) |
| `resolved_rejected` | Dispute was not supported by evidence — original record stands |
| `resolved_inconclusive` | Insufficient evidence for a definitive outcome; operator notes explain |
| `dismissed` | Frivolous, duplicate, or out of scope — closed with no further action |

All statuses except `open` and `under_review` are **terminal** — a dispute in a terminal status cannot be re-opened. If new information emerges, a new dispute must be raised.

---

## Raising a dispute

### Who can raise one

Anyone. Anonymous reports are accepted. Providing a Stellar address allows an operator to follow up for more information.

### How to raise one

**Via the UI:** go to `/report-issue?tab=dispute`. Pre-fill the certificate ID and content hash via query parameters: `/report-issue?tab=dispute&certificateId=42&contentHash=a1b2…`.

**Via the API directly:**

```http
POST /api/disputes
Content-Type: application/json

{
  "certificateId": "42",
  "contentHash": "a1b2c3…",
  "trigger": "fraudulent_content",
  "summary": "This certificate was minted for manipulated media. The original image hash is …",
  "reportedBy": "GABCD…",
  "evidence": [
    {
      "type": "external_reference",
      "description": "Original unmanipulated image on archive.org",
      "reference": "https://web.archive.org/…"
    }
  ]
}
```

The response contains a `disputeId` (e.g. `dsp_1720000000_abc12`). Keep it — it is the reference for all follow-up.

### Trigger categories

| Trigger | When to use |
|---------|-------------|
| `incorrect_attestation` | The TEE attestation hash or proof is wrong or forged |
| `fraudulent_content` | The media file is manipulated, AI-generated, or misrepresented |
| `copyright_violation` | The content infringes on a copyright you hold or represent |
| `legal_requirement` | A legal or regulatory obligation requires review |
| `creator_request` | You are the original creator and the record is unauthorised or incorrect |
| `duplicate_record` | The same content is already certified under a different certificate |
| `identity_fraud` | The creator address was spoofed or does not belong to the real creator |
| `other` | None of the above |

---

## Attaching evidence

Evidence can be attached at the time of raising or added later (while the dispute is `open`, `under_review`, or `evidence_requested`).

**Structured evidence types:**

| Type | What it captures |
|------|----------------|
| `hash_mismatch` | The recorded hash doesn't match the claimed original |
| `attestation_invalid` | TEE attestation document fails validation |
| `duplicate_content` | Same content certified under a different certificate |
| `creator_identity` | The claimed creator address is not who they say |
| `legal_request` | A legal hold or takedown with reference number |
| `media_manipulation` | Visual or forensic evidence of manipulation |
| `on_chain_reference` | A Stellar transaction hash or contract event ID |
| `external_reference` | A URL pointing to an external source |
| `other` | Anything else |

**Via the API:**

```http
POST /api/disputes/dsp_1720000000_abc12/evidence
Content-Type: application/json

{
  "type": "on_chain_reference",
  "description": "Prior certificate minted for the same content hash under certificate #17",
  "reference": "TXHASH…",
  "attachedBy": "GABCD…"
}
```

Each evidence item is stamped with an ID, timestamp, and the attaching party's address. Once attached, evidence is immutable — it cannot be removed.

---

## Operator review process

### Claiming a dispute

An operator reviews the queue at `/admin/moderation`. Disputes appear with their trigger, status, and age. The operator clicks **Review** to open the detail panel, records notes, and updates the status.

Updating status to `under_review` signals to other operators that this dispute is being handled.

### Escalation

If the reviewing operator cannot make a determination alone, they escalate to a more senior reviewer by providing a Stellar address in the **Escalate to** field. Escalation appends the address to the `escalationChain` and creates an audit entry. The new reviewer takes over ownership.

### Resolution

Every resolution requires:
1. An **outcome** (`upheld`, `rejected`, `inconclusive`, or `dismissed`)
2. A **resolution summary** — a plain-language explanation written for the reporting party
3. For `upheld` outcomes: the **on-chain action** taken (e.g. `revoke_certificate`, `no_action_possible`) and the transaction hash if applicable

```http
POST /api/disputes/dsp_1720000000_abc12/resolve
Content-Type: application/json

{
  "outcome": "upheld",
  "resolutionSummary": "Evidence confirmed the content was digitally manipulated. Certificate #42 has been revoked.",
  "onChainAction": "revoke_certificate",
  "onChainTxHash": "TXHASH…",
  "reviewNotes": "Internal: cross-checked with reverse image search and confirmed manipulation."
}
```

`reviewNotes` is internal and is not exposed to the reporting party. `resolutionSummary` is the public-facing explanation.

---

## Audit trail

Every action on a dispute — raising, evidence attachment, status changes, escalations, notes, and resolution — creates an immutable `DisputeAuditEntry` in the audit store. The full trail is queryable:

```http
GET /api/disputes/dsp_1720000000_abc12/audit
```

Response: an ordered array of entries, each containing:
- `action` — what was done
- `actor` — who did it (Stellar address or `"anonymous"`)
- `timestamp` — ISO 8601
- `description` — human-readable description
- `previousStatus` / `newStatus` — for status transitions

The audit trail is append-only. Entries are never modified or deleted. In production this must be backed by an immutable data store (e.g. an append-only database table with no UPDATE or DELETE permissions for the application role).

**In the UI:** the audit trail renders as a timeline inside the admin moderation detail panel. The `DisputeAuditTrail` component (`frontend/components/DisputeAuditTrail.tsx`) can also be embedded on any page given a `disputeId` or pre-fetched `entries` array.

---

## Trust preservation principles

These constraints are deliberately built into the workflow:

**No silent approvals.** Every status transition creates an audit entry. An operator cannot mark a dispute resolved without providing a resolution summary.

**Anonymous reports allowed, identified preferred.** Lowering the barrier to report preserves network credibility. Providing an address allows follow-up, which improves resolution quality. The two are not conflated — anonymity does not reduce the weight of a dispute.

**Evidence is immutable once attached.** Operators cannot remove evidence that was submitted, even if inconvenient. This prevents post-hoc manipulation of the record.

**Resolution is final.** Terminal statuses cannot be reversed. New evidence must produce a new dispute. This prevents indefinite re-opening of settled matters.

**On-chain actions are referenced, not hidden.** When a resolution triggers a contract call (revocation, metadata update), the transaction hash is recorded on the dispute. Anyone can verify what actually happened on-chain independently of the dispute record.

**Escalation is tracked.** The full escalation chain is stored and audited, so it is always possible to see who made the final decision.

---

## Operator checklist

For each dispute:

- [ ] Read the full summary and all evidence before acting
- [ ] Assign yourself before updating status (prevents two operators acting simultaneously)
- [ ] If evidence is insufficient, use `evidence_requested` — do not resolve with inconclusive until the reporter has had a chance to respond
- [ ] For `upheld` outcomes, take the on-chain action **before** resolving the dispute, then record the tx hash
- [ ] Write a `resolutionSummary` that the reporting party can understand without insider context
- [ ] Record internal reasoning in `reviewNotes`
- [ ] If escalating, brief the next reviewer in the notes before handing off

---

## Related files

| Path | Purpose |
|------|---------|
| `frontend/types/dispute.ts` | All TypeScript types for the dispute workflow |
| `frontend/services/disputeService.ts` | Service layer (raise, fetch, evidence, resolve) |
| `frontend/hooks/useDispute.ts` | React hooks wrapping the service |
| `frontend/components/DisputeSubmissionForm.tsx` | Public-facing dispute form |
| `frontend/components/DisputeAuditTrail.tsx` | Audit trail timeline component |
| `frontend/components/admin/ModerationQueue.tsx` | Admin review queue |
| `frontend/app/api/disputes/route.ts` | GET list / POST raise |
| `frontend/app/api/disputes/[id]/route.ts` | GET single / PATCH update |
| `frontend/app/api/disputes/[id]/evidence/route.ts` | POST attach evidence |
| `frontend/app/api/disputes/[id]/resolve/route.ts` | POST resolve/dismiss |
| `frontend/app/api/disputes/[id]/audit/route.ts` | GET audit trail |
| `frontend/app/report-issue/page.tsx` | Public entry point (tabbed: bug report + dispute) |
| `frontend/app/admin/moderation/page.tsx` | Admin moderation queue page |
| `contracts/oracle/src/lib.rs` | On-chain provider dispute (`file_dispute`, `resolve_dispute`) |
