# StellarVeriphy HTTP API

The API is served by Next.js route handlers under `frontend/app/api`.

- [Versioning](./versioning.md): how to select a version, how deprecations are announced, and how to migrate
- [Errors](./errors.md): the error response shape, error codes, and retry guidance

## Conventions

| Topic | Convention |
|---|---|
| Base path | `/api/v1/...` (or `/api/...` with an `X-API-Version` header) |
| Request body | JSON, sent with `Content-Type: application/json` |
| Success body | `{ "data": ... }` |
| Error body | `{ "error": { code, message, retryable, requestId, details? } }` |
| Correlation | Every response includes `X-Request-Id`. If you send a safe `X-Request-Id`, the server reuses it. |
| Auth | `Authorization: Bearer <token>` (interim; tokens are configured through the `API_TOKENS` env var) |

From the browser, use `apiRequest` in `frontend/lib/api/client.ts`. It sends the version header, unwraps `data`, and throws an `ApiClientError` that has `retryable`, `shouldAlertUser` and `fieldErrors` set.

## Authentication (interim)

Until wallet-signature sessions exist, tokens are configured on the server:

```
API_TOKENS="tokenA:admin:ops-team,tokenB:moderator:mod-alice,tokenC:user:GABC...XYZ"
```

The format is `token:role:subject`. Roles are `admin`, `moderator` and `user`. For a `user` token, the subject must be that user's Stellar address.

## Endpoints (v1)

### `GET /api/health`

This is an unversioned liveness check.

### `POST /api/v1/users/onboarding`

Creates a user account. No auth is required.

| Field | Required | Rules |
|---|---|---|
| `displayName` | yes | 2–64 chars |
| `email` | yes | valid email, ≤ 254 chars |
| `stellarAddress` | yes | Stellar public key (`G` + 55 base32 chars) |
| `acceptedTerms` | yes | must be `true` |
| `bio` | no | ≤ 500 chars |

Responses:

- `201` with the profile on success
- `422 VALIDATION_FAILED` if any field is invalid
- `409 CONFLICT` if the address is already registered

### `GET /api/v1/users/{address}/profile`
### `PATCH /api/v1/users/{address}/profile`

Requires the user's own token or an admin token.

`PATCH` is a partial update of `displayName`, `email` and `bio`. Fields you leave out are unchanged. The required fields (`displayName`, `email`) can't be cleared: sending them blank or `null` returns the same `required` error that onboarding returns. Send `bio: null` to clear the bio. `stellarAddress` can't be changed.

Both endpoints use the field rules in `frontend/lib/validation/user.ts`. Client forms should import the same module, so client-side checks and server responses always agree.

### `POST /api/v1/records/bulk-status`

Changes the verification status of several records at once. Requires an `admin` or `moderator` token.

```json
{
  "ids": ["rec_1", "rec_2"],
  "status": "failed",
  "reason": "Manifest hash mismatch",
  "atomic": true
}
```

| Field | Required | Rules |
|---|---|---|
| `ids` | yes | 1–100 unique, non-empty strings |
| `status` | yes | `pending`, `processing`, `certified` or `failed` |
| `reason` | only when `status` is `failed` | ≤ 500 chars |
| `atomic` | no (default `true`) | `true`: if any record can't be updated, none are. `false`: valid records are updated and failures are reported. |

**Permissions:** Admins can set any status. Moderators can set `pending`, `processing` or `failed`, but not `certified`. Anyone else gets `403 FORBIDDEN`. A forbidden target status rejects the whole request before any record is examined.

**Allowed transitions:**

| From | To |
|---|---|
| `pending` | `processing`, `failed` |
| `processing` | `pending`, `certified`, `failed` |
| `failed` | `pending` |
| `certified` | none (terminal) |

Setting a record to the status it already has succeeds with `changed: false`.

**Success (`200`):**

```json
{
  "data": {
    "atomic": false,
    "summary": { "requested": 2, "succeeded": 1, "failed": 1, "changed": 1 },
    "results": [
      { "id": "rec_1", "ok": true, "previousStatus": "processing", "status": "failed", "changed": true },
      { "id": "rec_2", "ok": false, "error": { "code": "invalid_transition", "message": "Cannot change status from certified to failed." } }
    ]
  }
}
```

**Atomic rejection (`422 BULK_UPDATE_REJECTED`):** No records were written. `error.details` has the same `summary` and `results` structure, so the client can show which records blocked the batch.

Per-item error codes are `not_found` and `invalid_transition`.
