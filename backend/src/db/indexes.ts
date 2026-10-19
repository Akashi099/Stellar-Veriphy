import type { Db, IndexDescription } from "mongodb";
import type { Logger } from "../lib/logger.js";
import { Collections } from "./collections.js";

export interface IndexSpec extends IndexDescription {
  name: string;
  /** The query this index serves. Kept in sync with docs/operations/database-indexes.md. */
  serves: string;
}

/**
 * Source of truth for every non-_id index. Applied idempotently on startup and by `pnpm db:indexes`.
 * Field order follows Equality → Sort → Range so each query uses a single bounded index scan.
 */
export const INDEXES: Record<string, IndexSpec[]> = {
  [Collections.verifications]: [
    {
      name: "jobId_unique",
      key: { jobId: 1 },
      unique: true,
      serves: "VerificationRepository.getStatus — status polling by jobId (hottest read path)",
    },
    {
      name: "contentHash_createdAt",
      key: { contentHash: 1, createdAt: -1 },
      serves: "VerificationRepository.findLatestByContentHash — 'has this media been verified?'",
    },
    {
      name: "creator_createdAt",
      key: { creator: 1, createdAt: -1 },
      serves: "VerificationRepository.listByCreator — creator history, keyset-paginated newest first",
    },
    {
      name: "status_updatedAt",
      key: { status: 1, updatedAt: 1 },
      serves: "VerificationRepository.findStale + retention safety check on active verifications",
    },
    {
      name: "certId_unique",
      key: { certId: 1 },
      unique: true,
      partialFilterExpression: { certId: { $exists: true } },
      serves: "VerificationRepository.findByCertId — certificate lookup; partial so uncertified docs cost nothing",
    },
    {
      name: "storageRef",
      key: { storageRef: 1 },
      serves: "OrphanMediaCleaner — is this stored media file referenced by a verification?",
    },
  ],

  [Collections.sessions]: [
    {
      name: "sessionId_unique",
      key: { sessionId: 1 },
      unique: true,
      serves: "SessionRepository.touch / point lookups by sessionId",
    },
    {
      name: "creator_state_lastActivityAt",
      key: { creator: 1, state: 1, lastActivityAt: -1 },
      serves: "SessionRepository.findOpenForCreator — resume the creator's most recent open session",
    },
    {
      name: "verificationJobId",
      key: { verificationJobId: 1 },
      partialFilterExpression: { verificationJobId: { $exists: true } },
      serves: "SessionRepository.markCompletedByJobId — close the session when its verification finishes",
    },
    {
      name: "state_lastActivityAt",
      key: { state: 1, lastActivityAt: 1 },
      serves: "RetentionCleaner — find stale sessions by state and idle time",
    },
    {
      name: "tempUploadRef",
      key: { tempUploadRef: 1 },
      partialFilterExpression: { tempUploadRef: { $exists: true } },
      serves: "OrphanMediaCleaner — is this stored media file a session's temporary upload?",
    },
  ],

  [Collections.sessionsArchive]: [
    {
      name: "archivedAt",
      key: { archivedAt: 1 },
      serves: "RetentionCleaner — purge archived sessions past the archive window",
    },
    {
      name: "sessionId",
      key: { sessionId: 1 },
      serves: "Operator lookup / restore of an archived session",
    },
    {
      name: "tempUploadRef",
      key: { tempUploadRef: 1 },
      partialFilterExpression: { tempUploadRef: { $exists: true } },
      serves: "OrphanMediaCleaner — keep uploads of archived sessions while they can still be restored",
    },
  ],

  [Collections.jobs]: [
    {
      name: "queue_status_runAt",
      key: { queue: 1, status: 1, runAt: 1 },
      serves: "JobQueue.claim (oldest ready job per queue) and per-queue state counts",
    },
    {
      name: "running_heartbeatAt",
      key: { status: 1, heartbeatAt: 1 },
      partialFilterExpression: { status: "running" },
      serves: "JobQueue.recoverStalled / overdue heartbeat detection; partial: only running jobs indexed",
    },
    {
      name: "status_finishedAt",
      key: { status: 1, finishedAt: 1 },
      serves: "Recent dead jobs for operators and retention purge of finished jobs",
    },
    {
      name: "correlationId",
      key: { correlationId: 1 },
      partialFilterExpression: { correlationId: { $exists: true } },
      serves: "Trace all jobs for a verification (GET /admin/jobs?correlationId=)",
    },
  ],

  [Collections.webhookDeliveries]: [
    {
      name: "idempotencyKey_unique",
      key: { idempotencyKey: 1 },
      unique: true,
      serves: "WebhookService.publish — one delivery per (event, endpoint); duplicate publishes are rejected",
    },
    {
      name: "status_updatedAt",
      key: { status: 1, updatedAt: -1 },
      serves: "WebhookService.listDeliveries — failed/pending deliveries for operators, newest first; status counts",
    },
    {
      name: "eventId",
      key: { eventId: 1 },
      serves: "WebhookService.listDeliveries?eventId= — every delivery of one event",
    },
  ],
};

/** MongoDB error codes raised when an index exists with the same name/key but different options. */
const INDEX_CONFLICT_CODES = new Set([85, 86]);

export interface EnsureIndexesReport {
  conflicts: Array<{ collection: string; index: string; message: string }>;
  /** Indexes present in the database but not declared above (drift). */
  unexpected: Array<{ collection: string; index: string }>;
}

export async function ensureIndexes(db: Db, log: Logger): Promise<EnsureIndexesReport> {
  const report: EnsureIndexesReport = { conflicts: [], unexpected: [] };

  for (const [collection, specs] of Object.entries(INDEXES)) {
    const col = db.collection(collection);
    for (const { key, serves: _serves, ...options } of specs) {
      try {
        await col.createIndex(key, options);
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code === undefined || !INDEX_CONFLICT_CODES.has(code)) throw err;
        const message = (err as Error).message;
        report.conflicts.push({ collection, index: options.name!, message });
        log.error("index definition conflicts with existing index; drop it and re-run `pnpm db:indexes`", {
          collection,
          index: options.name,
          err,
        });
      }
    }

    const declared = new Set(specs.map((s) => s.name));
    for (const existing of await col.listIndexes().toArray()) {
      if (existing.name !== "_id_" && !declared.has(existing.name)) {
        report.unexpected.push({ collection, index: existing.name });
      }
    }
  }

  if (report.unexpected.length > 0) {
    log.warn("database has indexes not declared in src/db/indexes.ts", { unexpected: report.unexpected });
  }
  log.info("indexes ensured", { collections: Object.keys(INDEXES).length, conflicts: report.conflicts.length });
  return report;
}
