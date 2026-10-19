import type { ContentManifest } from "../types";
import { rejectUnknownFields, sha256Field, stellarAddressField } from "./fields";
import { findUnsafeManifestContent } from "./manifestSanitize";
import { FieldError, ValidationResult, isPlainObject } from "./result";

export const MANIFEST_LIMITS = {
  metadataFieldMaxLength: 200,
  // Allowed difference between the manifest timestamp and "now", to tolerate clock drift.
  maxClockSkewMs: 5 * 60 * 1000,
};

const MANIFEST_FIELDS = ["contentHash", "creator", "timestamp", "metadata"] as const;
const METADATA_FIELDS = ["device", "location", "aiModel"] as const;

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface ManifestValidationOptions {
  now?: Date;
  // Prefix for error field paths when the manifest is nested, e.g. "manifest".
  path?: string;
}

// Validates and normalizes a manifest. Used by the upload form before submission
// and by the API before storage, so both sides enforce the same rules.
export function validateManifest(
  input: unknown,
  options: ManifestValidationOptions = {},
): ValidationResult<ContentManifest> {
  const now = options.now ?? new Date();
  const at = (field: string) => (options.path ? `${options.path}.${field}` : field);
  const root = options.path ?? "manifest";
  const errors: FieldError[] = [];

  if (input === undefined || input === null || (isPlainObject(input) && Object.keys(input).length === 0)) {
    return {
      ok: false,
      errors: [{
        field: root,
        message: "Manifest is empty.",
        hint: "A manifest needs a content hash, creator public key and timestamp.",
      }],
    };
  }
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [{ field: root, message: "Manifest is malformed.", hint: "The manifest must be a JSON object." }],
    };
  }

  // Reject unsafe content (markup, invisible characters, prototype keys, …) before reading any field.
  const unsafe = findUnsafeManifestContent(input, { path: options.path });
  if (unsafe.length > 0) return { ok: false, errors: unsafe };

  rejectUnknownFields(input, MANIFEST_FIELDS, errors, options.path);

  const contentHash = sha256Field(input, "contentHash", {
    path: options.path,
    required: true,
    requiredMessage: "Content hash is required.",
    requiredHint: "Select a file so its SHA-256 hash can be computed.",
  }, errors) ?? "";
  const creator = stellarAddressField(input, "creator", {
    path: options.path,
    required: true,
    requiredMessage: "Creator public key is required.",
    requiredHint: "Enter the Stellar address (G…) that will own this content.",
  }, errors) ?? "";

  // timestamp
  let timestamp = "";
  if (input.timestamp === undefined || input.timestamp === "") {
    errors.push({ field: at("timestamp"), message: "Timestamp is required.", hint: "Use an ISO 8601 date-time such as 2026-01-31T12:00:00Z." });
  } else if (typeof input.timestamp !== "string" || !ISO_8601.test(input.timestamp.trim())) {
    errors.push({ field: at("timestamp"), message: "Timestamp is not a valid ISO 8601 date-time.", hint: "Include a date, time and timezone, e.g. 2026-01-31T12:00:00Z." });
  } else {
    const ms = Date.parse(input.timestamp.trim());
    if (Number.isNaN(ms)) {
      errors.push({ field: at("timestamp"), message: "Timestamp is not a real date.", hint: "Check the month, day and time values." });
    } else if (ms - now.getTime() > MANIFEST_LIMITS.maxClockSkewMs) {
      errors.push({ field: at("timestamp"), message: "Timestamp is in the future.", hint: "Use the time the content was created, or check your device clock." });
    } else {
      timestamp = new Date(ms).toISOString();
    }
  }

  // metadata
  let metadata: ContentManifest["metadata"];
  if (input.metadata !== undefined) {
    if (!isPlainObject(input.metadata)) {
      errors.push({ field: at("metadata"), message: "Metadata must be an object." });
    } else {
      const collected: Record<string, string> = {};
      for (const [key, value] of Object.entries(input.metadata)) {
        const field = at(`metadata.${key}`);
        if (!(METADATA_FIELDS as readonly string[]).includes(key)) {
          errors.push({ field, message: `Unknown metadata field "${key}".`, hint: `Allowed metadata: ${METADATA_FIELDS.join(", ")}.` });
          continue;
        }
        if (value === undefined) continue;
        if (typeof value !== "string") {
          errors.push({ field, message: "Must be text." });
          continue;
        }
        const trimmed = value.trim();
        if (trimmed === "") continue;
        if (trimmed.length > MANIFEST_LIMITS.metadataFieldMaxLength) {
          errors.push({ field, message: `Must be at most ${MANIFEST_LIMITS.metadataFieldMaxLength} characters.` });
        } else if (CONTROL_CHARS.test(trimmed)) {
          errors.push({ field, message: "Contains control characters.", hint: "Remove line breaks or invisible characters." });
        } else {
          collected[key] = trimmed;
        }
      }
      if (Object.keys(collected).length > 0) {
        metadata = collected;
      } else if (!errors.some((e) => e.field.startsWith(at("metadata")))) {
        errors.push({
          field: at("metadata"),
          message: "Metadata is present but has no values.",
          hint: "Omit metadata entirely, or provide at least one of device, location or aiModel.",
        });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Fixed key order keeps the canonical manifest (and its hash) stable.
  const manifest: ContentManifest = { contentHash, creator, timestamp };
  if (metadata) manifest.metadata = metadata;
  return { ok: true, value: manifest };
}
