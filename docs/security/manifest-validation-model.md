# Manifest Integrity Schema Validation

> **⚠ WARNING: Implementation Pending**
> This document describes the target validation model. Some items described here extend
> the existing implementation; others do not yet exist.
> Closes #681.

This document describes the formal validation model for content manifest payloads in
StellarVeriphy, including schema conformance rules, edge case handling, malicious payload
rejection, and the relationship between off-chain validation and on-chain contract
expectations.

---

## 1. Overview

A **content manifest** is the structured JSON payload that binds a digital asset to its
claimed origin. It is the primary data object that traverses the full verification pipeline:

```
Creator (browser)
  │  builds manifest
  ▼
packages/shared/validation/manifest.ts    ← validateManifest()
  │  validates and normalizes
  ▼
frontend/app/api/uploads/route.ts         ← POST /api/uploads
  │  re-validates at API boundary
  ▼
Verification job queue
  │
  ▼
TEE oracle (manifest_hash verified against stored hash)
  │
  ▼
contracts/oracle.verify_attestation()
  │  receives attestation with manifest_hash bound inside it
  ▼
contracts/provenance.mint()
  stores manifest_hash on-chain
```

Validation failures at any stage propagate differently — early rejection (client or API)
is always preferable to a failed on-chain transaction.

---

## 2. Schema Definition

The canonical manifest type is defined in `packages/shared/types/index.ts`:

```typescript
interface ContentManifest {
  contentHash: string; // Required. SHA-256 of the media file, lowercase hex or "sha256:<hex>"
  creator: string; // Required. Stellar public key starting with "G"
  timestamp: string; // Required. ISO 8601 date-time with timezone
  schemaVersion?: string; // Optional. Semantic version string, e.g. "2.0.0"
  metadata?: {
    device?: string; // e.g. "iPhone 16 Pro"
    location?: string; // e.g. "37.7749,-122.4194"
    aiModel?: string; // e.g. "None" or "Stable Diffusion XL"
    [key: string]: string | undefined;
  };
  media?: {
    fileName?: string;
    fileType?: string; // MIME type
    fileSizeBytes?: number;
  };
}
```

Only the fields defined above are allowed. Unknown top-level fields are rejected as an
error (not silently dropped) to prevent schema drift from going undetected.

---

## 3. Validation Rules

The canonical validator is `packages/shared/validation/manifest.ts::validateManifest()`.
This section documents every rule enforced by that function plus rules that must be added
to complete the conformance set.

### 3.1 Structural Rules

| Rule                                          | Behavior                                          | Status         |
| --------------------------------------------- | ------------------------------------------------- | -------------- |
| Null, undefined, or empty object              | Rejected with `"Manifest is empty."`              | ✅ Implemented |
| Non-object input (e.g. string, array, number) | Rejected with `"Manifest is malformed."`          | ✅ Implemented |
| Unknown top-level fields                      | Each unknown field adds an error                  | ✅ Implemented |
| Deeply nested objects in top-level fields     | Treated as unknown type (rejected by type checks) | ✅ Implemented |

### 3.2 `contentHash` Rules

| Rule                                                  | Behavior                                        | Status         |
| ----------------------------------------------------- | ----------------------------------------------- | -------------- |
| Missing or empty string                               | `"Content hash is required."`                   | ✅ Implemented |
| Non-string type                                       | `"Content hash must be a string."`              | ✅ Implemented |
| Accepts `sha256:<hex>` prefix                         | Normalizes via `normalizeHash()`, strips prefix | ✅ Implemented |
| Rejects hex string of wrong length (not 64 hex chars) | Error from `checkSha256Hex()`                   | ✅ Implemented |
| Rejects non-hex characters                            | Error from `checkSha256Hex()`                   | ✅ Implemented |
| Rejects all-zero hash (`000...0`)                     | Not yet rejected — **gap: add explicit check**  | ❌ Missing     |
| Accepts both upper and lowercase hex                  | Normalizes to lowercase                         | ✅ Implemented |

**Gap to close:** An all-zeros hash (`0000...0000`) is technically valid hex but almost
certainly indicates a placeholder or a bug in the hashing step. The validator should
reject it with a clear message: `"Content hash must not be all zeros — ensure the file was
hashed correctly."` Add this check in `checkSha256Hex()` in
`packages/shared/validation/hash.ts`.

### 3.3 `creator` Rules

| Rule                              | Behavior                             | Status         |
| --------------------------------- | ------------------------------------ | -------------- |
| Missing or empty string           | `"Creator public key is required."`  | ✅ Implemented |
| Non-string type                   | `"Creator must be a string."`        | ✅ Implemented |
| Invalid Stellar public key format | Error from `checkStellarPublicKey()` | ✅ Implemented |
| Case normalization                | Normalized to uppercase              | ✅ Implemented |
| Whitespace trimmed                | Yes                                  | ✅ Implemented |

### 3.4 `timestamp` Rules

| Rule                                                   | Behavior                                         | Status         |
| ------------------------------------------------------ | ------------------------------------------------ | -------------- |
| Missing or empty string                                | `"Timestamp is required."`                       | ✅ Implemented |
| Invalid ISO 8601 format                                | `"Timestamp is not a valid ISO 8601 date-time."` | ✅ Implemented |
| Unparseable date                                       | `"Timestamp is not a real date."`                | ✅ Implemented |
| Future timestamp (beyond `maxClockSkewMs` = 5 minutes) | `"Timestamp is in the future."`                  | ✅ Implemented |
| Timestamps far in the past (pre-2000)                  | Not currently rejected — **gap**                 | ❌ Missing     |
| Timezone required                                      | The ISO 8601 regex requires `Z` or `±HH:MM`      | ✅ Implemented |

**Gap to close:** A timestamp before January 1 2000 almost certainly indicates a bad input
(a Unix epoch of 0, a misformatted field, or a test value). Add a minimum-date check:
reject timestamps before `2000-01-01T00:00:00Z` with `"Timestamp is implausibly old."`.

### 3.5 `metadata` Rules

| Rule                                                   | Behavior                                                                  | Status         |
| ------------------------------------------------------ | ------------------------------------------------------------------------- | -------------- |
| Optional field — omitted is valid                      | OK                                                                        | ✅ Implemented |
| Non-object metadata                                    | `"Metadata must be an object."`                                           | ✅ Implemented |
| Unknown metadata sub-fields                            | Each unknown field adds an error                                          | ✅ Implemented |
| Non-string metadata values                             | `"Must be text."`                                                         | ✅ Implemented |
| Empty metadata object (all values empty or undefined)  | `"Metadata is present but has no values."`                                | ✅ Implemented |
| Field exceeds `metadataFieldMaxLength` (200 chars)     | `"Must be at most 200 characters."`                                       | ✅ Implemented |
| Control characters in metadata values                  | `"Contains control characters."`                                          | ✅ Implemented |
| Metadata values containing only whitespace             | Trimmed and treated as empty (skipped)                                    | ✅ Implemented |
| `aiModel` field injection attempt (e.g. JSON in field) | Treated as opaque string; control-char check catches embedded line breaks | ✅ (partial)   |

**Gap to close:** The `aiModel` field accepts arbitrary strings up to 200 characters. A
reasonable allowlist of known AI model names or a stricter pattern would reduce the
injection surface for displaying this value in UI. This is a low-priority hardening item.

### 3.6 `schemaVersion` Rules

| Rule                              | Behavior                          | Status                                 |
| --------------------------------- | --------------------------------- | -------------------------------------- |
| Optional field — omitted is valid | OK                                | ✅ Implemented (field exists in types) |
| Validated as semver string        | Not currently validated — **gap** | ❌ Missing                             |

**Gap to close:** If `schemaVersion` is present, it should match a valid semantic version
pattern: `/^\d+\.\d+\.\d+$/`. Add this check to the validator.

### 3.7 `media` Rules

| Rule                                       | Behavior                          | Status                      |
| ------------------------------------------ | --------------------------------- | --------------------------- |
| Optional field                             | OK                                | Type defined, not validated |
| `fileName` is a string, no path separators | Not currently validated — **gap** | ❌ Missing                  |
| `fileType` matches MIME type format        | Not currently validated — **gap** | ❌ Missing                  |
| `fileSizeBytes` is a non-negative integer  | Not currently validated — **gap** | ❌ Missing                  |

**Gap to close:** The `media` object is currently typed but not validated. Add a
`validateMediaBlock()` helper and call it from `validateManifest()`.

---

## 4. Malicious Payload Handling

The following payload categories have been identified as potentially dangerous and their
handling is documented here:

### 4.1 Prototype Pollution

**Threat:** `{ "__proto__": { "admin": true } }` or `{ "constructor": { "prototype": {} } }`
passed as the manifest object.

**Mitigation:** The `isPlainObject()` check in `packages/shared/validation/result.ts` uses
`Object.prototype.toString.call(input) === "[object Object]"` and checks that the prototype
is `Object.prototype`. This blocks prototype-polluted objects.

**Status:** ✅ Mitigated by `isPlainObject()`.

### 4.2 Deeply Nested Payloads (Zip Bomb Equivalent)

**Threat:** `{ "contentHash": { "nested": { "deeply": ... } } }` — arbitrarily deep
nesting causes stack overflow or excessive CPU during traversal.

**Mitigation:** The validator only reads known top-level fields and their expected
subtypes. Unknown types at a known field produce a type-check error rather than recursive
traversal. The `metadata` sub-object is traversed one level deep only.

**Status:** ✅ Mitigated by flat structural access pattern.

### 4.3 Oversized Payloads

**Threat:** A 100 MB JSON string submitted as a manifest payload exhausts memory.

**Mitigation (current):** The upload API endpoint (`app/api/uploads/route.ts`) should
enforce a maximum request body size. This is a server-side concern, not the validator's
responsibility.

**Status:** ❌ Gap — verify that the Next.js API route has `bodyParser.sizeLimit` configured
(or the equivalent in Next.js 15 route config). Suggested limit: 64 KB for manifests.

### 4.4 Unicode Normalization Attacks

**Threat:** Two visually identical strings with different Unicode codepoints (e.g. using
homoglyph characters) could produce different hashes, allowing a forged manifest to appear
valid to human reviewers.

**Mitigation (current):** The validator trims whitespace and normalizes the `creator` field
to uppercase. It does not currently normalize Unicode.

**Status:** ❌ Gap — apply `value.normalize("NFC")` before validating string fields. This
ensures canonical Unicode form and prevents homoglyph-based mismatches.

### 4.5 NaN / Infinity in Numeric Fields

**Threat:** JSON does not support `NaN` or `Infinity`, but JavaScript does. A crafted
payload using these via programmatic construction (not JSON.parse) could cause math errors
downstream.

**Mitigation:** The `media.fileSizeBytes` field should explicitly reject non-finite numbers.

**Status:** ❌ Gap — add `Number.isFinite(value)` check in the `media` block validator.

---

## 5. Validation at API Boundaries

The manifest validator must be called at two points:

1. **Client-side** (in the browser, before form submission): provides immediate user
   feedback. Implemented in `frontend/utils/manifestValidation.ts` (wraps `validateManifest`
   from `packages/shared`).

2. **Server-side** (in `app/api/uploads/route.ts`, before writing to storage): provides a
   hard enforcement boundary. A malformed manifest that bypasses the client-side check
   must be rejected at the API with a `400 Bad Request` response including the
   `ValidationResult.errors` array.

**Both validations must use the same `validateManifest` function from `packages/shared`.**
Duplicating validation logic in two places is the primary source of divergence bugs.

---

## 6. Contract Alignment

The on-chain contracts (`contracts/oracle`, `contracts/provenance`) receive a
`manifest_hash` — the SHA-256 of the canonical manifest JSON — not the manifest itself.
The validation model ensures contract alignment by:

1. Producing a **canonical manifest** — a deterministically ordered JSON object with fixed
   key ordering (`contentHash → creator → timestamp → metadata`). This canonical form is
   what gets hashed and what the on-chain hash refers to.

2. **Normalizing inputs** before returning them from `validateManifest()`:
   - `contentHash`: lowercase hex, `sha256:` prefix stripped.
   - `creator`: uppercase.
   - `timestamp`: re-serialized via `new Date(ms).toISOString()` for canonical form.

3. The `packages/shared/utils/hash.ts::computeManifestHash()` function must be the only
   point that serializes and hashes a manifest. Any other code that computes a manifest
   hash must call this function.

---

## 7. Documentation for Maintainers and Contributors

When adding new fields to `ContentManifest`:

1. Add the field to the type definition in `packages/shared/types/index.ts`.
2. Add the field to the `MANIFEST_FIELDS` constant in `packages/shared/validation/manifest.ts`.
3. Add validation rules (required/optional, type, bounds) to `validateManifest()`.
4. Update the manifest schema JSON files in `docs/manifest-schema/` with the new field.
5. Bump `schemaVersion` (once `schemaVersion` validation is implemented).
6. Add tests covering: valid input, missing required field, wrong type, boundary values,
   and one malicious-payload case for the new field.

When changing an existing field's validation rules:

1. Consider backward compatibility — is the change to a field that may already be stored
   in existing manifests? If so, the new rule must be applied only to new manifests
   (gated by `schemaVersion`) to avoid invalidating historical records.

---

## 8. Related Documents and Files

- [`packages/shared/validation/manifest.ts`](../../packages/shared/validation/manifest.ts) — canonical validator
- [`packages/shared/validation/hash.ts`](../../packages/shared/validation/hash.ts) — hash format checks
- [`packages/shared/validation/stellar.ts`](../../packages/shared/validation/stellar.ts) — Stellar key checks
- [`packages/shared/validation/result.ts`](../../packages/shared/validation/result.ts) — `ValidationResult`, `isPlainObject`
- [`packages/shared/types/index.ts`](../../packages/shared/types/index.ts) — `ContentManifest` type
- [`frontend/utils/manifestValidation.ts`](../../frontend/utils/manifestValidation.ts) — client-side validation wrapper
- [`docs/manifest-schema/README.md`](../manifest-schema/README.md) — JSON schema definitions
- [`docs/manifest-schema/content-manifest.schema.v2.json`](../manifest-schema/content-manifest.schema.v2.json) — current JSON Schema
