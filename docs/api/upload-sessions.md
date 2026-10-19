# Resumable upload sessions

An upload session records which chunks of a file have been transferred. If the connection drops or the tab reloads, the client asks the server what is already done and continues from there. It can also discard that progress and start over.

The contract lives in `packages/shared/validation/uploadSession.ts`. The server store is `frontend/lib/server/upload-sessions.ts`, and the browser client is `frontend/lib/resumable-upload.ts`. Sessions are saved as JSON files next to upload records (`VERIPHY_DATA_DIR`), so they survive client disconnects and server restarts.

Responses use the envelope from [upload-metadata.md](./upload-metadata.md). Validation errors follow [validation.md](./validation.md).

## Lifecycle

```
POST /sessions ──► in_progress ──(progress…)──► complete ──► completed
                       │  ▲                                     
                 abort │  │ restart                             
                       ▼  │                                     
                    aborted / expired (24 h without activity)
```

1. Call `POST /api/uploads/sessions` once the file's SHA-256 is known.
2. Send each chunk listed as missing. Report finished chunks with `PATCH … { "action": "progress" }`.
3. Register the metadata with `POST /api/uploads`. Then call `PATCH … { "action": "complete", "uploadId" }`.

## Session object

```json
{
  "id": "6f1c…",
  "fileName": "sunset.mp4",
  "mimeType": "video/mp4",
  "fileSize": 12582912,
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  "chunkSize": 5242880,
  "totalChunks": 3,
  "completedChunks": [0],
  "bytesReceived": 5242880,
  "status": "in_progress",
  "attempt": 2,
  "restartCount": 0,
  "createdAt": "2026-10-17T10:00:00.000Z",
  "updatedAt": "2026-10-17T10:04:12.000Z",
  "expiresAt": "2026-10-18T10:04:12.000Z",
  "progress": 41.6,
  "nextChunk": 1,
  "remainingChunks": 2
}
```

| Field | Meaning |
|-------|---------|
| `completedChunks` | Sorted, de-duplicated indexes the server has recorded |
| `bytesReceived` | Computed from `completedChunks`. The last chunk may be shorter than `chunkSize` |
| `progress` | `bytesReceived / fileSize` as a percentage, rounded down to one decimal place |
| `nextChunk` | First missing chunk index, or `null` when every chunk is recorded |
| `attempt` | `1` on creation. It goes up by 1 on every resume or restart |
| `restartCount` | How many times progress was discarded |
| `status` | `in_progress`, `completed`, `aborted` or `expired` |
| `uploadId` | Set by `complete` when an upload record is linked |

The server derives progress from the stored chunk list. Re-reporting a chunk after a retry does not change the numbers, so progress stays consistent across retries.

## `POST /api/uploads/sessions`

```json
{
  "fileName": "sunset.mp4",
  "mimeType": "video/mp4",
  "fileSize": 12582912,
  "contentHash": "9f86d0…0a08",
  "creator": "GBRPYHIL…7QC7OX2H",
  "chunkSize": 5242880
}
```

`fileName`, `mimeType`, `fileSize`, `contentHash` and `creator` follow the same rules as `POST /api/uploads`. `chunkSize` is optional. It defaults to 5 MB and must be between 256 KB and 50 MB.

| HTTP | `status` | When |
|------|----------|------|
| 201 | `created` | A new session was started |
| 200 | `exists` | An `in_progress` session already existed for this `creator` and `contentHash`, with the same `fileSize` and `chunkSize`. It is resumed: `attempt` goes up and the expiry is extended. Continue from `nextChunk` |
| 422 | `validation_error` | Invalid body |

A client that lost the session ID can get it back by sending the same request again.

## `GET /api/uploads/sessions/:id`

Returns the session object, or `404 not_found`. An `in_progress` session past `expiresAt` is reported as `expired`.

## `GET /api/uploads/sessions?creator=G…&contentHash=…&status=…`

Lists sessions, most recently updated first. At least one of `creator` or `contentHash` is required. `status` is optional. The list is paginated (see [pagination.md](./pagination.md)).

## `PATCH /api/uploads/sessions/:id`

| Body | Effect |
|------|--------|
| `{ "action": "progress", "chunks": [1, 2] }` | Adds the chunks to `completedChunks`. Accepts up to 1000 indexes per call. Each index must be below `totalChunks`. Duplicates are ignored |
| `{ "action": "resume" }` | Increases `attempt` and extends the expiry. It does not change progress |
| `{ "action": "restart" }` | Clears `completedChunks` and `bytesReceived`, increases `attempt` and `restartCount`, and sets status back to `in_progress`. Works on `in_progress`, `aborted` and `expired` sessions |
| `{ "action": "abort" }` | Sets status to `aborted`. Use `restart` to reopen it |
| `{ "action": "complete", "uploadId": "…" }` | Requires every chunk to be recorded. `uploadId` is optional. If given, it must be an upload with the same `contentHash` and `creator` |

| HTTP | `status` | When |
|------|----------|------|
| 200 | `ok` | Updated session returned |
| 404 | `not_found` | Unknown session |
| 409 | `conflict` | The action is not allowed in the current state: completing with missing chunks, restarting a completed session, or updating an aborted or completed one |
| 410 | `expired` | The session expired. Send `restart`, or start a new session |
| 422 | `validation_error` | Unknown action, bad chunk indexes, or an `uploadId` that does not match |

## Client behavior

`frontend/lib/resumable-upload.ts` is used by the upload form (`components/UploadForm.tsx`):

- It stores the session ID in `localStorage` under `stellar-veriphy:upload-sessions:v1`, keyed by creator and content hash.
- When the user selects a file that has an unfinished session, the form shows how far it got and offers **Resume where it stopped** or **Start over**. Start over sends `restart`.
- It sends the missing chunks and reports progress every 4 chunks. If the connection drops, at most one batch is sent again.
- Session calls retry transient failures with the same backoff as the upload API: 4 attempts, starting near 800 ms and capped at 6 s.

Files are hashed in the browser, and today only metadata is sent to the server. The default chunk transport (`readChunkLocally`) therefore only reads each chunk. Pass a different `transport` to `uploadMissingChunks` when chunks should go to storage, for example IPFS or object storage. The session API stays the same.

## Concurrent updates

Writes to one session are serialized, and `GET`/`PATCH` responses carry an `ETag`.
Send it as `If-Match` to get `409 conflict` (with the current session in `data`)
instead of applying an update based on stale state. See [write-concurrency.md](./write-concurrency.md).
