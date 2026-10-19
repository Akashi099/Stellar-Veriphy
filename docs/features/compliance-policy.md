# Compliance Policy Engine

**Related issue:** #672
**Status:** Implemented

---

## Overview

StellarVeriphy applies a configurable compliance policy to every upload and
certification request.  The policy engine evaluates a set of rules against the
facts of a specific request (`PolicyContext`) and returns a `PolicyDecision`
explaining what is allowed and what disclosures are required.

The policy engine is **data-driven**: rules are declared in code as a
`PolicyRuleSet` (not hard-coded control flow) so they can be reviewed,
extended, and version-controlled alongside the rest of the system.

---

## Key concepts

### `PolicyContext`

The facts evaluated for a single request:

| Field | Type | Description |
|---|---|---|
| `assetClass` | `AssetClass` | Category of the content (see below). |
| `creatorSegment` | `CreatorSegment` | Category of the creator. |
| `jurisdiction` | `string` | ISO 3166-1 or region code (`EU`, `US`, `GLOBAL`). |
| `aiLabel` | `AiGenerationType` (optional) | AI classification from the labeling system. |
| `mimeType` | `string` (optional) | File MIME type. |
| `fileSize` | `number` (optional) | File size in bytes. |

### `PolicyDecision`

| Field | Type | Description |
|---|---|---|
| `allowed` | `boolean` | Whether the upload or certification may proceed. |
| `complianceStatus` | `"compliant" \| "restricted" \| "blocked"` | Aggregate outcome. |
| `violations` | `PolicyViolation[]` | Each triggered rule. |
| `requiredDisclosures` | `string[]` | Disclosures that must be shown before proceeding. |
| `policyId` | `string` | Rule set id for audit trails. |
| `policyVersion` | `string` | Rule set version for audit trails. |
| `evaluatedAt` | ISO 8601 | Decision timestamp. |

---

## Asset classes

| Value | Notes |
|---|---|
| `news_media` | Journalist and enterprise only; AI-generated blocked. |
| `legal_document` | AI-generated and partially AI-generated blocked. |
| `ai_generated_artwork` | No restrictions; disclosure required. |
| `scientific_data` | AI-generated requires methodology disclosure. |
| `supply_chain_evidence` | No special restrictions (default rules apply). |
| `nft_asset` | No special restrictions (default rules apply). |
| `other` | Fallback; default rules apply. |

---

## Default rule set (v1.0.0)

The default rule set shipped with StellarVeriphy encodes:

1. **AI labeling disclosures** — `fully_generated` and `partially_generated`
   content must carry a visible disclosure (`restricted`, not `blocked`).
2. **News media AI block** — `fully_generated` content cannot be certified as
   news media (`blocked`).
3. **News media creator segment** — news media requires a journalist, enterprise,
   or government creator segment.
4. **Legal document AI block** — AI-generated or partially AI-generated content
   cannot be certified as a legal document.
5. **EU AI enhancement disclosure** — `ai_enhanced` content in the `EU`
   jurisdiction requires a disclosure.
6. **Scientific data AI disclosure** — AI-generated scientific data requires a
   methodology disclosure.

---

## Evaluation semantics

- Rules are evaluated in order.
- The first `"blocked"` rule short-circuits further evaluation.
- All `"restricted"` rules are collected and their messages become
  `requiredDisclosures`.
- `allowed` is `false` only when at least one `"blocked"` rule triggered.

---

## API reference

### `POST /api/policy/evaluate`

Evaluate the default compliance policy for an asset.

**Request:**
```json
{
  "assetClass": "news_media",
  "creatorSegment": "journalist",
  "jurisdiction": "EU",
  "aiLabel": "partially_generated",
  "mimeType": "video/mp4",
  "fileSize": 104857600
}
```

**Response:**
```json
{
  "status": "ok",
  "data": {
    "allowed": true,
    "complianceStatus": "restricted",
    "violations": [
      {
        "ruleId": "ai-label-partial-disclosure",
        "effect": "restricted",
        "message": "This asset has been labeled as partially AI-generated. A disclosure is required.",
        "remediation": "Add an AI-content disclosure alongside the certificate."
      }
    ],
    "requiredDisclosures": [
      "This asset has been labeled as partially AI-generated. A disclosure is required."
    ],
    "evaluatedAt": "2026-09-27T21:00:00Z",
    "policyId": "stellarveriphy-default",
    "policyVersion": "1.0.0"
  }
}
```

**Status codes:**

| Status | Meaning |
|---|---|
| 200 | Policy evaluated; check `data.allowed`. |
| 422 | Invalid context (unknown `assetClass`, missing `jurisdiction`, etc.). |

---

## Extending the policy

To add custom rules, build a new `PolicyRuleSet` in your application layer and
call `evaluatePolicy(customRuleSet, context)`.  Custom rule sets can:

- Add new asset classes or creator segments.
- Override default rule effects.
- Add jurisdiction-specific rules beyond the built-in EU and US support.

All custom rule sets must be documented and reviewed under `docs/legal` before
being applied to production traffic.

---

## Governance

Policy changes must be treated as compliance decisions.  The process is:

1. Propose the change as a code PR, editing `packages/shared/policy/index.ts`.
2. Increment the `PolicyRuleSet.version`.
3. Add or update the entry in `docs/adr/` explaining the decision.
4. Get sign-off from legal/governance reviewers before merging.

---

## Code locations

| Module | Purpose |
|---|---|
| `packages/shared/policy/index.ts` | Types, evaluation engine, default rule set. |
| `frontend/app/api/policy/evaluate/route.ts` | REST endpoint. |
