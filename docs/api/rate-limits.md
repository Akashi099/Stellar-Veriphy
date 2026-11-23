# Rate limits

## Backend service API

The backend applies independent, fixed-window limits to each matched route and caller. A window is
60 seconds. Read and write routes, and public and admin routes, use separate budgets:

| Route class | Anonymous (per direct peer IP) | Authenticated admin token | Approved trusted integration token |
| --- | ---: | ---: | ---: |
| Public read | 120/min | 300/min | 1,200/min |
| Public write | 20/min | 60/min | 300/min |
| Admin/private read | 10/min | 120/min | 300/min |
| Admin/private write | 5/min | 60/min | 120/min |

Each route has its own counter in addition to its class budget. Health checks and `/metrics` are
exempt so monitoring continues during traffic spikes. Anonymous callers are keyed by the direct
socket peer address; forwarded-IP headers are not trusted. The supplied `X-User-Id` header is not
an authenticated identity and never changes the rate-limit tier.

An admin request is authenticated only by the configured `ADMIN_TOKEN`. Approved integrations can
be assigned the trusted tier by adding one or more distinct, randomly generated bearer tokens (at
least 32 characters each) to `RATE_LIMIT_TRUSTED_TOKENS`, comma-separated. A trusted token changes
the rate budget only; it does not authorize admin routes or grant user permissions. Store tokens as
secrets. To rotate without interruption, configure both old and new tokens, deploy, switch the
integration, then remove the old token. Do not send trusted tokens in URLs.

Counters are stored in MongoDB, so limits are shared across backend instances. If MongoDB cannot
check a counter, the request fails closed with `503 RATE_LIMIT_UNAVAILABLE` rather than bypassing
the limits. Rate-limited responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset` (Unix seconds), and `X-RateLimit-Window`. A `429 RATE_LIMITED` also includes
`Retry-After` and a JSON `retryAfterSeconds` countdown. The response exposes no caller identity,
token, or address. Wait the indicated number of seconds before retrying.

Example:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1795439220
X-RateLimit-Window: 60
Content-Type: application/json

{"error":"Too many requests","code":"RATE_LIMITED","message":"Rate limit exceeded. Retry in 12 seconds.","retryAfterSeconds":12,"rateLimit":{"limit":20,"remaining":0,"windowSeconds":60,"retryAt":"2026-11-23T13:07:00.000Z"}}
```

## Frontend route limits

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
