/**
 * provenanceReplay.ts (#669)
 *
 * Deterministic replay and reconstruction of provenance state from raw
 * provenance events. Used during incident response (partial failure, data
 * loss, incomplete chain sync) and migrations to rebuild the off-chain
 * provenance index and to prove the rebuilt data is consistent.
 *
 * Pipeline:
 *   1. merge   — combine events from several sources (exports, RPC event
 *                scans, backups); de-duplicate by id; flag conflicting copies.
 *   2. order   — stable total order: timestamp → ledger/tx → id.
 *   3. replay  — fold events per certificate through a state machine that
 *                rejects impossible transitions (e.g. activity after revoke).
 *   4. chain   — maintain a per-certificate SHA-256 hash chain over the
 *                canonical events; the chain head is the integrity fingerprint.
 *   5. verify  — compare the reconstructed state with a reference (a
 *                previous checkpoint or the live index) and report drift.
 *
 * IMPORTANT: this module intentionally has only type imports so that
 * `scripts/provenance-recovery.mjs` can load it directly with Node's built-in
 * TypeScript type stripping (Node ≥ 22.18). Do not add runtime imports or
 * TS-only runtime syntax (enums, namespaces, parameter properties).
 *
 * @module packages/shared/utils/provenanceReplay
 */

import type { ProvenanceEvent, ProvenanceEventType, ProvenanceRecord } from "../types";

export const PROVENANCE_REPLAY_VERSION = "1.0.0";
const GENESIS = "0".repeat(64);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconstructedStatus = "pending" | "active" | "failed" | "revoked";

export interface ReconstructedCertificate {
  certificateId: string;
  status: ReconstructedStatus;
  creator?: string;
  owner?: string;
  eventCount: number;
  firstEventAt: number;
  lastEventAt: number;
  lastEventId: string;
  linkedCertificateIds: string[];
  /** Head of the per-certificate hash chain. */
  chainHash: string;
}

export type ReplayIssueKind =
  | "duplicate_event"
  | "conflicting_event"
  | "invalid_transition"
  | "malformed_event"
  | "checkpoint_divergence"
  | "missing_certificate"
  | "unexpected_certificate"
  | "field_mismatch";

export interface ReplayIssue {
  kind: ReplayIssueKind;
  severity: "info" | "warning" | "error";
  certificateId?: string;
  eventId?: string;
  message: string;
}

/** Durable resume point. Replay can continue from here with only newer events. */
export interface ReplayCheckpoint {
  version: string;
  createdAt: string;
  /** Highest (timestamp, id) cursor applied. */
  cursor: { timestamp: number; eventId: string } | null;
  certificates: Record<string, ReconstructedCertificate>;
  /** Hash over the sorted certificate chain heads — detects tampering. */
  checkpointHash: string;
}

export interface ReplayResult {
  certificates: Record<string, ReconstructedCertificate>;
  checkpoint: ReplayCheckpoint;
  issues: ReplayIssue[];
  stats: {
    inputEvents: number;
    uniqueEvents: number;
    appliedEvents: number;
    skippedBeforeCheckpoint: number;
    rejectedEvents: number;
    certificates: number;
  };
}

export interface ReplayOptions {
  /** Resume from a checkpoint; events at or before its cursor are skipped. */
  fromCheckpoint?: ReplayCheckpoint;
  /** Stop after this timestamp (seconds) — point-in-time recovery. */
  untilTimestamp?: number;
  /** When true, invalid transitions are applied anyway (flagged as warnings). */
  lenient?: boolean;
  now?: Date;
}

// ---------------------------------------------------------------------------
// Hashing
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

/** Canonical digest of a single event (field order independent). */
export function eventDigest(event: ProvenanceEvent): Promise<string> {
  return sha256(canonical(event));
}

// ---------------------------------------------------------------------------
// Merge + order
// ---------------------------------------------------------------------------

const EVENT_TYPES: readonly ProvenanceEventType[] = [
  "verification_submitted",
  "verification_completed",
  "verification_failed",
  "certificate_minted",
  "metadata_updated",
  "ownership_transferred",
  "certificate_renewed",
  "certificate_linked",
  "certificate_revoked",
];

function isWellFormed(event: Partial<ProvenanceEvent>): event is ProvenanceEvent {
  return (
    typeof event.id === "string" &&
    event.id.length > 0 &&
    typeof event.certificateId === "string" &&
    event.certificateId.length > 0 &&
    typeof event.actor === "string" &&
    typeof event.timestamp === "number" &&
    Number.isFinite(event.timestamp) &&
    EVENT_TYPES.includes(event.type as ProvenanceEventType)
  );
}

export function compareEvents(a: ProvenanceEvent, b: ProvenanceEvent): number {
  if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
  const ta = a.txHash ?? "";
  const tb = b.txHash ?? "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Merges event lists from multiple sources. The first copy of each id wins;
 * later copies with different content are reported as conflicts so an
 * operator can decide which source is authoritative.
 */
export async function mergeEventSources(
  sources: Array<{ name: string; events: unknown[] }>,
): Promise<{ events: ProvenanceEvent[]; issues: ReplayIssue[]; inputEvents: number }> {
  const byId = new Map<string, { event: ProvenanceEvent; digest: string; source: string }>();
  const issues: ReplayIssue[] = [];
  let inputEvents = 0;

  for (const source of sources) {
    for (const raw of source.events) {
      inputEvents++;
      const event = raw as Partial<ProvenanceEvent>;
      if (!isWellFormed(event)) {
        issues.push({
          kind: "malformed_event",
          severity: "error",
          eventId: typeof event?.id === "string" ? event.id : undefined,
          message: `Malformed event in source "${source.name}" was skipped.`,
        });
        continue;
      }
      const digest = await eventDigest(event);
      const existing = byId.get(event.id);
      if (!existing) {
        byId.set(event.id, { event, digest, source: source.name });
      } else if (existing.digest === digest) {
        issues.push({
          kind: "duplicate_event",
          severity: "info",
          certificateId: event.certificateId,
          eventId: event.id,
          message: `Duplicate of event from "${existing.source}" in "${source.name}" ignored.`,
        });
      } else {
        issues.push({
          kind: "conflicting_event",
          severity: "error",
          certificateId: event.certificateId,
          eventId: event.id,
          message: `Event differs between "${existing.source}" (kept) and "${source.name}" (ignored). Resolve manually.`,
        });
      }
    }
  }

  const events = Array.from(byId.values(), (v) => v.event).sort(compareEvents);
  return { events, issues, inputEvents };
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/** Event types permitted from each reconstructed status. */
const ALLOWED: Record<ReconstructedStatus | "none", readonly ProvenanceEventType[]> = {
  none: ["verification_submitted", "certificate_minted"],
  pending: ["verification_submitted", "verification_completed", "verification_failed", "certificate_minted"],
  failed: ["verification_submitted"],
  active: [
    "metadata_updated",
    "ownership_transferred",
    "certificate_renewed",
    "certificate_linked",
    "certificate_revoked",
    "verification_submitted",
    "verification_completed",
  ],
  revoked: [],
};

function applyEvent(state: ReconstructedCertificate | undefined, event: ProvenanceEvent): ReconstructedCertificate {
  const next: ReconstructedCertificate = state
    ? { ...state, linkedCertificateIds: [...state.linkedCertificateIds] }
    : {
        certificateId: event.certificateId,
        status: "pending",
        eventCount: 0,
        firstEventAt: event.timestamp,
        lastEventAt: event.timestamp,
        lastEventId: event.id,
        linkedCertificateIds: [],
        chainHash: GENESIS,
      };

  switch (event.type) {
    case "verification_submitted":
      if (next.status !== "active") next.status = "pending";
      next.creator ??= event.actor;
      break;
    case "verification_failed":
      next.status = "failed";
      break;
    case "verification_completed":
      // Completion alone does not activate; activation happens on mint.
      break;
    case "certificate_minted":
      next.status = "active";
      next.creator ??= event.actor;
      next.owner ??= event.changes?.owner?.to ?? event.actor;
      break;
    case "ownership_transferred":
      next.owner = event.changes?.owner?.to ?? next.owner;
      break;
    case "certificate_linked":
      if (event.relatedCertificateId && !next.linkedCertificateIds.includes(event.relatedCertificateId)) {
        next.linkedCertificateIds.push(event.relatedCertificateId);
        next.linkedCertificateIds.sort();
      }
      break;
    case "certificate_revoked":
      next.status = "revoked";
      break;
    case "metadata_updated":
    case "certificate_renewed":
      break;
  }

  next.eventCount += 1;
  next.lastEventAt = event.timestamp;
  next.lastEventId = event.id;
  return next;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

async function hashCheckpoint(certificates: Record<string, ReconstructedCertificate>): Promise<string> {
  const heads = Object.keys(certificates)
    .sort()
    .map((id) => `${id}:${certificates[id].chainHash}:${certificates[id].eventCount}`);
  return sha256(heads.join("\n"));
}

/** Verifies a checkpoint has not been altered since it was written. */
export async function verifyCheckpoint(checkpoint: ReplayCheckpoint): Promise<boolean> {
  return (await hashCheckpoint(checkpoint.certificates)) === checkpoint.checkpointHash;
}

function isAfterCursor(event: ProvenanceEvent, cursor: ReplayCheckpoint["cursor"]): boolean {
  if (!cursor) return true;
  if (event.timestamp !== cursor.timestamp) return event.timestamp > cursor.timestamp;
  return event.id > cursor.eventId;
}

/**
 * Replays ordered events into reconstructed certificate state.
 * Events must already be merged/ordered (see `mergeEventSources`).
 */
export async function replayProvenance(events: ProvenanceEvent[], options: ReplayOptions = {}): Promise<ReplayResult> {
  const issues: ReplayIssue[] = [];
  const ordered = [...events].sort(compareEvents);

  let certificates: Record<string, ReconstructedCertificate> = {};
  let cursor: ReplayCheckpoint["cursor"] = null;

  if (options.fromCheckpoint) {
    if (!(await verifyCheckpoint(options.fromCheckpoint))) {
      throw new Error("Checkpoint hash does not match its contents — replay from genesis instead.");
    }
    certificates = structuredClone(options.fromCheckpoint.certificates);
    cursor = options.fromCheckpoint.cursor;
  }

  let applied = 0;
  let skipped = 0;
  let rejected = 0;

  for (const event of ordered) {
    if (!isAfterCursor(event, cursor)) {
      skipped++;
      continue;
    }
    if (options.untilTimestamp !== undefined && event.timestamp > options.untilTimestamp) break;

    const current = certificates[event.certificateId];
    const allowed = ALLOWED[current?.status ?? "none"];
    if (!allowed.includes(event.type)) {
      const issue: ReplayIssue = {
        kind: "invalid_transition",
        severity: options.lenient ? "warning" : "error",
        certificateId: event.certificateId,
        eventId: event.id,
        message: `"${event.type}" is not valid from status "${current?.status ?? "none"}".`,
      };
      issues.push(issue);
      if (!options.lenient) {
        rejected++;
        continue;
      }
    }

    const next = applyEvent(current, event);
    next.chainHash = await sha256(`${current?.chainHash ?? GENESIS}${await eventDigest(event)}`);
    certificates[event.certificateId] = next;
    cursor = { timestamp: event.timestamp, eventId: event.id };
    applied++;
  }

  const checkpoint: ReplayCheckpoint = {
    version: PROVENANCE_REPLAY_VERSION,
    createdAt: (options.now ?? new Date()).toISOString(),
    cursor,
    certificates,
    checkpointHash: await hashCheckpoint(certificates),
  };

  return {
    certificates,
    checkpoint,
    issues,
    stats: {
      inputEvents: events.length,
      uniqueEvents: ordered.length,
      appliedEvents: applied,
      skippedBeforeCheckpoint: skipped,
      rejectedEvents: rejected,
      certificates: Object.keys(certificates).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Consistency verification
// ---------------------------------------------------------------------------

export interface ConsistencyReport {
  consistent: boolean;
  checked: number;
  issues: ReplayIssue[];
}

function mapStatus(status: ReconstructedStatus): ProvenanceRecord["status"] | null {
  if (status === "active") return "active";
  if (status === "revoked") return "revoked";
  return null;
}

/**
 * Compares reconstructed state against reference records (e.g. the live
 * provenance index or a provenance export) and reports every drift.
 */
export function verifyAgainstRecords(
  reconstructed: Record<string, ReconstructedCertificate>,
  records: Array<Pick<ProvenanceRecord, "id" | "status" | "creator" | "eventCount" | "lastEventAt">>,
): ConsistencyReport {
  const issues: ReplayIssue[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    seen.add(record.id);
    const state = reconstructed[record.id];
    if (!state) {
      issues.push({
        kind: "missing_certificate",
        severity: "error",
        certificateId: record.id,
        message: "Present in reference data but no events were replayed for it.",
      });
      continue;
    }
    const expectedStatus = mapStatus(state.status);
    if (record.status !== "expired" && expectedStatus && expectedStatus !== record.status) {
      issues.push({
        kind: "field_mismatch",
        severity: "error",
        certificateId: record.id,
        message: `status: reference="${record.status}" replayed="${state.status}".`,
      });
    }
    if (record.creator && state.creator && record.creator !== state.creator) {
      issues.push({
        kind: "field_mismatch",
        severity: "error",
        certificateId: record.id,
        message: `creator: reference="${record.creator}" replayed="${state.creator}".`,
      });
    }
    if (record.eventCount !== state.eventCount) {
      issues.push({
        kind: "field_mismatch",
        severity: record.eventCount > state.eventCount ? "error" : "warning",
        certificateId: record.id,
        message: `eventCount: reference=${record.eventCount} replayed=${state.eventCount}.`,
      });
    }
    if (record.lastEventAt !== state.lastEventAt) {
      issues.push({
        kind: "field_mismatch",
        severity: "warning",
        certificateId: record.id,
        message: `lastEventAt: reference=${record.lastEventAt} replayed=${state.lastEventAt}.`,
      });
    }
  }

  for (const id of Object.keys(reconstructed)) {
    if (!seen.has(id)) {
      issues.push({
        kind: "unexpected_certificate",
        severity: "warning",
        certificateId: id,
        message: "Replayed from events but absent from reference data (reference may be stale).",
      });
    }
  }

  return {
    consistent: !issues.some((i) => i.severity === "error"),
    checked: records.length,
    issues,
  };
}

/** Compares two checkpoints (e.g. before/after a migration) by chain head. */
export function diffCheckpoints(a: ReplayCheckpoint, b: ReplayCheckpoint): ReplayIssue[] {
  const ids = new Set([...Object.keys(a.certificates), ...Object.keys(b.certificates)]);
  const issues: ReplayIssue[] = [];
  for (const id of Array.from(ids).sort()) {
    const left = a.certificates[id];
    const right = b.certificates[id];
    if (!left || !right) {
      issues.push({
        kind: left ? "missing_certificate" : "unexpected_certificate",
        severity: "error",
        certificateId: id,
        message: left ? "Missing from the second checkpoint." : "Only present in the second checkpoint.",
      });
    } else if (left.chainHash !== right.chainHash) {
      issues.push({
        kind: "checkpoint_divergence",
        severity: "error",
        certificateId: id,
        message: `Chain heads differ (${left.eventCount} vs ${right.eventCount} events).`,
      });
    }
  }
  return issues;
}

/** Converts reconstructed state back into index records for re-import. */
export function toProvenanceIndexRows(
  certificates: Record<string, ReconstructedCertificate>,
): Array<{ id: string; status: string; creator?: string; owner?: string; eventCount: number; lastEventAt: number; chainHash: string }> {
  return Object.values(certificates)
    .sort((a, b) => (a.certificateId < b.certificateId ? -1 : 1))
    .map((c) => ({
      id: c.certificateId,
      status: c.status,
      creator: c.creator,
      owner: c.owner,
      eventCount: c.eventCount,
      lastEventAt: c.lastEventAt,
      chainHash: c.chainHash,
    }));
}
