import { createHash, randomUUID } from "crypto";
import { collection } from "./json-collection";

// Moderation audit trail (#784; docs/security/moderation-audit-log.md).
//
// Append-only: this module exposes no update or delete. Each entry stores the
// hash of the previous one, so editing or removing a line on disk breaks the
// chain and verifyModerationAuditChain() reports where. Entries hold
// identifiers and short reasons only, never tokens or evidence contents.

export type ModerationAuditAction =
  | "item_created"
  | "status_changed"
  | "assigned"
  | "review_notes_updated"
  | "escalated"
  | "evidence_added"
  | "evidence_package_viewed";

// success: the change was applied. The others record attempts that were refused.
export type ModerationAuditOutcome = "success" | "denied" | "not_found" | "invalid";

export interface ModerationAuditEntry {
  id: string;
  sequence: number;
  timestamp: string;
  actor: string;
  actorRole: string;
  action: ModerationAuditAction;
  targetType: "moderation_item";
  targetId: string;
  assetId?: string;
  contentHash?: string;
  outcome: ModerationAuditOutcome;
  reason?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  requestId?: string;
  previousHash: string;
  hash: string;
}

export type ModerationAuditInput = Omit<ModerationAuditEntry, "id" | "sequence" | "timestamp" | "targetType" | "previousHash" | "hash">;

export interface ModerationAuditQuery {
  actor?: string;
  targetId?: string;
  assetId?: string;
  action?: ModerationAuditAction;
  outcome?: ModerationAuditOutcome;
  from?: Date;
  to?: Date;
}

const GENESIS = "genesis";
const MAX_REASON_LENGTH = 1000;

const entries = () => collection<ModerationAuditEntry>("moderation-audit");

const chain = globalThis as typeof globalThis & { __moderationAuditChain?: Promise<unknown> };

function hashEntry(entry: Omit<ModerationAuditEntry, "hash">): string {
  // Fixed field order so the hash is stable regardless of object key order.
  const canonical = JSON.stringify([
    entry.id,
    entry.sequence,
    entry.timestamp,
    entry.actor,
    entry.actorRole,
    entry.action,
    entry.targetType,
    entry.targetId,
    entry.assetId ?? null,
    entry.contentHash ?? null,
    entry.outcome,
    entry.reason ?? null,
    entry.changes ?? null,
    entry.requestId ?? null,
    entry.previousHash,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

function bySequence(all: ModerationAuditEntry[]): ModerationAuditEntry[] {
  return all.sort((a, b) => a.sequence - b.sequence);
}

// Appends are serialized so sequence numbers and the hash chain never fork,
// even when several moderation requests land at once.
export function recordModerationAudit(input: ModerationAuditInput): Promise<ModerationAuditEntry> {
  const append = (chain.__moderationAuditChain ?? Promise.resolve()).then(async () => {
    const all = bySequence(await entries().all());
    const last = all.at(-1);
    const unsigned: Omit<ModerationAuditEntry, "hash"> = {
      ...input,
      reason: input.reason?.trim().slice(0, MAX_REASON_LENGTH) || undefined,
      id: randomUUID(),
      sequence: (last?.sequence ?? 0) + 1,
      timestamp: new Date().toISOString(),
      targetType: "moderation_item",
      previousHash: last?.hash ?? GENESIS,
    };
    const entry: ModerationAuditEntry = { ...unsigned, hash: hashEntry(unsigned) };
    await entries().put(entry);
    return entry;
  });
  chain.__moderationAuditChain = append.catch(() => {});
  return append;
}

// Newest first. Every filter is optional and they combine with AND.
export async function queryModerationAudit(query: ModerationAuditQuery = {}): Promise<ModerationAuditEntry[]> {
  const from = query.from?.getTime();
  const to = query.to?.getTime();
  return bySequence(await entries().all())
    .filter((e) => !query.actor || e.actor === query.actor)
    .filter((e) => !query.targetId || e.targetId === query.targetId)
    .filter((e) => !query.assetId || e.assetId === query.assetId)
    .filter((e) => !query.action || e.action === query.action)
    .filter((e) => !query.outcome || e.outcome === query.outcome)
    .filter((e) => from === undefined || Date.parse(e.timestamp) >= from)
    .filter((e) => to === undefined || Date.parse(e.timestamp) <= to)
    .reverse();
}

export interface ModerationAuditIntegrity {
  intact: boolean;
  entries: number;
  // First sequence number whose hash or link doesn't match, if any.
  brokenAt?: number;
}

export async function verifyModerationAuditChain(): Promise<ModerationAuditIntegrity> {
  const all = bySequence(await entries().all());
  let previousHash = GENESIS;
  for (const [index, entry] of all.entries()) {
    const { hash, ...unsigned } = entry;
    if (entry.sequence !== index + 1 || entry.previousHash !== previousHash || hashEntry(unsigned) !== hash) {
      return { intact: false, entries: all.length, brokenAt: entry.sequence };
    }
    previousHash = hash;
  }
  return { intact: true, entries: all.length };
}
