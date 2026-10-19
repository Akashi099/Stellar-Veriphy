# Error responses

Every failure, whether expected or not, returns the same JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "retryable": false,
    "requestId": "0b6c1f0e-5d1e-4f8e-9a51-2a8f1f0c7d3e",
    "details": {
      "fields": [
        { "field": "email", "code": "required", "message": "Email is required." }
      ]
    }
  }
}
```

| Field | Meaning |
|---|---|
| `code` | A stable, machine-readable identifier. Branch on this, not on `message`. |
| `message` | A human-readable message that is safe to show to end users. |
| `retryable` | `true` means sending the same request later may succeed. `false` means the user (or the client code) must change something. |
| `retryAfterSeconds` | Optional. The minimum time to wait before retrying. The same value is also sent in the `Retry-After` header. |
| `requestId` | Matches the `X-Request-Id` header and the server logs. Show it in "contact support" messages. |
| `details` | Optional structured context. `details.fields` lists field-level validation errors. |

## Deciding what to do

```
retryable === true   → retry with backoff (respect Retry-After); show a transient notice if it keeps failing
retryable === false  → don't retry; alert the user:
                         VALIDATION_FAILED → show details.fields next to the matching inputs
                         UNAUTHENTICATED   → prompt the user to sign in
                         FORBIDDEN         → explain that they lack permission
                         INTERNAL_ERROR    → generic error, plus requestId for support
```

`ApiClientError` in `frontend/lib/api/client.ts` implements this logic. Check `error.retryable`, `error.shouldAlertUser` or `error.fieldErrors`. When the body isn't in this shape (for example, an HTML page from a proxy, or a network failure), the client builds an equivalent error: network failures become `NETWORK_ERROR` with `retryable: true`, and 502/503/504/429 responses are marked retryable.

## Codes

| Code | HTTP | Retryable |
|---|---|---|
| `BAD_REQUEST` | 400 | no |
| `INVALID_JSON` | 400 | no |
| `UNSUPPORTED_API_VERSION` | 400 | no |
| `UNAUTHENTICATED` | 401 | no |
| `SESSION_INVALID` | 401 | no |
| `SESSION_EXPIRED` | 401 | no |
| `SESSION_REVOKED` | 401 | no |
| `SESSION_REFRESH_SUPERSEDED` | 409 | yes |
| `FORBIDDEN` | 403 | no |
| `NOT_FOUND` | 404 | no |
| `CONFLICT` | 409 | no |
| `VALIDATION_FAILED` | 422 | no |
| `BULK_UPDATE_REJECTED` | 422 | no |
| `RATE_LIMITED` | 429 | yes |
| `INTERNAL_ERROR` | 500 | no |
| `SERVICE_UNAVAILABLE` | 503 | yes |
| `UPSTREAM_TIMEOUT` | 504 | yes |

The server may add new codes. Clients must handle codes they don't recognize by using `retryable`.

### Field error codes (`details.fields[].code`)

The codes are `required`, `invalid_type`, `too_short`, `too_long`, `invalid_format`, `must_accept` and `unknown_field`. The messages come from `frontend/lib/validation/fields.ts`, so every endpoint uses the same wording.

## Unknown failures

When anything other than an `ApiError` is thrown inside a route wrapped with `defineRoute`:

- Timeouts (`AbortError`, `TimeoutError`, `ETIMEDOUT`) become `UPSTREAM_TIMEOUT` (retryable).
- Connection failures (`ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, …) become `SERVICE_UNAVAILABLE` (retryable).
- Everything else becomes `INTERNAL_ERROR`. This is **not** retryable, because the server can't know whether the operation was idempotent or whether the fault is transient.

The original error's message, stack and name are written to the server log, together with the `requestId`. None of them appear in the response. Only the `message` and `details` of an explicitly thrown `ApiError` are public, so never put secrets, queries or internal identifiers in them.

## Throwing errors in route code

```ts
throw new ApiError("NOT_FOUND", { message: "Record not found." });
throw ApiError.validation([{ field: "email", code: "required", message: "Email is required." }]);
throw new ApiError("RATE_LIMITED", { retryAfterSeconds: 30 });
```
