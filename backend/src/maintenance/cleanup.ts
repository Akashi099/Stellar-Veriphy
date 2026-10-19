import type { Db, Filter, ObjectId } from "mongodb";
import type { Config } from "../config.js";
import type { Logger } from "../lib/logger.js";
import { cleanupDuration, cleanupLastSuccess, cleanupRecords, cleanupRuns } from "../lib/metrics.js";
import {
  Collections,
  type ArchivedSessionDoc,
  type SessionState,
  type VerificationDoc,
  type VerificationSessionDoc,
  type VerificationStatus,
} from "../db/collections.js";
import type { OrphanMediaCleaner } from "./orphans.js";
import { assertRetentionDeletable } from "./protection.js";

export type RetentionPolicy = Config["retention"];

export interface CleanupTaskReport {
  task: string;
  dryRun: boolean;
  /** Dry run only: how many records currently match the rule. */
  matched?: number;
  archived: number;
  deleted: number;
  /** Sessions that matched but were kept because their verification is still in flight. */
  skippedActive: number;
  /** True when the per-run batch limit was hit; the remainder is handled next run. */
  truncated: boolean;
  /** Orphaned media only: storage objects examined this run. */
  scanned?: number;
  durationMs: number;
  error?: string;
}

type TaskResult = Omit<CleanupTaskReport, "task" | "dryRun" | "durationMs">;

/** Sessions in these states are idle working state and can be archived after RETENTION_IDLE_SESSION_HOURS. */
const IDLE_SESSION_STATES: SessionState[] = ["open", "abandoned", "expired"];
/** A session linked to a verification in one of these states is never archived. */
const ACTIVE_VERIFICATION_STATES: VerificationStatus[] = ["pending", "processing"];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Applies the retention rules in docs/operations/data-retention.md.
 *
 * Never touched: the verifications collection (user-facing records and certificates), sessions in
 * the "submitted" state, and any session whose linked verification is still pending/processing.
 * The first is enforced in code: every delete checks RETENTION_DELETABLE_COLLECTIONS (protection.ts).
 * Sessions are archived (copied, then deleted) rather than deleted outright, and archives are only
 * purged after RETENTION_ARCHIVE_DAYS.
 */
export class RetentionCleaner {
  constructor(
    private readonly db: Db,
    private readonly policy: RetentionPolicy,
    private readonly log: Logger,
    /** Set when MEDIA_STORAGE_DIR is configured and orphan cleanup is enabled (#782). */
    private readonly orphans?: OrphanMediaCleaner,
  ) {}

  async run({ dryRun = false }: { dryRun?: boolean } = {}): Promise<CleanupTaskReport[]> {
    const now = Date.now();
    const p = this.policy;

    const tasks: Array<[string, () => Promise<TaskResult>]> = [
      [
        "archive_idle_sessions",
        () =>
          this.archiveSessions(
            { state: { $in: IDLE_SESSION_STATES }, lastActivityAt: { $lt: new Date(now - p.idleSessionHours * HOUR_MS) } },
            "idle",
            dryRun,
          ),
      ],
      [
        "archive_completed_sessions",
        () =>
          this.archiveSessions(
            { state: "completed", lastActivityAt: { $lt: new Date(now - p.completedSessionDays * DAY_MS) } },
            "completed",
            dryRun,
          ),
      ],
      [
        "purge_session_archive",
        () => this.purge(Collections.sessionsArchive, { archivedAt: { $lt: new Date(now - p.archiveDays * DAY_MS) } }, dryRun),
      ],
      [
        "purge_succeeded_jobs",
        () =>
          this.purge(Collections.jobs, { status: "succeeded", finishedAt: { $lt: new Date(now - p.succeededJobDays * DAY_MS) } }, dryRun),
      ],
      [
        "purge_dead_jobs",
        () => this.purge(Collections.jobs, { status: "dead", finishedAt: { $lt: new Date(now - p.deadJobDays * DAY_MS) } }, dryRun),
      ],
    ];
    const orphans = this.orphans;
    if (orphans) {
      // Runs after the session tasks, so uploads of just-archived sessions are still protected by the archive.
      tasks.push([
        "purge_orphaned_media",
        async () => {
          const result = await orphans.run({ dryRun });
          return {
            ...(dryRun ? { matched: result.orphaned.length } : {}),
            archived: 0,
            deleted: result.deleted,
            skippedActive: result.referenced,
            truncated: result.truncated,
            scanned: result.scanned,
          };
        },
      ]);
    }

    const reports: CleanupTaskReport[] = [];
    for (const [task, execute] of tasks) {
      const started = performance.now();
      try {
        const result = await execute();
        const durationMs = Math.round(performance.now() - started);
        const report: CleanupTaskReport = { task, dryRun, durationMs, ...result };
        reports.push(report);

        if (!dryRun) {
          cleanupRuns.inc({ task, outcome: "success" });
          cleanupDuration.observe({ task }, durationMs / 1000);
          cleanupLastSuccess.set({ task }, Math.floor(Date.now() / 1000));
          if (result.archived) cleanupRecords.inc({ task, action: "archived" }, result.archived);
          if (result.deleted) cleanupRecords.inc({ task, action: "deleted" }, result.deleted);
        }
        this.log.info(dryRun ? "retention task dry run" : "retention task completed", { ...report });
        if (result.truncated) {
          this.log.warn("retention backlog exceeds per-run limit; remainder will be processed next run", {
            task,
            batchSize: p.batchSize,
            maxBatchesPerRun: p.maxBatchesPerRun,
          });
        }
      } catch (err) {
        const durationMs = Math.round(performance.now() - started);
        reports.push({ task, dryRun, archived: 0, deleted: 0, skippedActive: 0, truncated: false, durationMs, error: String(err) });
        if (!dryRun) cleanupRuns.inc({ task, outcome: "failure" });
        // Keep going: one failing rule should not block the others. Each step is idempotent, so the next run resumes safely.
        this.log.error("retention task failed", { task, durationMs, err });
      }
    }
    return reports;
  }

  /**
   * Copy-then-delete in batches. The delete re-applies the staleness filter, so a session that
   * becomes active between the copy and the delete is kept and its archive copy is removed.
   */
  private async archiveSessions(
    filter: Filter<VerificationSessionDoc>,
    reason: ArchivedSessionDoc["archiveReason"],
    dryRun: boolean,
  ): Promise<TaskResult> {
    assertRetentionDeletable(Collections.sessions);
    assertRetentionDeletable(Collections.sessionsArchive);

    const sessions = this.db.collection<VerificationSessionDoc>(Collections.sessions);
    const archive = this.db.collection<ArchivedSessionDoc>(Collections.sessionsArchive);
    const verifications = this.db.collection<VerificationDoc>(Collections.verifications);

    if (dryRun) {
      return { matched: await sessions.countDocuments(filter), archived: 0, deleted: 0, skippedActive: 0, truncated: false };
    }

    let archived = 0;
    let truncated = true;
    const protectedIds: ObjectId[] = [];

    for (let batch = 0; batch < this.policy.maxBatchesPerRun; batch++) {
      const candidates = await sessions
        .find(protectedIds.length ? { $and: [filter, { _id: { $nin: protectedIds } }] } : filter)
        .sort({ lastActivityAt: 1 })
        .limit(this.policy.batchSize)
        .toArray();
      if (candidates.length === 0) {
        truncated = false;
        break;
      }

      const linkedJobIds = candidates.map((s) => s.verificationJobId).filter((id): id is string => Boolean(id));
      const activeJobIds = new Set(
        linkedJobIds.length === 0
          ? []
          : (
              await verifications
                .find({ jobId: { $in: linkedJobIds }, status: { $in: ACTIVE_VERIFICATION_STATES } }, { projection: { jobId: 1 } })
                .toArray()
            ).map((v) => v.jobId),
      );

      const toArchive = candidates.filter((s) => {
        const active = s.verificationJobId !== undefined && activeJobIds.has(s.verificationJobId);
        if (active) protectedIds.push(s._id);
        return !active;
      });

      if (toArchive.length > 0) {
        const archivedAt = new Date();
        await archive.bulkWrite(
          toArchive.map(({ _id, ...session }) => ({
            replaceOne: { filter: { _id }, replacement: { ...session, archivedAt, archiveReason: reason }, upsert: true },
          })),
          { ordered: false },
        );

        const ids = toArchive.map((s) => s._id);
        const { deletedCount } = await sessions.deleteMany({ $and: [filter, { _id: { $in: ids } }] });
        if (deletedCount < ids.length) {
          const survivors = await sessions.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray();
          if (survivors.length > 0) await archive.deleteMany({ _id: { $in: survivors.map((s) => s._id) } });
        }
        archived += deletedCount;
      }

      if (candidates.length < this.policy.batchSize) {
        truncated = false;
        break;
      }
    }

    if (protectedIds.length > 0) {
      this.log.info("kept stale sessions linked to in-flight verifications", { reason, count: protectedIds.length });
    }
    return { archived, deleted: 0, skippedActive: protectedIds.length, truncated };
  }

  /** Batched delete by _id so large purges never hold one long-running operation. */
  private async purge(collection: string, filter: Filter<Record<string, unknown>>, dryRun: boolean): Promise<TaskResult> {
    assertRetentionDeletable(collection);
    const col = this.db.collection(collection);
    if (dryRun) {
      return { matched: await col.countDocuments(filter), archived: 0, deleted: 0, skippedActive: 0, truncated: false };
    }

    let deleted = 0;
    let truncated = true;
    for (let batch = 0; batch < this.policy.maxBatchesPerRun; batch++) {
      const ids = (await col.find(filter, { projection: { _id: 1 } }).limit(this.policy.batchSize).toArray()).map((d) => d._id);
      if (ids.length === 0) {
        truncated = false;
        break;
      }
      const res = await col.deleteMany({ $and: [filter, { _id: { $in: ids } }] });
      deleted += res.deletedCount;
      if (ids.length < this.policy.batchSize) {
        truncated = false;
        break;
      }
    }
    return { archived: 0, deleted, skippedActive: 0, truncated };
  }
}
