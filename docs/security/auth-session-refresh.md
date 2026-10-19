# Auth session refresh

Login and session renewal follow one set of expiry rules (#783). The server side
lives in `frontend/lib/server/auth-sessions.ts`, the routes under
`frontend/app/api/v1/auth/session`, and the client state machine in
`frontend/context/AuthSessionContext.tsx`.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/auth/session` | `Bearer <API_TOKENS credential>` | Login. Returns `{ session, accessToken, refreshToken, tokenType }`. |
| `POST` | `/api/v1/auth/session/refresh` | body `{ refreshToken }` | Rotates both tokens. The access token may already be expired. |
| `GET` | `/api/v1/auth/session` | `Bearer <accessToken>` | Current session state. |
| `DELETE` | `/api/v1/auth/session` | `Bearer <accessToken>` | Logout (revokes the session). |

Session access tokens (`sva_…`) are accepted anywhere `requireActor` is used.
Responses are sent with `Cache-Control: no-store`.

## Expiry rules

| Setting | Env var | Default |
|---|---|---|
| Access token lifetime | `AUTH_ACCESS_TTL_SECONDS` | 15 minutes |
| Idle timeout (refresh token lifetime) | `AUTH_SESSION_IDLE_SECONDS` | 7 days |
| Absolute session lifetime | `AUTH_SESSION_MAX_SECONDS` | 30 days |
| Refresh-token reuse grace | `AUTH_REFRESH_REUSE_GRACE_SECONDS` | 30 seconds |
| Refresh lead time | `AUTH_REFRESH_LEAD_SECONDS` | 60 seconds |

- Login fixes the absolute expiry. Nothing extends it; sign in again afterwards.
- Every refresh issues a new access token and refresh token and extends the idle
  window, capped at the absolute expiry. The access token never outlives the session.
- `session.refreshAfter` tells the client when to refresh (before the access token
  expires), so clients refresh on schedule instead of waiting for a 401.
- A session token cannot be used to log in again; renewals must go through refresh.

## Errors

| Code | HTTP | Meaning | Client transition |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | No credentials sent. | `signed_out` |
| `SESSION_INVALID` | 401 | Token not recognised (malformed, or the session was purged). | `expired` |
| `SESSION_EXPIRED` | 401 | `details.reason` is `access_token_expired` (refreshable), `idle_timeout` or `max_lifetime`. | refresh, or `expired` |
| `SESSION_REVOKED` | 401 | Logged out, or `details.reason: "refresh_token_reuse"`. | `revoked` |
| `SESSION_REFRESH_SUPERSEDED` | 409 | The previous refresh token was presented within the grace window; another tab/request already rotated it. | adopt the newer tokens, stay `active` |

## Refresh token reuse

Refresh tokens are single use. Presenting the previous refresh token again:

- within the grace window → `SESSION_REFRESH_SUPERSEDED` (a benign concurrent refresh);
- after the grace window → the session is revoked (`refresh_token_reuse`), because a
  copied token is being replayed.

## Client state machine

```
signed_out ─login─▶ authenticating ─▶ active ─▶ refreshing ─▶ active
                         │                          ├─▶ expired
                         └────────── error ◀────────┴─▶ revoked
```

`AuthSessionProvider` deduplicates refreshes within a tab, shares tokens across
tabs through `localStorage`, and keeps the session on retryable failures (network
errors, 5xx) so a transient outage doesn't sign the user out.
