# Moderation audit log

Every moderation action is recorded with who did it, what it targeted, when, why
and what happened (#784). The log lives in `frontend/lib/server/moderation-audit.ts`.

## What is recorded

| Route | Action(s) |
|---|---|
| `POST /api/admin/moderation` | `item_created` |
| `PATCH /api/admin/moderation/[id]` | `status_changed`, `assigned`, `review_notes_updated`, `escalated` |
| `POST /api/admin/moderation/[id]/evidence` | `evidence_added` |
| `GET /api/admin/moderation/[id]/evidence` | `evidence_package_viewed` |

Each entry has:

- `actor` and `actorRole`: the token owner (or reporter for new items) and how
  they authenticated (`admin_token`, `reporter`, `unverified` when token
  enforcement is off).
- `targetId`, plus `assetId` and `contentHash` when the target exists.
- `outcome`: `success`, `denied` (auth refused), `not_found` or `invalid`.
  Refused attempts are logged too, so probing shows up in the trail.
- `reason`: the moderator's `reason` field (falling back to `reviewNotes`), or the
  refusal cause. Trimmed to 1000 characters.
- `changes`: `{ field: { from, to } }` for each field the action changed.
- `requestId`, `timestamp`, a monotonically increasing `sequence`, `previousHash`
  and `hash`.

Send `reason` on `PATCH` requests so the decision is explained in the trail:

```json
{ "status": "rejected", "reason": "Manifest signer does not match the creator wallet." }
```

## Storage and integrity

- Entries are appended to the `moderation-audit` collection (`$VERIPHY_DATA_DIR`,
  default `.data/`, git-ignored). Appends are serialized, so sequences never collide.
- The module exposes no update or delete function, and no HTTP route writes to it.
  The general `/api/audit-logs` endpoint is separate and cannot add moderation entries.
- Each entry's `hash` is the SHA-256 of its canonical fields plus the previous
  entry's hash. Changing or removing any entry breaks the chain from that point.
- Entries hold identifiers and short reasons only. Never put tokens, keys or
  evidence contents in `reason`.

## Querying

`GET /api/admin/moderation/audit` requires an admin-surface API token with
`moderation:read` (see `docs/security/api-token-lifecycle.md`).

| Parameter | Meaning |
|---|---|
| `actor` | Entries by one operator. |
| `targetId` | Entries for one moderation item. |
| `assetId` | Entries for one asset across moderation items. |
| `action` | One of the actions above. |
| `outcome` | `success`, `denied`, `not_found`, `invalid`. |
| `from`, `to` | ISO 8601 bounds, inclusive. |
| `page`, `pageSize` | Pagination (`docs/api/pagination.md`). |
| `verify=true` | Adds `integrity: { intact, entries, brokenAt? }`. |

Results are newest first. Examples:

```
GET /api/admin/moderation/audit?actor=GABC…&from=2026-10-01T00:00:00Z
GET /api/admin/moderation/audit?targetId=mod_1729…&verify=true
GET /api/admin/moderation/audit?outcome=denied
```
