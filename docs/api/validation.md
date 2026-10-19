# Server-side validation

All request validation is built from one set of shared rules, so a wallet address, a hash or a text limit is checked the same way in the browser and on every endpoint.

## Where the rules live

| Module | Contents |
|--------|----------|
| `packages/shared/validation/fields.ts` | Field rules: `textField`, `stellarAddressField`, `sha256Field`, `enumField`, `integerField`, `stringListField`, `rejectUnknownFields`, `requireObject`, `toValidationResult` |
| `packages/shared/validation/stellar.ts` | Stellar StrKey public key check, including the checksum |
| `packages/shared/validation/hash.ts` | SHA-256 normalization and checks |
| `packages/shared/validation/manifest.ts` | `validateManifest` |
| `packages/shared/validation/upload.ts` | `validateUploadMetadata` and `checkFileFields` |
| `packages/shared/validation/uploadSession.ts` | Resumable upload session start and update |
| `packages/shared/validation/profile.ts` | `validateUserProfile` (wallet address, display name, bio, email, website) |
| `packages/shared/validation/pagination.ts` | Pagination query parameters |
| `frontend/lib/server/validators.ts` | Route request validators for disputes, the moderation queue and certificate regeneration |
| `frontend/lib/server/http.ts` | `validationError`, `readValidated`, `readPagination`, `legacyValidationError` |

## Error format

Every validator returns `ValidationResult<T>`, which is either `{ ok: true, value }` with normalized input or `{ ok: false, errors }`. Each error has this shape:

```json
{ "field": "manifest.creator", "message": "The key checksum is invalid.", "hint": "The address may contain a typo. Copy it again from your wallet." }
```

`field` is a dotted path into the request body. Array items use their index, for example `evidence.0.type`. `hint` is optional.

Routes using the `{ status }` envelope return **422**:

```json
{ "status": "validation_error", "message": "The request is invalid. See `errors` for details.", "errors": [ … ] }
```

Older routes using the `{ success }` envelope return **400** with the same `errors` list:

```json
{ "success": false, "error": "contentHash: Hash is empty.", "errors": [ … ] }
```

## Shared rules

| Input | Rule | Normalized to |
|-------|------|---------------|
| Stellar address | `G…`, 56 chars, valid base32 and CRC16 checksum. Secret keys (`S…`) get a dedicated warning | Trimmed, uppercase |
| SHA-256 hash | 64 hex chars. `0x` and `sha256:` prefixes and whitespace are accepted | Lowercase hex |
| Text | Optional `minLength`, `maxLength`, `singleLine` (rejects control characters), `pattern` | Trimmed. An empty optional value becomes absent |
| Enum | Must be one of the listed values. The hint lists them | Unchanged |
| Integer | Whole number with optional `min` and `max` | Unchanged |
| String list | Array of strings with optional `maxItems`, `itemMaxLength`, `lowercase`, `unique` | Trimmed, empty items dropped |
| Unknown fields | Rejected wherever a validator calls `rejectUnknownFields` | |

## Writing a validator

```ts
import { requireObject, rejectUnknownFields, sha256Field, stellarAddressField, textField, toValidationResult } from "@stellarveriphy/shared";

export function validateThing(input: unknown) {
  const body = requireObject(input);
  if (!body.ok) return body;
  const errors: FieldError[] = [];
  rejectUnknownFields(body.value, ["owner", "contentHash", "note"], errors);
  const owner = stellarAddressField(body.value, "owner", { required: true }, errors);
  const contentHash = sha256Field(body.value, "contentHash", { required: true }, errors);
  const note = textField(body.value, "note", { maxLength: 500 }, errors);
  return toValidationResult(errors, () => ({ owner: owner!, contentHash: contentHash!, note }));
}
```

In a route:

```ts
const parsed = await readValidated(req, validateThing);   // 415 / 400 / 422 handled
if ("response" in parsed) return parsed.response;
```

Do not write new regexes for wallet addresses or hashes. A regex such as `/^G[A-Z2-7]{55}$/` accepts addresses with a typo, because it skips the checksum.
