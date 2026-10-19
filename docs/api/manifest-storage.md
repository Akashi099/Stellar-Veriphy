# Manifest storage API

A manifest is the signed description of a piece of content: its file hash, its creator, when it was captured, and optional capture details. This page explains how a manifest is created, validated, stored and retrieved.

Source of truth:

- Validation: `packages/shared/validation/manifest.ts` (`validateManifest`). The upload form and the server use the same function.
- Hashing: `packages/shared/utils/digest.ts` (`canonicalJson`, `hashManifest`).
- Storage: `frontend/lib/server/uploads.ts`. Manifests are stored inside upload records.
- Routes: `frontend/app/api/uploads/`, `frontend/app/api/jobs/`, `frontend/app/api/versions/`.

## Authentication

**None of these endpoints require authentication today.** No route checks a session, wallet signature or API token. The `creator` field is accepted as given, and the API checks only that it is a valid Stellar public key and that it matches the manifest's `creator`.

API tokens (`/api/tokens`) can be issued, but these routes do not check them yet. Ownership is enforced only on-chain, when a certificate is minted. Update this section when request signing or token checks are added.

## Manifest format

```json
{
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  "timestamp": "2026-09-01T18:42:00Z",
  "metadata": { "device": "Pixel 9", "location": "Lagos, NG", "aiModel": "none" }
}
```

| Field | Required | Rules | Stored as |
|-------|----------|-------|-----------|
| `contentHash` | yes | SHA-256 of the raw file bytes. `0x`, `sha256:` and whitespace are accepted | 64 lowercase hex chars |
| `creator` | yes | Stellar public key with a valid checksum. Secret keys are rejected | Uppercase `G…` |
| `timestamp` | yes | ISO 8601 with a timezone. At most 5 minutes in the future (clock-skew allowance) | UTC `YYYY-MM-DDTHH:mm:ss.sssZ` |
| `metadata` | no | Only `device`, `location` or `aiModel`. Each is a string of at most 200 chars with no control characters. If `metadata` is present, at least one value must be non-empty | Trimmed. Empty values are dropped |

Any other key is rejected, both at the top level and inside `metadata`. Keys are stored in a fixed order: `contentHash`, `creator`, `timestamp`, `metadata`.

### Manifest hash

`manifestHash = sha256(canonicalJson(manifest))`, where canonical JSON sorts object keys, leaves out `undefined` values and has no whitespace. Equal manifests always have the same hash. This is the value anchored on-chain as `manifest_hash`.

Example. For the manifest above (without `aiModel`), the hashed string is:

```
{"contentHash":"9f86…0a08","creator":"GBRP…OX2H","metadata":{"device":"Pixel 9","location":"Lagos, NG"},"timestamp":"2026-09-01T18:42:00.000Z"}
```

## Creating a manifest: `POST /api/uploads`

A manifest is always submitted inside upload metadata. See [upload-metadata.md](./upload-metadata.md) for the upload fields.

```http
POST /api/uploads
Content-Type: application/json

{
  "fileName": "sunset.jpg",
  "mimeType": "image/jpeg",
  "fileSize": 482113,
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
  "manifest": {
    "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
    "timestamp": "2026-09-01T18:42:00Z",
    "metadata": { "device": "Pixel 9" }
  }
}
```

The manifest must describe this upload:

- `manifest.contentHash` must equal the upload's `contentHash`.
- `manifest.creator` must equal the upload's `creator`.

**201 Created:** a new record was stored.

```json
{
  "status": "created",
  "data": {
    "id": "3b7e0f6e-0c1e-4f3a-9a53-2f1d5e8d9c11",
    "createdAt": "2026-09-01T18:43:10.512Z",
    "manifestHash": "c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51a",
    "fileName": "sunset.jpg",
    "mimeType": "image/jpeg",
    "fileSize": 482113,
    "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
    "tags": [],
    "manifest": {
      "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "creator": "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H",
      "timestamp": "2026-09-01T18:42:00.000Z",
      "metadata": { "device": "Pixel 9" }
    }
  }
}
```

(The `manifestHash` above is illustrative.)

**200 OK, `status: "exists"`:** the same `contentHash` was already registered by the same `creator`. The **existing** record is returned unchanged, including its original manifest and `manifestHash`. A second submission never overwrites a stored manifest.

## Validation errors

Validation failures return **422** with `status: "validation_error"`. Every problem is listed, not just the first.

```json
{
  "status": "validation_error",
  "message": "Upload metadata is invalid. See `errors` for details.",
  "errors": [
    { "field": "manifest.timestamp", "message": "Timestamp is in the future.", "hint": "Use the time the content was created, or check your device clock." },
    { "field": "manifest.metadata.camera", "message": "Unknown metadata field \"camera\".", "hint": "Allowed metadata: device, location, aiModel." }
  ]
}
```

Manifest errors:

| `field` | `message` | Cause |
|---------|-----------|-------|
| `manifest` | Manifest is empty. | Missing, `null` or `{}` |
| `manifest` | Manifest is malformed. | Not a JSON object |
| `manifest.<key>` | Unknown field "…". | Key other than `contentHash`, `creator`, `timestamp` or `metadata` |
| `manifest.contentHash` | Content hash is required. | Missing or empty |
| `manifest.contentHash` | Hash contains characters other than 0–9 and a–f. / SHA-256 hashes are 64 characters long (got N). | Not a SHA-256 hex digest. The hint points out SHA-1 and MD5 lengths |
| `manifest.contentHash` | The manifest content hash does not match the file hash. | Differs from the upload `contentHash` |
| `manifest.creator` | Creator public key is required. | Missing or empty |
| `manifest.creator` | This looks like a Stellar secret key. | Starts with `S` |
| `manifest.creator` | Stellar public keys start with "G". / … are 56 characters long … / The key checksum is invalid. | Malformed address |
| `manifest.creator` | The manifest creator does not match the uploader. | Differs from the upload `creator` |
| `manifest.timestamp` | Timestamp is required. | Missing or empty |
| `manifest.timestamp` | Timestamp is not a valid ISO 8601 date-time. | Wrong format or missing timezone |
| `manifest.timestamp` | Timestamp is not a real date. | For example, month 13 |
| `manifest.timestamp` | Timestamp is in the future. | More than 5 minutes ahead of server time |
| `manifest.metadata` | Metadata must be an object. | Wrong type |
| `manifest.metadata` | Metadata is present but has no values. | Every value is empty |
| `manifest.metadata.<key>` | Unknown metadata field "…". / Must be text. / Must be at most 200 characters. / Contains control characters. | Bad metadata entry |

Request-level errors:

| HTTP | `status` | Cause |
|------|----------|-------|
| 400 | `invalid_json` | The body is not valid JSON |
| 415 | `unsupported_media_type` | `Content-Type` is not `application/json` |
| 500 | `server_error` | Storage failure. Safe to retry: a retry of a stored upload returns `exists` |

## Retrieving manifests

### `GET /api/uploads/:id`

Returns one `UploadRecord` with its `manifest` and `manifestHash`.

```json
{ "status": "ok", "data": { "id": "3b7e…", "manifestHash": "c053…", "manifest": { … }, … } }
```

Returns `404` with `{ "status": "not_found", "message": "No upload exists with this ID." }` when the ID is unknown.

### `GET /api/uploads?contentHash=<sha256>`

Returns every record for a file hash, which can include several creators. The hash is normalized before lookup. The list is paginated (see [pagination.md](./pagination.md)).

```json
{
  "status": "ok",
  "data": [ { "id": "3b7e…", "creator": "GBRP…", "manifestHash": "c053…", "manifest": { … } } ],
  "pagination": { "total": 1, "page": 1, "pageSize": 20, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false, "nextCursor": null, "previousCursor": null }
}
```

| HTTP | Cause |
|------|-------|
| 422 | `contentHash` is missing or is not a SHA-256 hash, or the pagination parameters are invalid |

### Verification re-check: `POST /api/jobs`, `GET /api/jobs/:id`

A verification job reloads the stored upload and runs `validateUploadMetadata` again with the current rules. It then recomputes `hashManifest(manifest)` and compares it with the stored `manifestHash`. The job fails with one of these `error` messages:

- `Upload metadata failed validation: <field>: <message>; …` if the rules have since become stricter.
- `The stored manifest hash does not match the manifest contents.` if the stored record was changed.

When the job succeeds, `result.manifestHash` holds the verified hash.

### Manifest versions: `/api/versions`

Version records link a `contentHash` to successive `manifestHash` values. They do not store manifest bodies.

| Endpoint | Purpose |
|----------|---------|
| `POST /api/versions` `{ contentHash, manifestHash, changeLog? }` | Adds a new current version. Both hashes must be SHA-256 hex. `changeLog` is at most 2000 chars. Unknown fields are rejected |
| `GET /api/versions?contentHash=…` | Lists versions (paginated) |
| `GET /api/versions/:versionId` | Returns one version |
| `GET /api/versions/history/:contentHash` | Returns the full history, newest first, or 404 if there is none |
| `GET /api/versions/compare?versionA=…&versionB=…` | Compares two versions |
| `POST /api/versions/rollback` | Makes an earlier version current. Returns 409 if it is already current |

These routes use the older `{ success, data | error }` envelope. Validation failures return **400** with an `errors` list in the same format as above. Version records are kept in memory and are lost on restart.

## Storage notes

- Upload records, and the manifests in them, are stored as JSON in `frontend/.data/uploads.json`, or under `VERIPHY_DATA_DIR`. Writes are atomic (temp file + rename) and serialized.
- Records cannot be changed through the API. There is no update or delete endpoint for manifests.
- To change a manifest, register a new version, or regenerate the certificate (`POST /api/certificates/regenerate` with `newManifestHash`).
