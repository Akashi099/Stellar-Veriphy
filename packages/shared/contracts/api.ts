/**
 * API contract checks shared by the backend (producer) and frontend (consumer).
 *
 * Each contract lists every field of its TypeScript interface via
 * `Record<keyof T, FieldRule>`, so adding, removing or renaming a field in
 * `types/index.ts` breaks `tsc` until the contract is updated. At runtime,
 * `checkContract` validates real or mocked API payloads against the same rules.
 */

import type { ContentManifest, UploadRecord, VerificationJobView, VerificationStatus } from "../types";

type FieldRule = { type: "string" | "number" | "boolean" | "object" | "array"; optional?: boolean; nullable?: boolean; oneOf?: readonly unknown[] };
export type ApiContract<T> = { name: string; fields: Record<keyof T, FieldRule> };

const VERIFICATION_STATUSES: readonly VerificationStatus[] = ["pending", "processing", "certified", "failed"];

export const ContentManifestContract: ApiContract<ContentManifest> = {
  name: "ContentManifest",
  fields: {
    schemaVersion: { type: "string", optional: true },
    contentHash: { type: "string" },
    creator: { type: "string" },
    timestamp: { type: "string" },
    metadata: { type: "object", optional: true },
    media: { type: "object", optional: true },
  },
};

export const UploadRecordContract: ApiContract<UploadRecord> = {
  name: "UploadRecord",
  fields: {
    id: { type: "string" },
    createdAt: { type: "string" },
    manifestHash: { type: "string" },
    fileName: { type: "string" },
    mimeType: { type: "string" },
    fileSize: { type: "number" },
    contentHash: { type: "string" },
    creator: { type: "string" },
    title: { type: "string", optional: true },
    description: { type: "string", optional: true },
    tags: { type: "array" },
    manifest: { type: "object" },
  },
};

export const VerificationJobViewContract: ApiContract<VerificationJobView> = {
  name: "VerificationJobView",
  fields: {
    id: { type: "string" },
    uploadId: { type: "string" },
    status: { type: "string", oneOf: VERIFICATION_STATUSES },
    createdAt: { type: "string" },
    startedAt: { type: "string", optional: true },
    completedAt: { type: "string", optional: true },
    error: { type: "string", optional: true },
    result: { type: "object", optional: true },
    queuePosition: { type: "number", nullable: true },
    estimatedWaitMs: { type: "number", nullable: true },
    averageDurationMs: { type: "number", nullable: true },
  },
};

function typeOf(value: unknown): FieldRule["type"] | "null" | "undefined" | "other" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean" || t === "object" || t === "undefined" ? t : "other";
}

/** Returns a list of contract violations (empty when the payload conforms). */
export function checkContract<T>(contract: ApiContract<T>, value: unknown, path = contract.name): string[] {
  if (typeOf(value) !== "object") return [`${path}: expected object, got ${typeOf(value)}`];
  const obj = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, rule] of Object.entries(contract.fields) as [string, FieldRule][]) {
    const actual = typeOf(obj[key]);
    if (actual === "undefined" && rule.optional) continue;
    if (actual === "null" && rule.nullable) continue;
    if (actual !== rule.type) errors.push(`${path}.${key}: expected ${rule.type}, got ${actual}`);
    else if (rule.oneOf && !rule.oneOf.includes(obj[key])) errors.push(`${path}.${key}: unexpected value ${String(obj[key])}`);
  }
  return errors;
}

/** Validates the `{ data }` envelope returned by the API and each item inside it. */
export function checkEnvelope<T>(contract: ApiContract<T>, body: unknown, { list = false } = {}): string[] {
  if (typeOf(body) !== "object" || !("data" in (body as object))) return ["envelope: missing `data`"];
  const data = (body as { data: unknown }).data;
  if (!list) return checkContract(contract, data);
  if (!Array.isArray(data)) return [`envelope.data: expected array, got ${typeOf(data)}`];
  return data.flatMap((item, i) => checkContract(contract, item, `${contract.name}[${i}]`));
}

export function assertContract<T>(contract: ApiContract<T>, value: unknown): asserts value is T {
  const errors = checkContract(contract, value);
  if (errors.length) throw new TypeError(`API contract violation:\n${errors.join("\n")}`);
}
