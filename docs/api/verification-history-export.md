# Verification history export

`GET /api/v1/users/:address/verifications/export` returns every verification
event for one account in a portable format (#785). The server lives in
`frontend/lib/server/verification-history-export.ts`, and the browser client is
`fetchVerificationHistoryExport` in `frontend/lib/api/verificationHistoryExport.ts`.

## Access

- Requires `Authorization: Bearer <token>`. A session access token (see
  `docs/security/auth-session-refresh.md`) or an `API_TOKENS` credential both work.
- Only the account owner (`actor.subject === address`) or an `admin` may export.
  Anyone else gets `403 FORBIDDEN`. An address that isn't a valid Stellar address
  returns `404 NOT_FOUND`.
- Every source is filtered by the account's creator address before the export is
  built, so an export never contains another account's events.
- Each export is logged as `verification_history.exported` (with a hashed actor).

## Query parameters

| Parameter | Default | Meaning |
|---|---|---|
| `format` | `json` | `json` or `csv`. |
| `from`, `to` | none | ISO 8601 bounds on `occurredAt`, inclusive. |
| `type` | all | Event type to include. Repeat to include several. |

Invalid parameters return `422 VALIDATION_FAILED` with `details.fields`.

## Events

| Type | Source |
|---|---|
| `upload_registered` | Upload metadata stored (`POST /api/uploads`). |
| `upload_session_started` / `_completed` / `_aborted` / `_expired` | Resumable upload sessions. |
| `verification_job_queued` / `_started` / `_completed` / `_failed` | Verification jobs for the account's uploads. |
| `verification_record_created` / `verification_status_changed` | Verification records and their latest status change. |

Events are sorted oldest first (ties broken by `id`), so repeated exports of the
same data are identical.

## JSON

```json
{
  "data": {
    "schemaVersion": 1,
    "account": "GABC…",
    "generatedAt": "2026-10-19T12:00:00.000Z",
    "range": { "from": null, "to": null },
    "summary": {
      "totalEvents": 4,
      "byType": { "upload_registered": 1, "verification_job_queued": 1, "verification_job_completed": 1, "verification_record_created": 1 },
      "uploads": 1,
      "verificationJobs": 1,
      "verificationRecords": 1
    },
    "events": [
      {
        "id": "upload_registered:6f1c…",
        "type": "upload_registered",
        "occurredAt": "2026-10-18T09:14:03.120Z",
        "contentHash": "9b2e…",
        "manifestHash": "41aa…",
        "uploadId": "6f1c…",
        "jobId": null,
        "sessionId": null,
        "recordId": null,
        "status": null,
        "detail": "launch-photo.jpg"
      }
    ]
  }
}
```

Every event has the same keys. Fields that don't apply are `null`, never missing.
`summary` counts reflect the filtered events (`totalEvents`, `byType`) and the
account's totals (`uploads`, `verificationJobs`, `verificationRecords`).

## CSV

The CSV uses the columns `occurredAt,type,id,status,contentHash,manifestHash,uploadId,jobId,sessionId,recordId,detail`.
It follows RFC 4180, with CRLF line endings and quoted fields. Cells that start
with `=`, `+`, `-`, `@` or a tab are prefixed with `'` so spreadsheets don't run them as formulas.

## Response headers

- `Content-Disposition: attachment; filename="verification-history-<address prefix>-<date>.<format>"`
- `X-Export-Schema-Version: 1`. The version is bumped only on breaking changes to the event shape.
- `Cache-Control: no-store`
