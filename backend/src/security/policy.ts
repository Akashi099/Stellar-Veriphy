import { createHash } from "node:crypto";
import type { VerificationDoc } from "../db/collections.js";

export function maskVerification(doc: Partial<VerificationDoc>, admin = false) {
  const publicFields = { jobId: doc.jobId, status: doc.status, certId: doc.certId,
    txHash: doc.txHash, createdAt: doc.createdAt, updatedAt: doc.updatedAt, completedAt: doc.completedAt };
  if (admin) return { ...publicFields, visibility: "private", contentHash: doc.contentHash,
    manifestHash: doc.manifestHash, creator: doc.creator, error: doc.error, manifest: doc.manifest };
  return { ...publicFields, visibility: "public", ...(doc.sharingPolicy === "public" ?
    { contentHash: doc.contentHash, manifestHash: doc.manifestHash, creator: doc.creator } : {}) };
}

/** Canonical JSON: sorted object keys, array order retained, JSON scalar encoding. */
export function canonical(value: unknown): string {
  const normalized: unknown = JSON.parse(JSON.stringify(value));
  function encode(v: any): string {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(encode).join(",") + "]";
    return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + encode(v[k])).join(",") + "}";
  }
  return encode(normalized);
}
export const digest = (v: unknown) => createHash("sha256").update(canonical(v), "utf8").digest("hex");

export interface RiskRules { windowMs: number; minimumFailures: number; pointsPerFailure: number; reviewScore: number }
export function scoreRisk(records: Pick<VerificationDoc, "jobId" | "status" | "updatedAt">[], rules: RiskRules, now = new Date()) {
  const cutoff = now.getTime() - rules.windowMs;
  const unique = new Map(records.filter(r => r.updatedAt.getTime() >= cutoff && r.updatedAt <= now).map(r => [r.jobId, r]));
  const failures = [...unique.values()].filter(r => r.status === "failed").length;
  const score = failures < rules.minimumFailures ? 0 : Math.min(100, failures * rules.pointsPerFailure);
  return { score, failures, distinctVerifications: unique.size, windowStart: new Date(cutoff), evaluatedAt: now,
    reviewSuggested: score >= rules.reviewScore, advisoryOnly: true, rules };
}
