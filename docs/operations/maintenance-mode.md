# Maintenance mode

> Issue #787 · Labels: backend, infra, ops

Maintenance mode puts the service into a controlled, read-mostly state for planned work (database migrations, contract upgrades, provider swaps). You toggle it at runtime. Nothing is redeployed or restarted, and the service keeps answering requests.

## What changes while it is on

| Area                                               | Behaviour                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read requests (`GET`, `HEAD`, `OPTIONS`)           | Served normally. Verification status lookups, certificate lookups and creator history keep working.                                                               |
| Write requests (any other method) on public routes | Rejected with `503`, a `Retry-After` header and a JSON body (see below). Nothing is half-written.                                                                 |
| `/health/*`, `/metrics`                            | Unaffected, so orchestrators and dashboards keep working.                                                                                                         |
| `/admin/*`                                         | Unaffected, so operators can inspect jobs and turn maintenance off.                                                                                               |
| Job workers                                        | Keep running by default. With `pauseJobs: true`, workers stop claiming new jobs. In-flight jobs finish and queued jobs wait. Nothing is dropped or dead-lettered. |
| Every response                                     | Carries `X-Maintenance-Mode: on`.                                                                                                                                 |
| Frontend                                           | Shows a site-wide banner (`MaintenanceBanner`) with the message and expected end time.                                                                            |

Rejected write response:

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 1800
X-Maintenance-Mode: on
Content-Type: application/json; charset=utf-8

{
  "error": "Service is under maintenance",
  "code": "MAINTENANCE",
  "message": "Database upgrade in progress. New submissions resume at 14:30 UTC.",
  "endsAt": "2026-10-20T14:30:00.000Z"
}
```

`Retry-After` counts down to `endsAt` when one is set. Otherwise it is `MAINTENANCE_RETRY_AFTER_SECONDS`.

## Turning it on and off

The flag is stored in the MongoDB `settings` collection (`_id: "maintenance"`). Each instance re-reads it every `MAINTENANCE_REFRESH_MS` (default 5s), so a change reaches the whole fleet within one refresh interval. Request handling uses the cached value and never waits on the database.

```bash
# Enable (all fields optional)
curl -X PUT https://api.example.com/admin/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"message":"Database upgrade in progress.","endsAt":"2026-10-20T14:30:00Z","pauseJobs":true}'

# Check the current state (re-reads the stored flag)
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://api.example.com/admin/maintenance

# Disable
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" https://api.example.com/admin/maintenance
```

| Field       | Type                    | Notes                                                                                                                   |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `message`   | string, ≤ 500 chars     | Shown to users. Defaults to `MAINTENANCE_MESSAGE`.                                                                      |
| `endsAt`    | ISO-8601, in the future | Drives `Retry-After` and the banner's "expected back by" text. Maintenance is **not** ended automatically at this time. |
| `pauseJobs` | boolean                 | Stop workers claiming new jobs. Defaults to `false`.                                                                    |

Calling `PUT` again while maintenance is on updates the message or end time and keeps the original `startedAt`.

The public status endpoint is `GET /api/status/maintenance`. The frontend reads it through `GET /api/maintenance`.

### Break-glass: `MAINTENANCE_MODE=true`

Setting `MAINTENANCE_MODE=true` forces maintenance on for an instance, whatever the stored flag says. Use it when the database itself is unavailable or is the thing being maintained. Changing it requires a restart. `DELETE /admin/maintenance` cannot override it, and the response says so with a `warning`.

On the frontend, `NEXT_PUBLIC_MAINTENANCE_MODE=true` (with optional `NEXT_PUBLIC_MAINTENANCE_MESSAGE`) shows the banner even when the backend can't be reached.

## Failure behaviour

- **Flag refresh fails** (MongoDB blip): each instance keeps its last known state and logs `failed to refresh maintenance flag`. A database outage never turns maintenance on or off by itself.
- **Frontend can't reach the backend**: the banner stays hidden (`enabled: false, unavailable: true`). Use the static `NEXT_PUBLIC_MAINTENANCE_MODE` fallback if users must see a notice during a full backend outage.

## Observability

| Signal                                              | Meaning                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sv_maintenance_mode{source}`                       | `1` while on, labelled `operator` or `env`. Aggregate with `max()`.                           |
| `sv_maintenance_rejected_requests_total{method}`    | Writes rejected with `503`.                                                                   |
| Log `maintenance mode is ON` / `OFF`                | Each instance logs the transition once, with `source`, `endsAt`, `pauseJobs` and `updatedBy`. |
| Log `maintenance mode enabled/disabled by operator` | The admin call itself, with the caller's address.                                             |

Suggested alert: `max(sv_maintenance_mode) == 1` for longer than the planned window. This catches a maintenance window that was never closed.

## Configuration

| Variable                          | Default                 | Purpose                                                          |
| --------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `MAINTENANCE_MODE`                | `false`                 | Break-glass override (restart required).                         |
| `MAINTENANCE_MESSAGE`             | built-in text           | Default user-facing message.                                     |
| `MAINTENANCE_REFRESH_MS`          | `5000`                  | How often each instance re-reads the flag.                       |
| `MAINTENANCE_RETRY_AFTER_SECONDS` | `300`                   | `Retry-After` when no `endsAt` is set.                           |
| `BACKEND_URL` (frontend)          | `http://localhost:4000` | Where the frontend's `/api/maintenance` proxy reads status from. |
