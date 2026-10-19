# Content Manifest Schema Documentation

This document defines the Stellar Veriphy content manifest contract used by verification services and contract-facing clients.

## Schema Definitions

- `content-manifest.schema.v1.json`: baseline schema for existing manifests.
- `content-manifest.schema.v2.json`: current schema with explicit `schemaVersion` and media metadata.

Both schemas use JSON Schema Draft 2020-12 and set `additionalProperties: false` to reject malformed requests.

## Field Documentation

### Top-level fields

- `schemaVersion` (`string`, optional in v1, required in v2): semantic schema version, e.g. `2.0.0`.
- `contentHash` (`string`, required): SHA-256 hash in 64-char hexadecimal format.
- `creator` (`string`, required): Stellar public key in `G...` base32 format.
- `timestamp` (`string`, required): ISO 8601 UTC timestamp (`date-time` format).
- `metadata` (`object`, optional): descriptive capture metadata.
- `media` (`object`, optional in v2): media validation metadata used for abuse prevention and sanity checks.

### `metadata` fields

- `device` (`string`, optional): capture device; 1-256 chars.
- `location` (`string`, optional): location descriptor; 1-256 chars.
- `aiModel` (`string`, optional): model attribution; 1-256 chars.

### `media` fields (v2)

- `fileName` (`string`, optional): original filename; 1-128 chars.
- `fileType` (`string`, optional): MIME type allowlist:
  - `image/jpeg`, `image/png`, `image/webp`, `image/gif`
  - `video/mp4`, `video/webm`
  - `audio/mpeg`, `audio/wav`
- `fileSizeBytes` (`integer`, optional): must be `1..104857600` (100 MB max).

## Required vs Optional

### v1 (`content-manifest.schema.v1.json`)

- Required: `contentHash`, `creator`, `timestamp`
- Optional: `schemaVersion`, `metadata`

### v2 (`content-manifest.schema.v2.json`)

- Required: `schemaVersion`, `contentHash`, `creator`, `timestamp`
- Optional: `metadata`, `media`

## Validation Rules

- Reject unknown top-level fields and unknown nested fields.
- `contentHash` must match `^[a-fA-F0-9]{64}$`.
- `creator` must match `^G[A-Z2-7]{55}$`.
- `timestamp` must be a valid ISO 8601 date-time.
- String fields are length-limited and sanitized before downstream processing (see [Sanitization](#sanitization)).
- Media type and file size are validated for anti-abuse and malformed payload protection.

## Sanitization

Every manifest goes through `findUnsafeManifestContent` (`packages/shared/validation/manifestSanitize.ts`) before any field is read. Both `validateManifest` and `validateManifestSchema` call it first, and `parseManifestJson` runs it on raw upload bodies. If any check fails, the manifest is rejected straight away. The response has one error per offending field, with a dotted `field` path (e.g. `manifest.metadata.device`), a `message`, and usually a `hint`.

| Check | Rejected input | Message |
| --- | --- | --- |
| Body size | Raw JSON over 16 KB | `Manifest is too large (N bytes; at most 16384).` |
| JSON syntax | Unparseable body | `Manifest is not valid JSON: <parser message>` |
| Structure | Nesting deeper than 4 levels, more than 64 keys, non-plain objects | `Nested too deeply …`, `Manifest has too many fields …`, `Must be plain JSON data.` |
| Prototype keys | `__proto__`, `constructor`, `prototype` | `Field name "__proto__" is not allowed.` |
| String length | Any string over 1024 characters (field limits are stricter) | `Text is too long …` |
| Unicode | Unpaired surrogates | `Contains invalid Unicode.` |
| Control characters | U+0000–U+001F, U+007F–U+009F | `Contains control characters.` |
| Bidi controls | U+202A–U+202E, U+2066–U+2069, U+200E/F, U+061C | `Contains text direction control characters.` |
| Invisible characters | Zero-width spaces/joiners, U+2060, BOM, soft hyphen | `Contains invisible characters.` |
| Markup | HTML tags (`<b`, `</`, `<!`) and character entities (`&lt;`, `&#60;`) | `Contains HTML markup or character entities.` |
| Script | `javascript:` / `vbscript:` / `data:<mime>` URLs, `on…=` handlers | `Contains script content.` |
| File paths | `media.fileName` with `/`, `\`, `..` or a drive letter | `File name must not contain a path.` |

Unsafe content is rejected, never silently stripped. Stored manifests are therefore exactly what the client signed and what the schema describes. Field names are checked as well as values.

## Example Manifests

- v1 example: `examples.manifest.v1.json`
- v2 example: `examples.manifest.v2.json`

## Schema Versioning Guide

- Use semantic versions in `schemaVersion`.
- Backward-compatible changes (adding optional fields) increment **minor** version.
- Breaking changes (new required fields, field removals, stricter constraints) increment **major** version.
- Consumers should:
  1. Read `schemaVersion`.
  2. Validate against matching schema.
  3. Reject unknown/unsupported major versions.

## Migration Guide

### v1 -> v2 (`1.0.0` to `2.0.0`)

1. Add required field: `"schemaVersion": "2.0.0"`.
2. Keep existing `contentHash`, `creator`, `timestamp`, and `metadata` unchanged.
3. Optionally add `media.fileName`, `media.fileType`, `media.fileSizeBytes` for stronger verification service controls.
4. Validate resulting payload against `content-manifest.schema.v2.json`.

### Suggested migration strategy in services

1. Introduce dual-validation period (accept v1 and v2).
2. Emit deprecation warning for v1 payloads.
3. Migrate SDK/UI generators to default to v2.
4. Sunset v1 support after agreed cutover date.
