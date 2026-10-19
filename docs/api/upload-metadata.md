# Upload metadata and verification job API

Validation rules live in `packages/shared/validation` and are shared by the upload form and these routes, so the browser and the server accept exactly the same payloads.

All responses use this envelope:

```json
{ "status": "<status>", "message": "optional human-readable text", "errors": [], "data": {} }
```

`errors` is a list of `{ "field": "manifest.creator", "message": "...", "hint": "..." }`, where `field` is a dotted path into the request body.

| HTTP | `status` | Meaning |
|------|----------|---------|
| 200 | `ok` | Read succeeded |
| 200 | `exists` | The same file (`contentHash`) was already registered by this `creator`; the existing record is returned |
| 201 | `created` | Upload metadata stored |
| 202 | `queued` | Verification job queued |
| 400 | `invalid_json` | Body is not valid JSON |
| 404 | `not_found` | Unknown upload, job or upload session ID |
| 409 | `conflict` | The action is not allowed in the resource's current state (upload sessions) |
| 410 | `expired` | The upload session expired; restart it |
| 415 | `unsupported_media_type` | `Content-Type` is not `application/json` |
| 422 | `validation_error` | Body failed validation; see `errors` |
| 500 | `server_error` | Unexpected failure; safe to retry |

## `POST /api/uploads`

Registers upload metadata.

```json
{
  "fileName": "sunset.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 482113,
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  "title": "Sunset over Lagos",
  "description": "Unedited original.",
  "tags": ["landscape", "original"],
  "manifest": {
    "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
    "timestamp": "2026-09-01T18:42:00Z",
    "metadata": { "device": "Pixel 9", "location": "Lagos, NG" }
  }
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `fileName` | yes | ≤ 255 chars, no path separators; extension must match `mimeType` |
| `mimeType` | yes | One of the supported types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/mpeg`, `audio/wav`, `audio/ogg`, `application/pdf` |
| `fileSize` | yes | Integer bytes, > 0 and ≤ 500 MB |
| `contentHash` | yes | SHA-256 of the file's raw bytes, 64 hex chars |
| `creator` | yes | Stellar public key (`G…`, 56 chars, valid checksum). Secret keys (`S…`) are rejected with a warning |
| `title` | no | ≤ 120 chars |
| `description` | no | ≤ 2000 chars |
| `tags` | no | ≤ 20 strings, each ≤ 40 chars |
| `manifest` | yes | See below |

Manifest rules:

| Field | Required | Rules |
|-------|----------|-------|
| `contentHash` | yes | 64 hex chars; **must equal** the upload `contentHash` |
| `creator` | yes | Stellar public key; **must equal** the upload `creator` |
| `timestamp` | yes | ISO 8601 with timezone; no more than 5 minutes in the future |
| `metadata` | no | Object with only `device`, `location` or `aiModel` (strings, ≤ 200 chars, no control characters). If present, at least one value must be non-empty |

Unknown fields are rejected at every level.

### Normalization

The stored record is normalized so later steps get one consistent format:

- hashes: whitespace, `0x` and `sha256:` prefixes removed, lowercase
- `creator`: trimmed, uppercase
- `mimeType`: lowercase, parameters (`; charset=…`) removed
- `timestamp`: converted to UTC `YYYY-MM-DDTHH:mm:ss.sssZ`
- text fields trimmed; empty optional fields and empty metadata values dropped
- `tags`: trimmed, lowercase, duplicates removed
- manifest keys in a fixed order

The response `data` is the stored `UploadRecord`, which is the normalized metadata plus:

- `id`: UUID
- `createdAt`: ISO 8601
- `manifestHash`: SHA-256 of the manifest serialized as canonical JSON (keys sorted, no whitespace)

## `GET /api/uploads?contentHash=<sha256>`

Returns every `UploadRecord` with that content hash (it may be an empty list), paginated with `page`/`pageSize`/`cursor` and a `pagination` object. See [pagination.md](./pagination.md).

## Resumable uploads

Interrupted uploads can be resumed or restarted through `/api/uploads/sessions`. See [upload-sessions.md](./upload-sessions.md). Manifest creation, validation and retrieval are covered end to end in [manifest-storage.md](./manifest-storage.md), and the shared validation layer in [validation.md](./validation.md).

## `GET /api/uploads/:id`

Returns one `UploadRecord`.

## `POST /api/jobs`

```json
{ "uploadId": "<upload id>" }
```

Queues a verification job and returns `202` with the job.

### Client retry policy

The creator review flow retries `POST /api/uploads` and `POST /api/jobs` for transient failures only: network failures, `408`, `409`, `425`, `429`, and `5xx` responses. Retries use exponential backoff with jitter, start around 800 ms, cap at 6 seconds, and stop after 4 total attempts. Validation failures and unsupported media types are not retried.

The UI shows a retrying state while another attempt is scheduled and switches to a failed state after the cap is reached. The client logs retry attempts with status, delay, and attempt count; final retry exhaustion is logged as an error for maintainers.

## `GET /api/jobs?ids=<id>,<id>` and `GET /api/jobs/:id`

These return the current state of jobs. The list form omits unknown IDs and accepts at most 50 IDs.

```json
{
  "id": "…",
  "uploadId": "…",
  "status": "pending | processing | certified | failed",
  "createdAt": "…",
  "startedAt": "…",
  "completedAt": "…",
  "error": "reason, when failed",
  "result": { "manifestHash": "…" },
  "queuePosition": 1,
  "estimatedWaitMs": 4000,
  "averageDurationMs": 2000
}
```

`queuePosition` is set only while the job is `pending`. `estimatedWaitMs` is `null` until some jobs have completed, because it is based on the average duration of recent jobs.

## Storage

Records are stored as JSON files in `frontend/.data/` by default. Set `VERIPHY_DATA_DIR` to use a different directory. Serverless platforms need a writable volume, or a database behind the same interface in `frontend/lib/server/`.
