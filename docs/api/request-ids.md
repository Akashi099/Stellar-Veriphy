# Request IDs

Every response from the Next.js API (`/api/*`) carries an `X-Request-Id`
header. The same ID is written to every structured server log line for that
request, so a single value links what the user saw to what the server did.

## How the ID is assigned

[`frontend/middleware.ts`](../../frontend/middleware.ts) runs on every `/api/*`
request:

1. If the request already has an `X-Request-Id` (or `X-Correlation-Id`) header
   that is 8–128 characters of `A-Z a-z 0-9 . _ : -`, it is reused.
2. Otherwise a new ID is generated, for example `req_3f9c1a…`.
3. The ID is forwarded to the route handler and returned as
   `X-Request-Id` on the response.

Route handlers read it with `requestIdFrom(req)` from
[`lib/server/observability.ts`](../../frontend/lib/server/observability.ts) and
pass it to `logOperationalEvent()`, so it shows up as the `requestId` field in
JSON logs:

```json
{"event":"verification_request.rate_limited","level":"warn","requestId":"req_3f9c1a…","route":"POST /api/verification","status":429,...}
```

Error bodies from `serverError()` and from rate-limited responses also include
`requestId`, so clients that can't read headers still get it.

## Client behaviour

The frontend API client ([`lib/api.ts`](../../frontend/lib/api.ts) and
`fetchJson` in [`lib/apiErrors.ts`](../../frontend/lib/apiErrors.ts)) sends a
fresh `X-Request-Id` with each attempt, so browser console logs and server logs
share the same ID. Failed calls throw an `ApiError` whose `requestId` property
holds the value, and the `RetryableError` component shows it as a
**Reference ID** in error states.

## Troubleshooting with a request ID

1. Ask the user for the **Reference ID** shown in the error message (or copy
   `X-Request-Id` from the browser's Network tab).
2. Search the server logs for it:

   ```bash
   # local / docker
   docker compose logs frontend | grep 'req_3f9c1a'
   # JSON logs
   jq 'select(.requestId == "req_3f9c1a…")' app.log
   ```

3. The matching lines show the route, operation, status, reason, and a hashed
   actor for that request.

When calling the API from scripts or other services, send your own
`X-Request-Id` to tie your logs to ours:

```bash
curl -H 'X-Request-Id: my-job-20261017-0001' https://<host>/api/jobs?ids=abc
```
