import {
  enumField,
  integerField,
  rejectUnknownFields,
  requireObject,
  sha256Field,
  stellarAddressField,
  textField,
  toValidationResult,
} from "./fields";
import { FieldError, ValidationResult } from "./result";
import { checkFileFields } from "./upload";

// Resumable upload sessions (docs/api/upload-sessions.md). A session records
// which chunks of a file have been transferred so an interrupted upload can be
// resumed from where it stopped, or restarted from zero.

export const UPLOAD_SESSION_LIMITS = {
  defaultChunkSizeBytes: 5 * 1024 * 1024,
  minChunkSizeBytes: 256 * 1024,
  maxChunkSizeBytes: 50 * 1024 * 1024,
  // Sessions with no activity for this long expire and must be restarted.
  ttlMs: 24 * 60 * 60 * 1000,
  maxChunksPerUpdate: 1000,
};

export type UploadSessionStatus = "in_progress" | "completed" | "aborted" | "expired";

export interface UploadSessionStart {
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  creator: string;
  chunkSize: number;
}

export interface UploadSession extends UploadSessionStart {
  id: string;
  status: UploadSessionStatus;
  totalChunks: number;
  // Sorted, de-duplicated indexes of chunks confirmed as received.
  completedChunks: number[];
  bytesReceived: number;
  // 1 for the first attempt, incremented on every resume or restart.
  attempt: number;
  restartCount: number;
  // Set once the session is completed and the upload metadata is registered.
  uploadId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  completedAt?: string;
}

// Session plus derived progress, as returned by the API.
export interface UploadSessionView extends UploadSession {
  progress: number; // 0–100, one decimal place
  nextChunk: number | null; // first chunk still missing
  remainingChunks: number;
}

export type UploadSessionUpdate =
  | { action: "progress"; chunks: number[] }
  | { action: "resume" }
  | { action: "restart" }
  | { action: "abort" }
  | { action: "complete"; uploadId?: string };

export const UPLOAD_SESSION_ACTIONS = ["progress", "resume", "restart", "abort", "complete"] as const;

const START_FIELDS = ["fileName", "mimeType", "fileSize", "contentHash", "creator", "chunkSize"];

export function totalChunksFor(fileSize: number, chunkSize: number): number {
  return Math.max(1, Math.ceil(fileSize / chunkSize));
}

export function chunkByteLength(index: number, fileSize: number, chunkSize: number): number {
  return Math.max(0, Math.min(chunkSize, fileSize - index * chunkSize));
}

// Derives progress from the stored chunk list, so every retry reports the same numbers.
export function describeUploadSession(session: UploadSession): UploadSessionView {
  const done = new Set(session.completedChunks);
  let nextChunk: number | null = null;
  for (let i = 0; i < session.totalChunks; i++) {
    if (!done.has(i)) {
      nextChunk = i;
      break;
    }
  }
  const progress = session.fileSize > 0 ? Math.floor((session.bytesReceived / session.fileSize) * 1000) / 10 : 0;
  return {
    ...session,
    progress,
    nextChunk,
    remainingChunks: session.totalChunks - done.size,
  };
}

export function validateUploadSessionStart(input: unknown): ValidationResult<UploadSessionStart> {
  const body = requireObject(input);
  if (!body.ok) return body;
  const value = body.value;
  const errors: FieldError[] = [];

  rejectUnknownFields(value, START_FIELDS, errors);
  const { fileName, mimeType, fileSize } = checkFileFields(value, errors);
  const contentHash = sha256Field(value, "contentHash", { required: true, requiredMessage: "Content hash is required." }, errors);
  const creator = stellarAddressField(value, "creator", { required: true, requiredMessage: "Creator public key is required." }, errors);
  const chunkSize = integerField(value, "chunkSize", {
    min: UPLOAD_SESSION_LIMITS.minChunkSizeBytes,
    max: UPLOAD_SESSION_LIMITS.maxChunkSizeBytes,
  }, errors) ?? UPLOAD_SESSION_LIMITS.defaultChunkSizeBytes;

  return toValidationResult(errors, () => ({
    fileName,
    mimeType,
    fileSize,
    contentHash: contentHash!,
    creator: creator!,
    chunkSize,
  }));
}

// Validates a session update. Chunk indexes are checked against the session's
// chunk count by the caller, which knows it.
export function validateUploadSessionUpdate(input: unknown): ValidationResult<UploadSessionUpdate> {
  const body = requireObject(input);
  if (!body.ok) return body;
  const value = body.value;
  const errors: FieldError[] = [];

  const action = enumField(value, "action", UPLOAD_SESSION_ACTIONS, { required: true, requiredMessage: "action is required." }, errors);
  if (!action) return { ok: false, errors };

  if (action === "progress") {
    rejectUnknownFields(value, ["action", "chunks"], errors);
    const chunks = value.chunks;
    if (!Array.isArray(chunks) || chunks.length === 0) {
      errors.push({ field: "chunks", message: "chunks must be a non-empty list of chunk indexes." });
    } else if (chunks.length > UPLOAD_SESSION_LIMITS.maxChunksPerUpdate) {
      errors.push({ field: "chunks", message: `At most ${UPLOAD_SESSION_LIMITS.maxChunksPerUpdate} chunks can be reported at once.` });
    } else if (chunks.some((c) => typeof c !== "number" || !Number.isInteger(c) || c < 0)) {
      errors.push({ field: "chunks", message: "Chunk indexes must be whole numbers of 0 or more." });
    }
    return toValidationResult(errors, () => ({ action, chunks: [...new Set(chunks as number[])].sort((a, b) => a - b) }));
  }

  if (action === "complete") {
    rejectUnknownFields(value, ["action", "uploadId"], errors);
    const uploadId = textField(value, "uploadId", { maxLength: 100, singleLine: true }, errors);
    return toValidationResult(errors, () => (uploadId ? { action, uploadId } : { action }));
  }

  rejectUnknownFields(value, ["action"], errors);
  return toValidationResult(errors, () => ({ action }));
}
