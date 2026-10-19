# Rate limits

Some API routes are rate limited per caller (wallet address, falling back to
client IP). When a caller goes over the limit the API returns **HTTP 429**,
with a body and headers that explain which limit was hit and when to retry.

## Limits

| Route | Limit | Configured by |
| --- | --- | --- |
| `POST /api/verification` | 30 requests / 60 s per address (defaults) | `VERIFICATION_RATE_LIMIT_WINDOW_MS`, `VERIFICATION_RATE_LIMIT_MAX_REQUESTS` |
| `POST /api/auth/verify-email` (`action: "request"`) | 1 code / 60 s per email | fixed |
| `POST /api/auth/verify-email` (`action: "verify"`) | 5 attempts per code | fixed |

Exceeding the verification limit adds a backoff that grows with each repeated
violation (`VERIFICATION_RATE_LIMIT_BACKOFF_BASE_MS` ×
`VERIFICATION_RATE_LIMIT_BACKOFF_MULTIPLIER`^(n−1)). Addresses in
`VERIFICATION_RATE_LIMIT_WHITELIST` are not limited.

## Headers

Sent on every response from a rate-limited route:

| Header | Meaning |
| --- | --- |
| `X-RateLimit-Limit` | Requests allowed per window |
| `X-RateLimit-Remaining` | Requests left in the current window |
| `X-RateLimit-Reset` | Unix time (seconds) when the window resets |
| `X-RateLimit-Window` | Window length in seconds |

Added only on a 429:

| Header | Meaning |
| --- | --- |
| `Retry-After` | Seconds to wait before retrying |
| `X-RateLimit-Backoff-Seconds` | Same value; kept for existing clients |

## 429 response body

```json
{
  "success": false,
  "status": "rate_limited",
  "code": "rate_limited",
  "message": "Too many verification requests. You can make up to 30 every 1 minute. Please try again in 5 seconds.",
  "error": "Too many verification requests. You can make up to 30 every 1 minute. Please try again in 5 seconds.",
  "retryAfterSeconds": 5,
  "rateLimit": {
    "limit": 30,
    "remaining": 0,
    "windowSeconds": 60,
    "retryAfterSeconds": 5,
    "retryAt": "2026-10-17T12:00:05.000Z",
    "resetAt": "2026-10-17T12:00:42.000Z",
    "violations": 1
  },
  "requestId": "req_3f9c1a…"
}
```

`message` is written for end users and can be shown as is. `error` holds the
same text for clients that read that field.

## Handling 429s in the frontend

- `lib/api.ts` reads this metadata into an `ApiError` (`isRateLimited`,
  `retryAfterSeconds`, `rateLimit`, `requestId`). When automatic retries are
  enabled it waits at least `Retry-After` before trying again.
- `fetchJson()` in `lib/apiErrors.ts` does the same for direct `fetch` calls.
- `<RetryableError error={err} onRetry={…} />` shows the message, disables the
  retry button with a countdown ("Retry in 5s") until `Retry-After` has passed,
  and shows the request ID for support.

If the body is missing (for example, a 429 from a proxy), `rateLimitMessage()`
builds a message from the headers alone.
