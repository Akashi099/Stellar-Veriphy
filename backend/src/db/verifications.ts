import type { Db, Filter } from "mongodb";
import type { Config } from "../config.js";
import { TtlCache } from "../lib/cache.js";
import type { Logger } from "../lib/logger.js";
import { Collections, type VerificationDoc, type VerificationStatus } from "./collections.js";

const MAX_PAGE_SIZE = 100;

/** Only what the status endpoint returns; keeps the hot path's documents small. */
const STATUS_PROJECTION = {
  _id: 0,
  jobId: 1,
  status: 1,
  certId: 1,
  txHash: 1,
  error: 1,
  createdAt: 1,
  updatedAt: 1,
  completedAt: 1,
} as const;

/**
 * Every verification read goes through here so each query shape maps to exactly one index
 * in src/db/indexes.ts. Add a matching index (and doc entry) before adding a new query.
 */
export class VerificationRepository {
  constructor(private readonly db: Db) {}

  private get col() {
    return this.db.collection<VerificationDoc>(Collections.verifications);
  }

  /** Index: jobId_unique */
  getStatus(jobId: string) {
    return this.col.findOne({ jobId }, { projection: STATUS_PROJECTION });
  }

  /** Index: contentHash_createdAt */
  findLatestByContentHash(contentHash: string) {
    return this.col.findOne({ contentHash }, { sort: { createdAt: -1 } });
  }

  /**
   * Index: creator_createdAt. Keyset pagination: pass the last item's createdAt as `before`
   * instead of using skip(), which scans and discards every skipped document.
   */
  listByCreator(creator: string, { limit = 20, before }: { limit?: number; before?: Date } = {}) {
    const filter: Filter<VerificationDoc> = { creator };
    if (before) filter.createdAt = { $lt: before };
    return this.col
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), MAX_PAGE_SIZE))
      .toArray();
  }

  /** Index: status_updatedAt — e.g. requests stuck in "processing". */
  findStale(status: VerificationStatus, olderThan: Date, limit = 100) {
    return this.col
      .find({ status, updatedAt: { $lt: olderThan } })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .toArray();
  }

  /** Index: certId_unique */
  findByCertId(certId: string) {
    return this.col.findOne({ certId });
  }

  /** Index: jobId_unique — bulk load for selective reindexing. */
  findByIds(jobIds: string[], limit = MAX_PAGE_SIZE) {
    if (jobIds.length === 0) return Promise.resolve([]);
    return this.col
      .find({ jobId: { $in: jobIds.slice(0, limit) } })
      .limit(Math.min(Math.max(limit, 1), MAX_PAGE_SIZE))
      .toArray();
  }

  /** Index: contentHash_createdAt — bulk load for selective reindexing. */
  findByContentHashes(contentHashes: string[], limit = MAX_PAGE_SIZE) {
    if (contentHashes.length === 0) return Promise.resolve([]);
    return this.col
      .find({ contentHash: { $in: contentHashes.slice(0, limit) } })
      .limit(Math.min(Math.max(limit, 1), MAX_PAGE_SIZE))
      .toArray();
  }

  /**
   * Index: jobId_unique. Rewrites the verification/provenance fields for one record during a
   * reindex. Only the supplied fields are touched; `updatedAt` is always bumped. Returns the
   * updated document, or null when the record no longer exists.
   */
  refresh(
    jobId: string,
    fields: Partial<Pick<VerificationDoc, "status" | "certId" | "txHash" | "error" | "completedAt">>,
  ) {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ["status", "certId", "txHash", "error", "completedAt"] as const) {
      if (fields[key] !== undefined) $set[key] = fields[key];
    }
    return this.col.findOneAndUpdate({ jobId }, { $set }, { returnDocument: "after" });
  }

  /** Convenience wrapper for status-only refreshes. */
  updateStatus(jobId: string, status: VerificationStatus, extra: { certId?: string; txHash?: string; error?: string } = {}) {
    return this.refresh(jobId, { status, ...extra });
  }
}

type StatusResult = NonNullable<Awaited<ReturnType<VerificationRepository["getStatus"]>>>;
type VerificationResult = NonNullable<Awaited<ReturnType<VerificationRepository["findLatestByContentHash"]>>>;

/** Statuses that never change again, so their status/certificate documents are safe to cache longer. */
const TERMINAL_STATUSES: readonly VerificationStatus[] = ["certified", "failed"];

export interface PublicVerificationCaches {
  status: TtlCache<StatusResult>;
  contentHash: TtlCache<VerificationResult>;
  certId: TtlCache<VerificationResult>;
}

export function createPublicVerificationCaches(opts: Config["cache"], log: Logger): PublicVerificationCaches {
  const base = { maxEntries: opts.maxEntries, negativeTtlMs: opts.negativeTtlMs };
  return {
    status: new TtlCache({ ...base, name: "verification_status", ttlMs: opts.statusTtlMs }, log),
    contentHash: new TtlCache({ ...base, name: "verification_content_hash", ttlMs: opts.contentHashTtlMs }, log),
    certId: new TtlCache({ ...base, name: "verification_cert_id", ttlMs: opts.statusTtlMs }, log),
  };
}

/**
 * Cached front for the public (unauthenticated) verification reads (#779). Invalidation rules are
 * documented in docs/operations/public-read-cache.md:
 *
 * - status / certId: only terminal (certified/failed) records are cached, so a cached entry can never
 *   hide a later state change. Pending/processing lookups always reach MongoDB.
 * - contentHash: cached for a short TTL because re-verifying content creates a newer record.
 * - "not found" results are cached for PUBLIC_CACHE_NEGATIVE_TTL_MS only.
 *
 * Code that writes a verification must call `invalidate(doc)` so this instance drops it at once.
 */
export class CachedVerificationReads {
  constructor(
    private readonly repo: VerificationRepository,
    private readonly caches: PublicVerificationCaches,
  ) {}

  getStatus(jobId: string) {
    return this.caches.status.getOrLoad(jobId, () => this.repo.getStatus(jobId), (s) => TERMINAL_STATUSES.includes(s.status));
  }

  findLatestByContentHash(contentHash: string) {
    const key = contentHash.toLowerCase().replace(/^sha256:/, "");
    return this.caches.contentHash.getOrLoad(key, () => this.repo.findLatestByContentHash(contentHash));
  }

  findByCertId(certId: string) {
    return this.caches.certId.getOrLoad(certId, () => this.repo.findByCertId(certId), (v) => TERMINAL_STATUSES.includes(v.status));
  }

  /** Creator history is paginated and changes with every new verification, so it is not cached. */
  listByCreator(...args: Parameters<VerificationRepository["listByCreator"]>) {
    return this.repo.listByCreator(...args);
  }

  /** Drops every cached entry that could describe `doc`. */
  invalidate(doc: Pick<VerificationDoc, "jobId" | "contentHash" | "certId">): void {
    this.caches.status.invalidate(doc.jobId);
    this.caches.contentHash.invalidate(doc.contentHash.toLowerCase().replace(/^sha256:/, ""));
    if (doc.certId) this.caches.certId.invalidate(doc.certId);
  }

  clear(): Record<string, number> {
    return {
      status: this.caches.status.clear(),
      contentHash: this.caches.contentHash.clear(),
      certId: this.caches.certId.clear(),
    };
  }

  stats(): Record<string, number> {
    return { status: this.caches.status.size, contentHash: this.caches.contentHash.size, certId: this.caches.certId.size };
  }
}
