# Dispute Evidence Packaging

> Issue #671 · Labels: security, moderation

When an asset is disputed, reviewers need every piece of evidence — submitted
files, manifests, hashes, oracle attestations, links and comments — in one
place, in a consistent structure, and in a form that can be audited later.
The evidence package provides that.

## Components

| Layer | Location | Role |
|---|---|---|
| Model & packaging | `packages/shared/utils/disputeEvidence.ts` | Typed evidence items, validation, deterministic packaging, integrity checks, audit entries |
| API | `GET/POST /api/admin/moderation/[id]/evidence` | Build the package for a dispute; attach new evidence |
| Reviewer UI | `/admin/moderation/[id]/evidence` (`DisputeEvidencePackageView`) | One-page review, re-verification, JSON export, add evidence |
| Queue link | `ModerationQueue` detail panel | "Open full evidence package →" |
| On-chain anchor | oracle `anchor_dispute_evidence` / `get_dispute_evidence` | Append-only package-hash anchors per on-chain dispute |

## Package structure

Every package has the same shape regardless of submission order:

```jsonc
{
  "schemaVersion": "1.0.0",
  "packageId": "evp_<disputeId>_<hash prefix>",
  "disputeId": "mod-123",          // moderation item id
  "onChainDisputeId": 7,            // oracle contract dispute id, when on-chain
  "assetId": "cert-42",
  "contentHash": "<sha256 of the disputed asset>",
  "sections": {                     // always all six, in this order
    "manifest": [], "hash": [], "file": [], "attestation": [], "link": [], "comment": []
  },
  "checks": [ { "itemId", "itemDigest", "contentHashRelation", "manifestIntegrity", "warnings" } ],
  "packageHash": "<sha256>",
  "auditTrail": [ { "at", "actor", "action", "details" } ]
}
```

Within each section items are sorted by `submittedAt`, then `id`. Duplicate
item ids are collapsed (first submission wins), so re-packaging is idempotent.

### Evidence kinds

| Kind | Required fields | Automatic checks |
|---|---|---|
| `file` | `storageRef`, `sha256` | `sha256` compared with the asset's content hash |
| `hash` | `sha256` | compared with the asset's content hash |
| `manifest` | `manifest` (object); `sha256` recommended | canonical manifest hash vs declared `sha256`; manifest `contentHash` vs asset |
| `attestation` | `attestationRef` (oracle request id / tx hash) | — |
| `link` | `url` (https only) | — |
| `comment` | `text` | — |

File bytes are **never** embedded in a package — only storage references and
digests — so packages are safe to log and export.

Legacy moderation items that stored free-form `evidence: string[]` are
converted automatically: 64-hex strings become `hash` items, `https://`
strings become `link` items, everything else becomes a `comment`.

## Integrity model

1. Each item is canonicalised (sorted keys, `undefined` dropped) and hashed → `itemDigest`.
2. `packageHash = sha256(canonical({schemaVersion, disputeId, assetId, onChainDisputeId, contentHash, items: [itemDigest…]}))`.
3. `verifyEvidencePackage()` recomputes every digest and the package hash and
   lists any tampered items. The reviewer UI exposes this as **Re-verify integrity**.
4. For on-chain disputes, the requester, the disputed provider or the admin can
   call `anchor_dispute_evidence(dispute_id, package_hash, submitter)`. Anchors
   are append-only (max 50 per dispute) and idempotent for the same hash, so the
   full evolution of the evidence is preserved on-chain.

## Audit logging

- Viewing a package writes `evidence_package_viewed` (with `packageHash`).
- Adding evidence writes `evidence_item_added` with the item digest, kind,
  submitter and hash relation.
- `evidencePackageAuditEntries(pkg)` flattens a package into one header
  record plus one record per item for export to external audit stores.
- All records use `entityType: "dispute_evidence"` and `entityId: <disputeId>`
  and are visible through `GET /api/audit-logs?entityId=<disputeId>`.

## Access control

Reading requires `moderation:read`, adding evidence requires
`moderation:write`, both on an **admin-surface** API token (see
[api-token-lifecycle.md](./api-token-lifecycle.md)). Links are rendered with
`rel="noopener noreferrer nofollow"` and only `https:` URLs are accepted.

## Reviewer workflow

1. Open the dispute from **Admin → Moderation Queue** and choose
   *Open full evidence package*.
2. Check the summary tiles: hash matches/mismatches and invalid manifests.
3. Read the **Review warnings** block — every failed check is listed there.
4. Click **Re-verify integrity** before acting on a package from storage.
5. Add reviewer notes or counter-evidence with **Add evidence**.
6. Export the package JSON and, for on-chain disputes, anchor its hash before
   calling `resolve_dispute` / `dismiss_dispute`.
