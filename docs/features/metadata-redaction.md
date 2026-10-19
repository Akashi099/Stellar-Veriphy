# Controlled Metadata Redaction

Labels: `privacy`, `feature`, `security`

## Overview

A controlled redaction model that lets creators hide or partially release sensitive metadata fields while preserving on-chain proof integrity. Designed for privacy-sensitive creators (e.g. photographers who don't want to expose GPS coordinates) and regulated industries (e.g. medical imaging).

## Core guarantee

The **original manifest hash** is never modified by redaction. On-chain verification uses that hash and continues to work normally. Redaction only affects what is displayed to viewers — the underlying proof is intact.

## Redactable fields

| Field | Notes |
|---|---|
| `metadata.device` | Camera or capture device model |
| `metadata.location` | Geographic location |
| `metadata.aiModel` | AI model name |
| `media.fileName` | Original file name |
| `media.fileType` | MIME type |
| `media.fileSizeBytes` | File size |
| `schemaVersion` | Manifest schema version |

## Immutable fields (never redactable)

`contentHash`, `creator`, `timestamp` — required for on-chain verification.

## Visibility modes

| Mode | Behavior |
|---|---|
| `public` | Visible to everyone |
| `partial` | Replaced with a creator-supplied placeholder string |
| `redacted` | Removed entirely from the display manifest |

## Governance model

1. Creator applies a redaction policy via `MetadataRedactionPanel`.
2. The policy JSON is hashed (SHA-256) and stored on-chain via `set_redaction_policy` on the provenance contract.
3. A governance reviewer (oracle/admin) approves the policy via `approve_redaction_policy`.
4. Only approved policies are applied when serving the public-facing certificate view.
5. The original unredacted manifest is preserved on-chain for authorized dispute resolution.

## On-chain storage

```
provenance_client.set_redaction_policy(
    &env,
    certificate_id,
    policy_hash,   // SHA-256 of the full policy JSON (off-chain / IPFS)
    applied_by,    // must be cert owner or oracle
)

provenance_client.approve_redaction_policy(&env, certificate_id)

provenance_client.get_redaction_policy(&env, certificate_id) -> Option<RedactionPolicyRecord>
```

## Acceptance criteria

- ✅ Sensitive metadata can be redacted or hidden in controlled conditions
- ✅ Proof integrity remains intact after redaction (original manifest hash unchanged)
- ✅ The user can clearly understand what is public vs. private (visibility summary + preview)
- ✅ The behavior is documented for privacy and governance concerns (this doc + UI explainer)

## Files

| File | Purpose |
|---|---|
| `packages/shared/utils/metadataRedaction.ts` | Core redaction logic, policy types |
| `frontend/components/manifest/MetadataRedactionPanel.tsx` | Creator-facing redaction UI |
| `frontend/app/tools/manifest-redaction/page.tsx` | Standalone redaction tool page |
| `contracts/provenance/src/lib.rs` | `set_redaction_policy`, `approve_redaction_policy`, `get_redaction_policy`, `RedactionPolicyRecord` |
| `docs/security/consent-model.md` | Related consent and privacy model |
