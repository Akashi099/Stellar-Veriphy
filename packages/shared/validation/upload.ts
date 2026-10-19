import type { UploadMetadata } from "../types";
import { toValidationResult, rejectUnknownFields, sha256Field, stellarAddressField, stringListField, textField } from "./fields";
import { validateManifest } from "./manifest";
import { validateManifestSchema } from "./manifestSchema";
import { FieldError, ValidationResult, isPlainObject } from "./result";

// MIME type -> accepted file extensions.
export const SUPPORTED_MEDIA_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/ogg": [".ogg"],
  "application/pdf": [".pdf"],
};

export const UPLOAD_LIMITS = {
  maxFileSizeBytes: 500 * 1024 * 1024,
  fileNameMaxLength: 255,
  titleMaxLength: 120,
  descriptionMaxLength: 2000,
  maxTags: 20,
  tagMaxLength: 40,
};

const UPLOAD_FIELDS = ["fileName", "mimeType", "fileSize", "contentHash", "creator", "title", "description", "tags", "manifest"];

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

// Checks fileName, mimeType and fileSize (the extension must match the type).
// Shared by upload metadata and resumable upload sessions.
export function checkFileFields(
  input: Record<string, unknown>,
  errors: FieldError[],
): { fileName: string; mimeType: string; fileSize: number } {
  // mimeType
  let mimeType = "";
  if (typeof input.mimeType !== "string" || input.mimeType.trim() === "") {
    errors.push({ field: "mimeType", message: "MIME type is required." });
  } else {
    mimeType = input.mimeType.split(";")[0].trim().toLowerCase();
    if (!SUPPORTED_MEDIA_TYPES[mimeType]) {
      errors.push({
        field: "mimeType",
        message: `Files of type "${mimeType}" are not supported.`,
        hint: `Supported types: ${Object.keys(SUPPORTED_MEDIA_TYPES).join(", ")}.`,
      });
    }
  }

  // fileName (checked against mimeType)
  let fileName = "";
  if (typeof input.fileName !== "string" || input.fileName.trim() === "") {
    errors.push({ field: "fileName", message: "File name is required." });
  } else {
    fileName = input.fileName.trim();
    const extensions = SUPPORTED_MEDIA_TYPES[mimeType];
    if (fileName.length > UPLOAD_LIMITS.fileNameMaxLength) {
      errors.push({ field: "fileName", message: `Must be at most ${UPLOAD_LIMITS.fileNameMaxLength} characters.` });
    } else if (/[\\/\u0000-\u001f]/.test(fileName)) {
      errors.push({ field: "fileName", message: "File name must not contain path separators or control characters." });
    } else if (extensions && !extensions.includes(extensionOf(fileName))) {
      errors.push({
        field: "fileName",
        message: `The file extension does not match its type (${mimeType}).`,
        hint: `Expected ${extensions.join(" or ")}. Renamed files can indicate the wrong file was selected.`,
      });
    }
  }

  // fileSize
  const fileSize = input.fileSize;
  if (typeof fileSize !== "number" || !Number.isInteger(fileSize)) {
    errors.push({ field: "fileSize", message: "File size must be a whole number of bytes." });
  } else if (fileSize <= 0) {
    errors.push({ field: "fileSize", message: "File is empty.", hint: "Choose a file that has content." });
  } else if (fileSize > UPLOAD_LIMITS.maxFileSizeBytes) {
    errors.push({ field: "fileSize", message: `File is larger than the ${UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024)} MB limit.` });
  }

  return { fileName, mimeType, fileSize: typeof fileSize === "number" ? fileSize : 0 };
}

// Validates upload metadata and returns it in the normalized form that is stored.
export function validateUploadMetadata(input: unknown, options: { now?: Date } = {}): ValidationResult<UploadMetadata> {
  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ field: "body", message: "Upload metadata must be a JSON object." }] };
  }
  const errors: FieldError[] = [];

  rejectUnknownFields(input, UPLOAD_FIELDS, errors);

  const { fileName, mimeType, fileSize } = checkFileFields(input, errors);

  const contentHash = sha256Field(input, "contentHash", { required: true, requiredMessage: "Content hash is required." }, errors) ?? "";
  const creator = stellarAddressField(input, "creator", { required: true, requiredMessage: "Creator public key is required." }, errors) ?? "";
  const title = textField(input, "title", { maxLength: UPLOAD_LIMITS.titleMaxLength }, errors);
  const description = textField(input, "description", { maxLength: UPLOAD_LIMITS.descriptionMaxLength }, errors);
  // tags: trimmed, lowercased, de-duplicated
  const tags = stringListField(
    input,
    "tags",
    { maxItems: UPLOAD_LIMITS.maxTags, itemMaxLength: UPLOAD_LIMITS.tagMaxLength, lowercase: true, unique: true },
    errors,
  ) ?? [];

  // manifest, plus cross-field consistency with the upload itself
  const manifestResult = validateManifest(input.manifest, { now: options.now, path: "manifest" });
  if (!manifestResult.ok) {
    errors.push(...manifestResult.errors);
  } else {
    const manifest = manifestResult.value;
    // The normalised manifest is what gets stored, so it must also match the published v1 schema.
    const schemaResult = validateManifestSchema(manifest, "v1", { path: "manifest" });
    if (!schemaResult.ok) errors.push(...schemaResult.errors);
    if (contentHash && manifest.contentHash !== contentHash) {
      errors.push({
        field: "manifest.contentHash",
        message: "The manifest content hash does not match the file hash.",
        hint: "The manifest must describe the file being uploaded. Re-select the file to regenerate it.",
      });
    }
    if (creator && manifest.creator !== creator) {
      errors.push({
        field: "manifest.creator",
        message: "The manifest creator does not match the uploader.",
        hint: "Use the same Stellar public key for the upload and the manifest.",
      });
    }
  }

  if (!manifestResult.ok) return { ok: false, errors };
  const manifest = manifestResult.value;

  return toValidationResult(errors, () => {
    const value: UploadMetadata = { fileName, mimeType, fileSize, contentHash, creator, tags, manifest };
    if (title) value.title = title;
    if (description) value.description = description;
    return value;
  });
}
