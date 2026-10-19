import { rejectUnknownFields } from "./fields";
import { findUnsafeManifestContent } from "./manifestSanitize";
import { FieldError, ValidationResult, isPlainObject } from "./result";
import { checkStellarPublicKey } from "./stellar";

// Strict check of a content manifest against the contract-facing JSON Schemas in
// docs/manifest-schema/ (content-manifest.schema.v1.json and .v2.json). Unlike
// validateManifest, this does not normalise: the value must already be in the
// canonical wire form, so what is stored is exactly what the schema describes.
//
// Rules follow docs/manifest-schema/README.md. Keep the two in sync.

export type ContentManifestSchemaVersion = "v1" | "v2";

export const MANIFEST_SCHEMA_VERSION_IDS: Record<ContentManifestSchemaVersion, string> = {
  v1: "1.0.0",
  v2: "2.0.0",
};

export const MANIFEST_SCHEMA_LIMITS = {
  metadataFieldMaxLength: 256,
  fileNameMaxLength: 128,
  maxMediaFileSizeBytes: 104857600, // 100 MB
};

export const MANIFEST_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
] as const;

const V1_FIELDS = ["schemaVersion", "contentHash", "creator", "timestamp", "metadata"] as const;
const V2_FIELDS = [...V1_FIELDS, "media"] as const;
const METADATA_FIELDS = ["device", "location", "aiModel"] as const;
const MEDIA_FIELDS = ["fileName", "fileType", "fileSizeBytes"] as const;

const CONTENT_HASH = /^[a-fA-F0-9]{64}$/;
const CREATOR = /^G[A-Z2-7]{55}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface ContentManifestDocument {
  schemaVersion?: string;
  contentHash: string;
  creator: string;
  timestamp: string;
  metadata?: Partial<Record<(typeof METADATA_FIELDS)[number], string>>;
  media?: {
    fileName?: string;
    fileType?: (typeof MANIFEST_MEDIA_TYPES)[number];
    fileSizeBytes?: number;
  };
}

export interface ManifestSchemaOptions {
  // Prefix for error field paths when the manifest is nested, e.g. "manifest".
  path?: string;
}

export function validateManifestSchema(
  input: unknown,
  version: ContentManifestSchemaVersion,
  options: ManifestSchemaOptions = {}
): ValidationResult<ContentManifestDocument> {
  const at = (field: string) => (options.path ? `${options.path}.${field}` : field);
  const root = options.path ?? "manifest";
  const errors: FieldError[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [
        {
          field: root,
          message: "Manifest must be a JSON object.",
          hint: "Send the manifest as an object, not a string or array.",
        },
      ],
    };
  }

  // Stored manifests must never carry unsafe content, so check it before the schema rules.
  const unsafe = findUnsafeManifestContent(input, { path: options.path });
  if (unsafe.length > 0) return { ok: false, errors: unsafe };

  const allowed = version === "v2" ? V2_FIELDS : V1_FIELDS;
  rejectUnknownFields(input, allowed, errors, options.path);

  // schemaVersion: v1 allows it to be omitted; v2 requires it.
  const expectedVersion = MANIFEST_SCHEMA_VERSION_IDS[version];
  if (input.schemaVersion === undefined) {
    if (version === "v2") {
      errors.push({
        field: at("schemaVersion"),
        message: "Schema version is required for v2 manifests.",
        hint: `Set schemaVersion to "${expectedVersion}".`,
      });
    }
  } else if (input.schemaVersion !== expectedVersion) {
    errors.push({
      field: at("schemaVersion"),
      message: `Schema version must be "${expectedVersion}" for ${version} manifests.`,
      hint: `Set schemaVersion to "${expectedVersion}", or remove it for a v1 manifest.`,
    });
  }

  // contentHash
  if (typeof input.contentHash !== "string") {
    errors.push({
      field: at("contentHash"),
      message: "Content hash is required.",
      hint: "Use the 64-character SHA-256 hex digest of the file.",
    });
  } else if (!CONTENT_HASH.test(input.contentHash)) {
    errors.push({
      field: at("contentHash"),
      message: "Content hash must be 64 hexadecimal characters.",
      hint: "Remove any 'sha256:' prefix or spaces. The digest is hex only, e.g. a3f5…123456.",
    });
  }

  // creator
  if (typeof input.creator !== "string") {
    errors.push({
      field: at("creator"),
      message: "Creator public key is required.",
      hint: "Enter the Stellar address (G…) that owns this content.",
    });
  } else if (!CREATOR.test(input.creator)) {
    errors.push({
      field: at("creator"),
      message: "Creator must be a Stellar public key: G followed by 55 characters A–Z or 2–7.",
      hint: "Copy the full address from your wallet. It starts with G and is 56 characters long.",
    });
  } else {
    const problem = checkStellarPublicKey(input.creator);
    if (problem) errors.push({ field: at("creator"), ...problem });
  }

  // timestamp
  if (typeof input.timestamp !== "string") {
    errors.push({
      field: at("timestamp"),
      message: "Timestamp is required.",
      hint: "Use an ISO 8601 date-time such as 2026-01-31T12:00:00Z.",
    });
  } else if (!DATE_TIME.test(input.timestamp) || !isRealCalendarDate(input.timestamp)) {
    errors.push({
      field: at("timestamp"),
      message: "Timestamp must be an ISO 8601 date-time with a timezone.",
      hint: "Include seconds and a timezone, e.g. 2026-01-31T12:00:00Z.",
    });
  }

  // metadata
  if (input.metadata !== undefined) {
    validateTextObject(input.metadata, at("metadata"), METADATA_FIELDS, errors);
  }

  // media (v2 only)
  if (version === "v2" && input.media !== undefined) {
    validateMedia(input.media, at("media"), errors);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as ContentManifestDocument };
}

// Date.parse rolls out-of-range days over (2026-02-31 becomes March), so check the calendar date directly.
function isRealCalendarDate(timestamp: string): boolean {
  const [year, month, day] = timestamp.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  if (Number.isNaN(Date.parse(timestamp))) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function validateTextObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
  errors: FieldError[]
): void {
  if (!isPlainObject(value)) {
    errors.push({
      field: path,
      message: "Metadata must be an object.",
      hint: `Allowed fields: ${allowed.join(", ")}.`,
    });
    return;
  }
  rejectUnknownFields(value, allowed, errors, path);
  for (const key of allowed) {
    const field = value[key];
    if (field === undefined) continue;
    const fieldPath = `${path}.${key}`;
    if (typeof field !== "string") {
      errors.push({ field: fieldPath, message: "Must be text." });
    } else if (field.length < 1 || field.length > MANIFEST_SCHEMA_LIMITS.metadataFieldMaxLength) {
      errors.push({
        field: fieldPath,
        message: `Must be 1 to ${MANIFEST_SCHEMA_LIMITS.metadataFieldMaxLength} characters.`,
        hint: "Remove the field instead of sending an empty value.",
      });
    }
  }
}

function validateMedia(value: unknown, path: string, errors: FieldError[]): void {
  if (!isPlainObject(value)) {
    errors.push({
      field: path,
      message: "Media must be an object.",
      hint: `Allowed fields: ${MEDIA_FIELDS.join(", ")}.`,
    });
    return;
  }
  rejectUnknownFields(value, MEDIA_FIELDS, errors, path);

  const { fileName, fileType, fileSizeBytes } = value;
  if (fileName !== undefined) {
    if (
      typeof fileName !== "string" ||
      fileName.length < 1 ||
      fileName.length > MANIFEST_SCHEMA_LIMITS.fileNameMaxLength
    ) {
      errors.push({
        field: `${path}.fileName`,
        message: `File name must be 1 to ${MANIFEST_SCHEMA_LIMITS.fileNameMaxLength} characters.`,
      });
    }
  }
  if (fileType !== undefined && !(MANIFEST_MEDIA_TYPES as readonly unknown[]).includes(fileType)) {
    errors.push({
      field: `${path}.fileType`,
      message: `Unsupported media type "${String(fileType)}".`,
      hint: `Use one of: ${MANIFEST_MEDIA_TYPES.join(", ")}.`,
    });
  }
  if (fileSizeBytes !== undefined) {
    const max = MANIFEST_SCHEMA_LIMITS.maxMediaFileSizeBytes;
    if (
      typeof fileSizeBytes !== "number" ||
      !Number.isInteger(fileSizeBytes) ||
      fileSizeBytes < 1 ||
      fileSizeBytes > max
    ) {
      errors.push({
        field: `${path}.fileSizeBytes`,
        message: `File size must be a whole number of bytes from 1 to ${max}.`,
        hint: "Check the file size in bytes, not kilobytes or megabytes.",
      });
    }
  }
}
