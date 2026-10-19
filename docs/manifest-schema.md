# Content Manifest Schema

Addresses issue #396.

The content manifest is the piece of JSON metadata attached to every asset submitted to StellarVeriphy. It describes what the content is, who created it, and how it was captured, and it is hashed to produce `manifestHash`, the value that gets embedded on-chain in a `ProvenanceCert` (see [`packages/shared/types/index.ts`](../packages/shared/types/index.ts) and [`contracts/provenance/src/lib.rs`](../contracts/provenance/src/lib.rs)).

## 1. JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://stellarveriphy.dev/schemas/manifest/1.0.0.json",
  "title": "StellarVeriphy Content Manifest",
  "type": "object",
  "required": ["schemaVersion", "contentHash", "creator", "timestamp"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": {
      "type": "string",
      "description": "Semantic version of this manifest schema.",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "examples": ["1.0.0"]
    },
    "contentHash": {
      "type": "string",
      "description": "SHA-256 digest of the raw media file, prefixed with the algorithm name.",
      "pattern": "^[a-fA-F0-9]{64}$",
      "examples": ["9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"]
    },
    "creator": {
      "type": "string",
      "description": "Stellar public key (G...) of the account that created/uploaded the content.",
      "pattern": "^G[A-Z2-7]{55}$"
    },
    "timestamp": {
      "type": "string",
      "description": "ISO 8601 UTC timestamp of when the manifest was generated.",
      "format": "date-time"
    },
    "metadata": {
      "type": "object",
      "description": "Optional, freeform capture context. All fields are optional and may be extended by clients.",
      "additionalProperties": true,
      "properties": {
        "device": {
          "type": "string",
          "description": "Capture device or software identifier.",
          "examples": ["Camera Model X", "iPhone 15 Pro"]
        },
        "location": {
          "type": "string",
          "description": "Capture location as \"lat,long\" decimal degrees.",
          "pattern": "^-?\\d{1,3}(\\.\\d+)?,-?\\d{1,3}(\\.\\d+)?$",
          "examples": ["40.7128,-74.0060"]
        },
        "aiModel": {
          "type": "string",
          "description": "Name/version of the generative model used, or \"None\" for organic capture.",
          "examples": ["None", "stable-diffusion-3.5"]
        }
      }
    }
  }
}
```

## 2. Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | string | yes | Semver of the manifest schema this document conforms to. See [Versioning](#4-schema-versioning). |
| `contentHash` | string | yes | 64-character hex SHA-256 digest of the raw media bytes, without a `sha256:` prefix. Computed with [`buildManifestHash`](../packages/shared/utils/hash.ts) style hashing — hash the file, not the manifest, for this field. |
| `creator` | string | yes | Stellar `G...` public key identifying the submitting account. Must pass StrKey validation. |
| `timestamp` | string | yes | ISO 8601 UTC datetime the manifest was assembled (not necessarily when the media was captured). |
| `metadata` | object | no | Freeform capture context. Unknown keys are permitted so clients can attach extra context without a schema bump. |
| `metadata.device` | string | no | Human-readable capture device/software name. |
| `metadata.location` | string | no | `"lat,long"` decimal-degree pair. |
| `metadata.aiModel` | string | no | Generative model identifier, or the literal string `"None"` for non-AI content. |

## 3. Validation Rules

- **`contentHash`** must match `^[a-fA-F0-9]{64}$` (bare hex). Input that carries a `sha256:` prefix is normalised before validation, but the stored value is bare hex. Reject manifests where the recomputed hash of the submitted file doesn't match this field — that mismatch is exactly what the manifest is meant to prevent.
- **`creator`** must be a valid Stellar ed25519 public key (StrKey `G...`, 56 characters). Validate with the Stellar SDK's `StrKey.isValidEd25519PublicKey()` rather than the regex alone, since the regex only checks shape, not checksum.
- **`timestamp`** must be a valid ISO 8601 date-time and should not be in the future relative to server receipt time (allow small clock-skew tolerance, e.g. ±5 minutes).
- **`metadata`** is optional and accepts only `device`, `location` and `aiModel`, each 1–256 characters (`additionalProperties: false` in the published v1 and v2 schemas). Adding a field needs a schema version bump.
- Manifests are hashed for on-chain storage via `sha256(JSON.stringify(manifest))` (see [`buildManifestHash`](../packages/shared/utils/hash.ts)). Because `JSON.stringify` key ordering affects the hash, producers **must** serialize manifest keys in the order they appear in this schema's `properties` block so independent implementations reproduce the same `manifestHash`.

- **Enforcement.** `validateUploadMetadata` (in `packages/shared/validation/upload.ts`) runs `validateManifestSchema(manifest, "v1")` on the normalised manifest before anything is stored. The check is strict, so a manifest that passes it matches the published schema exactly. See [`packages/shared/validation/manifestSchema.ts`](../packages/shared/validation/manifestSchema.ts).

## 4. Schema Versioning

- The schema is versioned independently of the app, using semver, and every manifest carries its own `schemaVersion`.
- **Patch** (`1.0.x`): documentation/description fixes only, no wire-format change.
- **Minor** (`1.x.0`): additive, backward-compatible changes — e.g. a new optional field under `metadata`. Old manifests remain valid; validators must not require the new field.
- **Major** (`x.0.0`): breaking changes — a required field added/removed/renamed, or a type/pattern change to an existing field. Verifiers must support the manifest's declared `schemaVersion` explicitly; do not assume forward compatibility across major versions.
- Contracts and the verification pipeline should reject manifests whose `schemaVersion` major component they don't recognize, rather than attempting best-effort parsing.

## 5. Example Manifests

Minimal (no optional metadata):

```json
{
  "schemaVersion": "1.0.0",
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "creator": "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXY2",
  "timestamp": "2026-03-15T17:00:00Z"
}
```

Full example (photo capture):

```json
{
  "schemaVersion": "1.0.0",
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "creator": "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXY2",
  "timestamp": "2026-03-15T17:00:00Z",
  "metadata": {
    "device": "Camera Model X",
    "location": "40.7128,-74.0060",
    "aiModel": "None"
  }
}
```

AI-generated content example:

```json
{
  "schemaVersion": "1.0.0",
  "contentHash": "3b5d5c3712955042212316173ccf37be9b6d3e17e3b96f8f2e3b1a6ef2f4c5d",
  "creator": "GZYXWVUTSRQPONMLKJIHGFEDCBA234567ZYXWVUTSRQPONMLKJIHGFE234",
  "timestamp": "2026-03-15T18:22:41Z",
  "metadata": {
    "device": "StellarVeriphy Web Uploader",
    "aiModel": "stable-diffusion-3.5"
  }
}
```
