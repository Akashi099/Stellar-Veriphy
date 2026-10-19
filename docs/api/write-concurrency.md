# Write concurrency for manifests and asset records

Rapid or parallel saves to the same manifest or asset record are serialized,
and a client can make a write conditional on the state it last read (#786).
The helpers live in `frontend/lib/server/write-concurrency.ts`.

## Serialized writes

Each read-modify-write section runs under a per-record lock (`withKeyLock`), so
two requests can't both read the old state and then overwrite each other.

| Write | Lock key |
|---|---|
| `POST /api/uploads` (duplicate check + insert) | `upload:<creator>:<contentHash>` |
| `POST /api/uploads/sessions` (start or resume) | `upload-session-start:<creator>:<contentHash>` |
| `PATCH /api/uploads/sessions/:id`, lazy expiry on read | `upload-session:<id>` |
| `POST /api/versions`, `POST /api/versions/rollback` | `manifest-versions:<contentHash>` |

What this guarantees:

- Registering the same file twice at once returns one record (`201` then `200 exists`), never two.
- Two "start session" calls for the same file resume one session instead of opening two.
- Concurrent chunk-progress reports for one session are merged; none is lost.
- Two saves of a manifest produce consecutive version numbers, each with the right
  `previousVersionId`/`nextVersionId` links, and exactly one `isCurrentVersion`.
- A rollback and a save of the same manifest never interleave.

The locks are per server process. A multi-instance deployment must enforce the
same rules in the database (unique indexes, plus conditional updates on a revision).

## Conditional writes (`If-Match`)

Without `If-Match`, writes are applied in arrival order (last write wins, but
serialized). Send `If-Match` to reject a write based on stale data.

### Upload sessions

`GET` and `PATCH /api/uploads/sessions/:id` return an `ETag` for the session's full
stored state. Send it back as `If-Match` on the next `PATCH`:

```
PATCH /api/uploads/sessions/3b7e…
If-Match: "9f2c41…"
{ "action": "complete", "uploadId": "…" }
```

If the session changed in between, the response is:

```
409 Conflict
ETag: "<current>"
{ "status": "conflict", "message": "This upload session changed since you last read it…", "data": { …current session… } }
```

### Manifest versions

The current version's id is the manifest's ETag. `GET /api/versions?contentHash=…`,
`POST /api/versions` and `POST /api/versions/rollback` return `ETag: "<version id>"`.

```
POST /api/versions
If-Match: "version_5d0e…"
{ "contentHash": "…", "manifestHash": "…", "changeLog": "Fix capture date" }
```

If another save landed first, the response is `409` with
`{ "success": false, "error": "This manifest changed since you last read it; the current version is …", "data": <current version> }`
and the current `ETag`. Re-read, reapply the change, and retry with the new tag.
`If-Match: *` means "only if the manifest already has a version".

## Client guidance

1. Read the record and keep its `ETag`.
2. Send it as `If-Match` on the write.
3. On `409`, show or merge the `data` from the response, then retry with its `ETag`.
   Don't retry blindly with the old tag. It will keep failing.
