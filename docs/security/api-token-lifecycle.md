# API Token Lifecycle

> Issue #670 · Labels: security, api, ops

StellarVeriphy API tokens authenticate integrations (SDK clients, the browser
extension, operational scripts and admin tooling). This document defines how
tokens are issued, expire, rotate, are revoked, and how access is segmented.

## Components

| Layer | Location |
|---|---|
| Lifecycle model | `packages/shared/utils/apiTokens.ts` |
| Server store & request guard | `frontend/lib/security/apiTokenStore.ts` (`requireApiToken`) |
| API | `GET/POST /api/tokens`, `GET/DELETE /api/tokens/[id]`, `POST /api/tokens/[id]/rotate` |
| Admin UI | `/admin/api-tokens` (`ApiTokenManager`) |
| Operator CLI | `scripts/api-token.mjs` (`pnpm api-token …`) |

## Token format and storage

```
svk_<surface>_<64 hex chars>      e.g. svk_sdk_3f9a…
```

- 256 bits of randomness from `crypto.getRandomValues`.
- The prefix identifies the surface and makes leaked tokens easy for secret
  scanners (add `svk_[a-z]+_[0-9a-f]{64}` to your scanner rules).
- Only `sha256(secret)` is stored. The plaintext is returned **once** on issue
  or rotate and is never logged. Comparisons are constant-time.
- Responses carrying a secret are sent with `Cache-Control: no-store`.

## Access segmentation

Each token is bound to exactly one **surface** and may only hold scopes that
surface allows. The allow-list is checked at issuance *and* on every request,
so a tampered record cannot escalate.

| Surface | Allowed scopes | Default TTL | Max TTL |
|---|---|---|---|
| `frontend` | verification:read/write, certificates:read, provenance:read, uploads:write, oracles:read | 30 d | 90 d |
| `extension` | verification:read, certificates:read, provenance:read | 90 d | 180 d |
| `sdk` | verification:read/write, certificates:read, provenance:read/export, uploads:write, oracles:read | 90 d | 365 d |
| `scripts` | provenance:read/export/replay, oracles:read | 30 d | 90 d |
| `admin` | moderation:read/write, oracles:read, provenance:read/replay, tokens:manage | 7 d | 30 d |

Routes declare the scope (and optionally surface) they need:

```ts
const guard = await requireApiToken(request, "moderation:write", "admin");
if (!guard.ok) return guard.response;
```

Tokens may optionally carry `allowedOrigins`; requests with a different
`Origin` header are rejected with 403.

## Lifecycle states

```
          issue
            │
            ▼
  ┌──────► active ──(≤7 days to expiry)──► expiring ──► expired
  │           │                               │
  │        rotate                           rotate
  │           ▼                               ▼
  │       rotating (old secret, grace window) ──(grace ends)──► expired
  │           │
  └─ new token issued (rotatedFromId → old)
  
  any live state ──revoke──► revoked
```

| Status | Accepted? | Notes |
|---|---|---|
| `active` | yes | |
| `expiring` | yes | within 7 days of `expiresAt`; plan a rotation |
| `rotating` | yes | superseded, still valid until `graceUntil` |
| `expired` | no (401) | past `expiresAt` or grace ended |
| `revoked` | no (401) | reason recorded: `user_requested`, `compromised`, `rotated`, `owner_removed`, `policy_violation` |

## Zero-downtime rotation

1. `POST /api/tokens/<id>/rotate` (or `pnpm api-token rotate --id <id>`).
   A replacement token with the same surface/scopes is issued; the old one
   moves to `rotating` with a 24 h grace window (`graceHours` to change it,
   capped at the old token's expiry).
2. Deploy the new secret to the client.
3. Watch `lastUsedAt` on the old token in `/admin/api-tokens`; once it stops
   advancing, revoke it or let the grace window lapse.

## Zero-downtime enforcement rollout

`API_TOKEN_ENFORCEMENT` controls the guard:

| Value | Behaviour |
|---|---|
| `off` | guard is a no-op (default outside production) |
| `monitor` | failures are logged as `api_token.denied` but allowed |
| `enforce` | failures are rejected (default in production) |

Roll out by running in `monitor` until `api_token.denied` logs are empty for
legitimate clients, then switch to `enforce`.

## Bootstrapping

Set `API_TOKEN_BOOTSTRAP_SECRET` on the server. While no live admin token
exists, `POST /api/tokens` with header `x-bootstrap-secret` may issue one
admin-surface token:

```bash
SV_API_URL=https://app.example.com SV_BOOTSTRAP_SECRET=… pnpm api-token bootstrap
```

Remove or rotate the bootstrap secret afterwards; it stops working as soon as
an admin token exists.

## Handling a compromised token

1. **Contain** — rotate with no grace and revoke:
   ```bash
   SV_ADMIN_TOKEN=svk_admin_… pnpm api-token compromised --id tok_…
   ```
   This issues a replacement, immediately invalidates the old secret, marks it
   `compromised`, and also ends the grace window of the token it replaced.
   (UI: *Compromised: rotate now*.)
2. **Redeploy** the replacement secret to the legitimate client.
3. **Investigate** — filter the audit log by `entityType: "api_token"` and the
   token id; review `api_token.denied` operational logs and access logs for
   the period between the suspected leak and revocation.
4. **Scope review** — if the token had broader scopes than needed, issue the
   replacement with fewer scopes instead of rotating.
5. **Report** — follow `SECURITY.md` if user data may have been accessed.

## Handling expiry

- Tokens show as `expiring` 7 days before `expiresAt`, and the admin UI lists
  their expiry. Rotate them during that window.
- An expired token cannot be rotated; issue a new one with the same
  surface/scopes and redeploy.
- Expiry is mandatory by design — there are no non-expiring tokens.

## Audit trail

Issue, rotate and revoke actions are written to the audit log with
`entityType: "api_token"`, the token id, surface, scopes, display prefix and
expiry — never the secret or its digest.
