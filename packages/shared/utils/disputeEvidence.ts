/**
 * disputeEvidence.ts (#671)
 *
 * Packages the evidence attached to a disputed asset into a single,
 * consistently-structured, tamper-evident bundle so reviewers can inspect
 * files, manifests, hashes, attestations, and comments in one place.
 *
 * Design goals:
 * - **Consistent structure** — every package has the same sections, sorted
 *   deterministically, regardless of the order evidence was submitted in.
 * - **Linked to the dispute** — each item carries the dispute id and a
 *   per-item digest; the package digest commits to the dispute id, asset id,
 *   content hash and every item digest.
 * - **Human review + audit** — `summarizeEvidencePackage` feeds the review UI;
 *   `evidencePackageAuditEntries` produces append-only audit records.
 *
 * The module has no runtime imports so it can be used from the browser, from
 * Next.js route handlers and from Node scripts alike.
 *
 * @module packages/shared/utils/disputeEvidence
 */

import type { ModerationQueueItem } from "../types";

export const DISPUTE_EVIDENCE_SCHEMA_VERSION = "1.0.0";

/** Kinds of evidence a package can hold. Order here is the display order. */
export const EVIDENCE_KINDS = [
  "manifest",
  "hash",
  "file",
  "attestation",
  "link",
  "comment",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Who submitted an evidence item relative to the dispute. */
export type EvidenceSubmitterRole = "reporter" | "creator" | "reviewer" | "oracle" | "system";

/** A single piece of evidence attached to a dispute. */
export interface DisputeEvidenceItem {
  /** Stable identifier (assigned on submission). */
  id: string;
  kind: EvidenceKind;
  /** Short human label, e.g. "Original RAW export" or "Reporter statement". */
  label: string;
  /** Stellar address (or system id) of the submitter. */
  submittedBy: string;
  submitterRole: EvidenceSubmitterRole;
  /** ISO 8601 submission timestamp. */
  submittedAt: string;
  /** For `hash` / `file` / `manifest` kinds: the SHA-256 hex digest being asserted. */
  sha256?: string;
  /** For `file` kind: storage reference (IPFS CID, S3 key, …). Never inline file bytes. */
  storageRef?: string;
  /** For `file` kind: MIME type and size, as reported by the submitter. */
  mimeType?: string;
  sizeBytes?: number;
  /** For `manifest` kind: the manifest JSON exactly as submitted. */
  manifest?: Record<string, unknown>;
  /** For `link` kind: an external URL. */
  url?: string;
  /** For `comment` kind (and optional notes on any item). */
  text?: string;
  /** For `attestation` kind: oracle request id / tx hash that produced it. */
  attestationRef?: string;
}

/** Result of checking one item against the disputed asset. */
export interface EvidenceItemCheck {
  itemId: string;
  /** Digest of the canonical item — what the package hash commits to. */
  itemDigest: string;
  /** `match` when `sha256` equals the disputed asset's content hash. */
  contentHashRelation: "match" | "mismatch" | "not_applicable";
  /** `valid` when a manifest item's recomputed hash equals its declared `sha256`. */
  manifestIntegrity: "valid" | "invalid" | "not_applicable";
  warnings: string[];
}

export interface EvidencePackageAuditRecord {
  at: string;
  actor: string;
  action: "package_created" | "item_added" | "package_sealed" | "package_verified" | "package_viewed";
  details: string;
}

/** The packaged, reviewable bundle. */
export interface DisputeEvidencePackage {
  schemaVersion: string;
  packageId: string;
  disputeId: string;
  assetId: string;
  contentHash: string;
  /** On-chain dispute id in the oracle contract, when the dispute is on-chain. */
  onChainDisputeId?: number;
  trigger?: ModerationQueueItem["trigger"];
  summary?: string;
  reportedBy?: string;
  creatorAddress?: string;
  createdAt: string;
  createdBy: string;
  /** Items grouped by kind, each group sorted by submission time then id. */
  sections: Record<EvidenceKind, DisputeEvidenceItem[]>;
  checks: EvidenceItemCheck[];
  /** SHA-256 over the canonical package header + ordered item digests. */
  packageHash: string;
  auditTrail: EvidencePackageAuditRecord[];
}

export interface EvidencePackageSummary {
  totalItems: number;
  countsByKind: Record<EvidenceKind, number>;
  matchingHashes: number;
  mismatchingHashes: number;
  invalidManifests: number;
  submitters: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Hashing helpers (Web Crypto — available in browsers, Node ≥ 19 and the edge)
// ---------------------------------------------------------------------------

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeHash(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/, "");
}

const HEX64 = /^[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns human-readable problems with an item; empty array means valid. */
export function validateEvidenceItem(item: Partial<DisputeEvidenceItem>): string[] {
  const problems: string[] = [];
  if (!item.id) problems.push("id is required");
  if (!item.kind || !EVIDENCE_KINDS.includes(item.kind)) problems.push("kind is invalid");
  if (!item.label?.trim()) problems.push("label is required");
  if (!item.submittedBy) problems.push("submittedBy is required");
  if (!item.submittedAt || Number.isNaN(Date.parse(item.submittedAt))) {
    problems.push("submittedAt must be an ISO 8601 timestamp");
  }
  if (item.sha256 !== undefined && !HEX64.test(normalizeHash(item.sha256))) {
    problems.push("sha256 must be a 64-character hex digest");
  }
  switch (item.kind) {
    case "hash":
      if (!item.sha256) problems.push("hash evidence requires sha256");
      break;
    case "file":
      if (!item.storageRef) problems.push("file evidence requires storageRef");
      if (!item.sha256) problems.push("file evidence requires sha256");
      break;
    case "manifest":
      if (!item.manifest || typeof item.manifest !== "object") {
        problems.push("manifest evidence requires a manifest object");
      }
      break;
    case "link":
      try {
        const url = new URL(item.url ?? "");
        if (url.protocol !== "https:") problems.push("link evidence must use https");
      } catch {
        problems.push("link evidence requires a valid url");
      }
      break;
    case "comment":
      if (!item.text?.trim()) problems.push("comment evidence requires text");
      break;
    case "attestation":
      if (!item.attestationRef) problems.push("attestation evidence requires attestationRef");
      break;
  }
  return problems;
}

/**
 * Converts the free-form `evidence` strings stored on legacy moderation items
 * into typed evidence items so older disputes can still be packaged.
 */
export function legacyEvidenceToItems(
  queueItem: Pick<ModerationQueueItem, "id" | "evidence" | "reportedBy" | "createdAt">,
): DisputeEvidenceItem[] {
  return (queueItem.evidence ?? []).map((raw, index) => {
    const value = raw.trim();
    const base = {
      id: `${queueItem.id}-legacy-${index + 1}`,
      submittedBy: queueItem.reportedBy ?? "unknown",
      submitterRole: "reporter" as const,
      submittedAt: queueItem.createdAt,
    };
    if (HEX64.test(normalizeHash(value))) {
      return { ...base, kind: "hash" as const, label: "Submitted hash", sha256: normalizeHash(value) };
    }
    if (/^https:\/\//i.test(value)) {
      return { ...base, kind: "link" as const, label: "Submitted link", url: value };
    }
    return { ...base, kind: "comment" as const, label: "Submitted note", text: value };
  });
}

// ---------------------------------------------------------------------------
// Packaging
// ---------------------------------------------------------------------------

function emptySections(): Record<EvidenceKind, DisputeEvidenceItem[]> {
  return Object.fromEntries(EVIDENCE_KINDS.map((k) => [k, []])) as unknown as Record<
    EvidenceKind,
    DisputeEvidenceItem[]
  >;
}

function orderedItems(sections: Record<EvidenceKind, DisputeEvidenceItem[]>): DisputeEvidenceItem[] {
  return EVIDENCE_KINDS.flatMap((kind) => sections[kind]);
}

async function checkItem(item: DisputeEvidenceItem, contentHash: string): Promise<EvidenceItemCheck> {
  const warnings = validateEvidenceItem(item);
  const itemDigest = await sha256(canonical(item));

  let contentHashRelation: EvidenceItemCheck["contentHashRelation"] = "not_applicable";
  if (item.sha256 && (item.kind === "hash" || item.kind === "file")) {
    contentHashRelation =
      normalizeHash(item.sha256) === normalizeHash(contentHash) ? "match" : "mismatch";
  }

  let manifestIntegrity: EvidenceItemCheck["manifestIntegrity"] = "not_applicable";
  if (item.kind === "manifest" && item.manifest) {
    if (item.sha256) {
      const recomputed = await sha256(canonical(item.manifest));
      manifestIntegrity = recomputed === normalizeHash(item.sha256) ? "valid" : "invalid";
      if (manifestIntegrity === "invalid") {
        warnings.push("manifest content does not match its declared sha256");
      }
    } else {
      warnings.push("manifest submitted without a declared sha256; integrity cannot be checked");
    }
    const declaredContentHash = item.manifest["contentHash"];
    if (
      typeof declaredContentHash === "string" &&
      normalizeHash(declaredContentHash) !== normalizeHash(contentHash)
    ) {
      warnings.push("manifest references a different contentHash than the disputed asset");
    }
  }

  return { itemId: item.id, itemDigest, contentHashRelation, manifestIntegrity, warnings };
}

async function computePackageHash(
  header: Pick<DisputeEvidencePackage, "schemaVersion" | "disputeId" | "assetId" | "contentHash" | "onChainDisputeId">,
  checks: EvidenceItemCheck[],
): Promise<string> {
  return sha256(
    canonical({
      schemaVersion: header.schemaVersion,
      disputeId: header.disputeId,
      assetId: header.assetId,
      onChainDisputeId: header.onChainDisputeId,
      contentHash: normalizeHash(header.contentHash),
      items: checks.map((c) => c.itemDigest),
    }),
  );
}

export interface BuildEvidencePackageInput {
  dispute: Pick<
    ModerationQueueItem,
    "id" | "assetId" | "contentHash" | "trigger" | "summary" | "reportedBy" | "creatorAddress"
  >;
  items: DisputeEvidenceItem[];
  createdBy: string;
  onChainDisputeId?: number;
  now?: Date;
}

/**
 * Builds a deterministic evidence package. Duplicate item ids are collapsed
 * (the first submission wins) so re-packaging is idempotent.
 */
export async function buildEvidencePackage(input: BuildEvidencePackageInput): Promise<DisputeEvidencePackage> {
  const now = (input.now ?? new Date()).toISOString();
  const sections = emptySections();
  const seen = new Set<string>();

  for (const item of input.items) {
    if (seen.has(item.id) || !EVIDENCE_KINDS.includes(item.kind)) continue;
    seen.add(item.id);
    sections[item.kind].push(item);
  }
  for (const kind of EVIDENCE_KINDS) {
    sections[kind].sort((a, b) =>
      a.submittedAt === b.submittedAt ? a.id.localeCompare(b.id) : a.submittedAt.localeCompare(b.submittedAt),
    );
  }

  const ordered = orderedItems(sections);
  const checks = await Promise.all(ordered.map((item) => checkItem(item, input.dispute.contentHash)));

  const header = {
    schemaVersion: DISPUTE_EVIDENCE_SCHEMA_VERSION,
    disputeId: input.dispute.id,
    assetId: input.dispute.assetId,
    contentHash: input.dispute.contentHash,
    onChainDisputeId: input.onChainDisputeId,
  };
  const packageHash = await computePackageHash(header, checks);

  return {
    ...header,
    packageId: `evp_${input.dispute.id}_${packageHash.slice(0, 12)}`,
    trigger: input.dispute.trigger,
    summary: input.dispute.summary,
    reportedBy: input.dispute.reportedBy,
    creatorAddress: input.dispute.creatorAddress,
    createdAt: now,
    createdBy: input.createdBy,
    sections,
    checks,
    packageHash,
    auditTrail: [
      {
        at: now,
        actor: input.createdBy,
        action: "package_created",
        details: `Packaged ${ordered.length} evidence item(s) for dispute ${input.dispute.id}; packageHash=${packageHash}`,
      },
    ],
  };
}

export interface EvidencePackageVerification {
  valid: boolean;
  expectedHash: string;
  actualHash: string;
  tamperedItems: string[];
}

/**
 * Recomputes every item digest and the package hash. Use this before acting
 * on a package received from storage or another reviewer.
 */
export async function verifyEvidencePackage(pkg: DisputeEvidencePackage): Promise<EvidencePackageVerification> {
  const ordered = orderedItems(pkg.sections);
  const recomputed = await Promise.all(ordered.map((item) => checkItem(item, pkg.contentHash)));
  const stored = new Map(pkg.checks.map((c) => [c.itemId, c.itemDigest]));
  const tamperedItems = recomputed.filter((c) => stored.get(c.itemId) !== c.itemDigest).map((c) => c.itemId);
  if (stored.size !== recomputed.length) {
    for (const id of stored.keys()) {
      if (!ordered.some((item) => item.id === id)) tamperedItems.push(id);
    }
  }
  const actualHash = await computePackageHash(pkg, recomputed);
  return {
    valid: actualHash === pkg.packageHash && tamperedItems.length === 0,
    expectedHash: pkg.packageHash,
    actualHash,
    tamperedItems,
  };
}

// ---------------------------------------------------------------------------
// Review & audit helpers
// ---------------------------------------------------------------------------

export function summarizeEvidencePackage(pkg: DisputeEvidencePackage): EvidencePackageSummary {
  const countsByKind = Object.fromEntries(
    EVIDENCE_KINDS.map((k) => [k, pkg.sections[k].length]),
  ) as Record<EvidenceKind, number>;
  const ordered = orderedItems(pkg.sections);
  return {
    totalItems: ordered.length,
    countsByKind,
    matchingHashes: pkg.checks.filter((c) => c.contentHashRelation === "match").length,
    mismatchingHashes: pkg.checks.filter((c) => c.contentHashRelation === "mismatch").length,
    invalidManifests: pkg.checks.filter((c) => c.manifestIntegrity === "invalid").length,
    submitters: Array.from(new Set(ordered.map((i) => i.submittedBy))).sort(),
    warnings: pkg.checks.flatMap((c) => c.warnings.map((w) => `${c.itemId}: ${w}`)),
  };
}

/** Appends an audit record without mutating the original package. */
export function appendEvidenceAudit(
  pkg: DisputeEvidencePackage,
  record: Omit<EvidencePackageAuditRecord, "at"> & { at?: string },
): DisputeEvidencePackage {
  return {
    ...pkg,
    auditTrail: [...pkg.auditTrail, { ...record, at: record.at ?? new Date().toISOString() }],
  };
}

/**
 * Flattens the package into audit-log-friendly records (one per item plus a
 * header record) that can be written to the admin audit log.
 */
export function evidencePackageAuditEntries(pkg: DisputeEvidencePackage): Array<{
  entityType: "dispute_evidence";
  entityId: string;
  action: string;
  details: Record<string, unknown>;
}> {
  const header = {
    entityType: "dispute_evidence" as const,
    entityId: pkg.disputeId,
    action: "evidence_package_created",
    details: {
      packageId: pkg.packageId,
      packageHash: pkg.packageHash,
      assetId: pkg.assetId,
      contentHash: pkg.contentHash,
      onChainDisputeId: pkg.onChainDisputeId,
      itemCount: pkg.checks.length,
    },
  };
  const items = orderedItems(pkg.sections).map((item) => {
    const check = pkg.checks.find((c) => c.itemId === item.id);
    return {
      entityType: "dispute_evidence" as const,
      entityId: pkg.disputeId,
      action: "evidence_item_packaged",
      details: {
        packageId: pkg.packageId,
        itemId: item.id,
        kind: item.kind,
        submittedBy: item.submittedBy,
        submittedAt: item.submittedAt,
        sha256: item.sha256,
        storageRef: item.storageRef,
        itemDigest: check?.itemDigest,
        contentHashRelation: check?.contentHashRelation,
        manifestIntegrity: check?.manifestIntegrity,
      },
    };
  });
  return [header, ...items];
}
