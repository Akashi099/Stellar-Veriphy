import type { Db, ObjectId, UpdateFilter, WithId } from "mongodb";
import type { Logger } from "../lib/logger.js";
import {
  jobDuration,
  jobFailures,
  jobCheckpoints,
  jobWait,
  jobsEnqueued,
  jobsFinished,
  jobsResumed,
  jobsStalled,
  jobsStarted,
} from "../lib/metrics.js";
import { backoffDelay } from "../lib/retry.js";
import {
  Collections,
  QUEUE_NAMES,
  type JobDoc,
  type JobErrorEntry,
  type JobProgress,
  type QueueName,
} from "../db/collections.js";
import { describeError, errorCode, errorMessage, isRetryable } from "./errors.js";

const ERROR_HISTORY_LIMIT = 10;
const STALL_RECOVERY_BATCH = 100;

export interface QueueOptions {
  defaultMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  correlationId?: string;
  /** Per-attempt timeout for this job; defaults to JOB_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Selective reindex request (#854): refresh verification/provenance data for specific records. */
export interface ReindexRequest {
  /** Record ids (e.g. asset or provenance document ids) to reindex. */
  ids?: string[];
  /** Content hashes to reindex when ids are unknown. */
  hashes?: string[];
  /** Optional scope hint, e.g. "verification" or "provenance". */
  scope?: string;
  /** Operator or system that requested the reindex, for audit trails. */
  requestedBy?: string;
}

export interface ReindexEnqueueOptions {
  /** Correlation id shared by every chunk; generated when omitted. */
  correlationId?: string;
  /** Max ids/hashes per job. Defaults to REINDEX_CHUNK_SIZE. */
  chunkSize?: number;
  /** Per-attempt timeout applied to each chunk job. */
  timeoutMs?: number;
  /** Max attempts applied to each chunk job. */
  maxAttempts?: number;
  /** Delay before the first chunk becomes claimable. */
  runAt?: Date;
}

export interface ReindexEnqueueResult {
  correlationId: string;
  jobIds: ObjectId[];
  /** Total number of ids/hashes accepted for reindexing. */
  total: number;
  /** Number of chunk jobs created. */
  chunks: number;
}

const REINDEX_CHUNK_SIZE = 100;
const REINDEX_MAX_ITEMS = 10_000;
=======

export type FailOutcome = "retried" | "dead" | "lost";

/** Fields returned by operator views; excludes payload and full stack traces. */
const SUMMARY_PROJECTION = {
  queue: 1,
  type: 1,
  status: 1,
  attempts: 1,
  maxAttempts: 1,
  stalledCount: 1,
  manualRetries: 1,
  runAt: 1,
  startedAt: 1,
  finishedAt: 1,
  heartbeatAt: 1,
  lockedBy: 1,
  correlationId: 1,
  timeoutMs: 1,
  progress: 1,
  checkpointAt: 1,
  resumedCount: 1,
  "lastError.code": 1,
  "lastError.message": 1,
  "lastError.at": 1,
  "lastError.attempt": 1,
} as const;

const UNLOCK = { lockedBy: "", lockedAt: "", heartbeatAt: "" } as const;

export interface QueueStatsOptions {
  retryLoopThreshold: number;
  /** Running jobs with no heartbeat for this long are reported as overdue. */
  heartbeatOverdueMs: number;
}

export interface QueueStats {
  generatedAt: string;
  queues: Array<{
    queue: QueueName;
    ready: number;
    delayed: number;
    running: number;
    dead: number;
    oldestReadyAgeSeconds: number;
  }>;
  heartbeatOverdue: WithId<JobDoc>[];
  retryLoops: WithId<JobDoc>[];
  recentDead: WithId<JobDoc>[];
  topDeadErrors24h: Array<{ queue: string; type: string; code: string; count: number; lastSeen: Date; sampleMessage: string }>;
}

/**
 * MongoDB-backed job queue. Every state transition is a single guarded update, so concurrent
 * workers and the stall recovery loop never double-process or lose a job.
 */
export class JobQueue {
  constructor(
    private readonly db: Db,
    private readonly opts: QueueOptions,
    private readonly log: Logger,
  ) {}

  private get col() {
    return this.db.collection<JobDoc>(Collections.jobs);
  }

  async enqueue<P>(queue: QueueName, type: string, payload: P, opts: EnqueueOptions = {}): Promise<ObjectId> {
    const now = new Date();
    const doc: JobDoc<P> = {
      queue,
      type,
      payload,
      status: "queued",
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? this.opts.defaultMaxAttempts,
      runAt: opts.runAt ?? now,
      createdAt: now,
      updatedAt: now,
      errorHistory: [],
      stalledCount: 0,
      ...(opts.correlationId ? { correlationId: opts.correlationId } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    };
    const { insertedId } = await this.col.insertOne(doc as JobDoc);
    jobsEnqueued.inc({ queue, type });
    this.log.debug("job enqueued", { jobId: insertedId, queue, type, correlationId: opts.correlationId, runAt: doc.runAt });
    return insertedId;
  }

  /**
   * Operator action (#854): enqueue selective reindex jobs. The requested ids/hashes are split into
   * chunks so a single job never exceeds the handler's batch limits, and every chunk shares one
   * correlation id so callers can poll progress via `getProgress`/`findByCorrelationId`.
   */
  async enqueueReindex(request: ReindexRequest, opts: ReindexEnqueueOptions = {}): Promise<ReindexEnqueueResult> {
    const ids = dedupe(request.ids ?? []);
    const hashes = dedupe(request.hashes ?? []);
    const total = ids.length + hashes.length;
    if (total === 0) {
      throw new Error("reindex request must include at least one id or hash");
    }
    if (total > REINDEX_MAX_ITEMS) {
      throw new Error(`reindex request exceeds the ${REINDEX_MAX_ITEMS} item limit (got ${total})`);
    }

    const chunkSize = Math.max(1, opts.chunkSize ?? REINDEX_CHUNK_SIZE);
    const correlationId = opts.correlationId ?? `reindex-${new ObjectId().toHexString()}`;
    const runAt = opts.runAt ?? new Date();

    const jobIds: ObjectId[] = [];
    for (const chunk of chunkItems(ids, chunkSize)) {
      jobIds.push(
        await this.enqueue(
          "maintenance",
          "reindex",
          { ids: chunk, scope: request.scope, requestedBy: request.requestedBy },
          { correlationId, runAt, timeoutMs: opts.timeoutMs, maxAttempts: opts.maxAttempts },
        ),
      );
    }
    for (const chunk of chunkItems(hashes, chunkSize)) {
      jobIds.push(
        await this.enqueue(
          "maintenance",
          "reindex",
          { hashes: chunk, scope: request.scope, requestedBy: request.requestedBy },
          { correlationId, runAt, timeoutMs: opts.timeoutMs, maxAttempts: opts.maxAttempts },
        ),
      );
    }

    this.log.info("reindex jobs enqueued", {
      correlationId,
      requestedBy: request.requestedBy,
      scope: request.scope,
      total,
      chunks: jobIds.length,
      jobIds: jobIds.map((id) => id.toHexString()),
    });
    return { correlationId, jobIds, total, chunks: jobIds.length };
  }

  /** Atomically claims the oldest ready job on `queue`. Index: queue_status_runAt. */
  async claim(queue: QueueName, workerId: string): Promise<WithId<JobDoc> | null> {
    const now = new Date();
    const job = await this.col.findOneAndUpdate(
      { queue, status: "queued", runAt: { $lte: now } },
      {
        $set: { status: "running", lockedBy: workerId, lockedAt: now, heartbeatAt: now, startedAt: now, updatedAt: now },
        $inc: { attempts: 1 },
      },
      { sort: { runAt: 1 }, returnDocument: "after" },
    );
    if (job) {
      jobsStarted.inc({ queue, type: job.type });
      jobWait.observe({ queue, type: job.type }, Math.max(0, now.getTime() - job.runAt.getTime()) / 1000);
      if (job.checkpoint !== undefined) {
        await this.col.updateOne({ _id: job._id, lockedBy: workerId }, { $inc: { resumedCount: 1 } });
        job.resumedCount = (job.resumedCount ?? 0) + 1;
        jobsResumed.inc({ queue, type: job.type });
        this.log.info("job resuming from checkpoint", this.jobFields(job, { workerId, checkpointAt: job.checkpointAt }));
      }
    }
    return job;
  }

  /**
   * Records handler progress (#781). Also counts as a heartbeat. Returns false if this worker no
   * longer owns the job.
   */
  async updateProgress(id: ObjectId, workerId: string, progress: Omit<JobProgress, "updatedAt">): Promise<boolean> {
    const now = new Date();
    const res = await this.col.updateOne(
      { _id: id, status: "running", lockedBy: workerId },
      { $set: { progress: { ...progress, updatedAt: now }, heartbeatAt: now } },
    );
    return res.matchedCount === 1;
  }

  /**
   * Persists resume state for the next attempt (#781). The checkpoint survives failures, timeouts and
   * stall recovery, and is cleared when the job succeeds. Returns false if the lock was lost.
   */
  async saveCheckpoint(job: WithId<JobDoc>, workerId: string, checkpoint: unknown): Promise<boolean> {
    const now = new Date();
    const res = await this.col.updateOne(
      { _id: job._id, status: "running", lockedBy: workerId },
      { $set: { checkpoint, checkpointAt: now, heartbeatAt: now } },
    );
    if (res.matchedCount === 1) jobCheckpoints.inc({ queue: job.queue, type: job.type });
    return res.matchedCount === 1;
  }

  /** Returns false if this worker no longer owns the job (it was recovered as stalled). */
  async heartbeat(id: ObjectId, workerId: string): Promise<boolean> {
    const res = await this.col.updateOne(
      { _id: id, status: "running", lockedBy: workerId },
      { $set: { heartbeatAt: new Date() } },
    );
    return res.matchedCount === 1;
  }

  async complete(job: WithId<JobDoc>, workerId: string, durationMs: number): Promise<boolean> {
    const now = new Date();
    const res = await this.col.updateOne(
      { _id: job._id, status: "running", lockedBy: workerId },
      { $set: { status: "succeeded", finishedAt: now, updatedAt: now }, $unset: { ...UNLOCK, checkpoint: "", checkpointAt: "" } },
    );
    if (res.matchedCount === 0) {
      this.log.warn("job finished after its lock was lost; result not recorded", this.jobFields(job, { workerId }));
      return false;
    }
    jobsFinished.inc({ queue: job.queue, type: job.type, outcome: "succeeded" });
    jobDuration.observe({ queue: job.queue, type: job.type, outcome: "succeeded" }, durationMs / 1000);
    return true;
  }

  async fail(job: WithId<JobDoc>, workerId: string, err: unknown, durationMs: number): Promise<FailOutcome> {
    const now = new Date();
    const entry: JobErrorEntry = {
      attempt: job.attempts,
      at: now,
      workerId,
      durationMs: Math.round(durationMs),
      code: errorCode(err),
      message: errorMessage(err).slice(0, 2_000),
      ...(err instanceof Error && err.stack ? { stack: err.stack.slice(0, 4_000) } : {}),
    };
    const retryable = isRetryable(err);
    const dead = !retryable || job.attempts >= job.maxAttempts;
    const retryDelayMs = dead ? 0 : backoffDelay(job.attempts, this.opts.retryBaseDelayMs, this.opts.retryMaxDelayMs);

    const res = await this.col.updateOne(
      { _id: job._id, status: "running", lockedBy: workerId },
      this.failureUpdate(entry, dead, retryDelayMs, now),
    );
    const fields = this.jobFields(job, { workerId, ...describeError(err), durationMs: entry.durationMs });
    if (res.matchedCount === 0) {
      this.log.warn("job failed after its lock was lost; failure not recorded", fields);
      return "lost";
    }

    const outcome = dead ? "dead" : "retried";
    jobFailures.inc({ queue: job.queue, type: job.type, code: entry.code });
    jobsFinished.inc({ queue: job.queue, type: job.type, outcome });
    jobDuration.observe({ queue: job.queue, type: job.type, outcome }, durationMs / 1000);

    if (dead) {
      this.log.error("job moved to dead-letter", {
        ...fields,
        deadReason: retryable ? "attempts_exhausted" : "non_retryable_error",
        err,
      });
    } else {
      this.log.warn("job attempt failed, will retry", { ...fields, retryInMs: retryDelayMs, err });
    }
    return outcome;
  }

  /**
   * Requeues (or dead-letters) running jobs whose worker stopped heartbeating — crashed pods,
   * OOM kills, hung handlers. Index: running_heartbeatAt.
   */
  async recoverStalled(stallTimeoutMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - stallTimeoutMs);
    const stalled = await this.col
      .find({ status: "running", heartbeatAt: { $lt: cutoff } }, { projection: { payload: 0, errorHistory: 0 } })
      .limit(STALL_RECOVERY_BATCH)
      .toArray();

    let recovered = 0;
    for (const job of stalled) {
      const now = new Date();
      const entry: JobErrorEntry = {
        attempt: job.attempts,
        at: now,
        workerId: job.lockedBy ?? "unknown",
        durationMs: job.startedAt ? now.getTime() - job.startedAt.getTime() : 0,
        code: "STALLED",
        message: `No heartbeat from worker ${job.lockedBy ?? "unknown"} since ${job.heartbeatAt?.toISOString()}; presumed crashed or hung`,
      };
      const dead = job.attempts >= job.maxAttempts;
      const update = this.failureUpdate(entry, dead, dead ? 0 : this.opts.retryBaseDelayMs, now);
      update.$inc = { stalledCount: 1 };

      // Guard on heartbeatAt so a worker that just heartbeated (or another recoverer) wins the race.
      const res = await this.col.updateOne({ _id: job._id, status: "running", heartbeatAt: job.heartbeatAt }, update);
      if (res.modifiedCount === 0) continue;

      recovered++;
      const outcome = dead ? "dead" : "retried";
      jobsStalled.inc({ queue: job.queue, type: job.type });
      jobFailures.inc({ queue: job.queue, type: job.type, code: "STALLED" });
      jobsFinished.inc({ queue: job.queue, type: job.type, outcome });
      this.log.warn(dead ? "stalled job moved to dead-letter" : "stalled job requeued", {
        ...this.jobFields(job),
        errorCode: "STALLED",
        error: "worker stopped heartbeating; job lock expired",
        retryable: true,
        lockedBy: job.lockedBy,
        lastHeartbeatAt: job.heartbeatAt,
        stalledCount: job.stalledCount + 1,
      });
    }
    return recovered;
  }

  /**
   * Operator action: put a dead job back on its queue with a fresh attempt budget. By default it
   * resumes from its last checkpoint; `fresh` discards the checkpoint and starts over.
   */
  async retryDead(id: ObjectId, requestedBy: string, { fresh = false }: { fresh?: boolean } = {}): Promise<boolean> {
    const now = new Date();
    const unset: Record<string, ""> = { finishedAt: "" };
    if (fresh) Object.assign(unset, { checkpoint: "", checkpointAt: "", progress: "" });
    const job = await this.col.findOneAndUpdate(
      { _id: id, status: "dead" },
      { $set: { status: "queued", runAt: now, updatedAt: now, attempts: 0 }, $unset: unset, $inc: { manualRetries: 1 } },
      { projection: { payload: 0, errorHistory: 0, checkpoint: 0 }, returnDocument: "after" },
    );
    if (!job) return false;
    this.log.info("dead job requeued by operator", {
      ...this.jobFields(job),
      requestedBy,
      manualRetries: job.manualRetries,
      fresh,
      resumeFrom: fresh ? undefined : job.checkpointAt,
    });
    return true;
  }

  /**
   * Latest job for a correlation id (e.g. a verification jobId) with its progress, for status
   * polling. Index: correlationId.
   */
  getProgress(correlationId: string) {
    return this.col.findOne(
      { correlationId },
      {
        sort: { createdAt: -1 },
        projection: {
          _id: 0,
          type: 1,
          status: 1,
          attempts: 1,
          maxAttempts: 1,
          runAt: 1,
          startedAt: 1,
          finishedAt: 1,
          progress: 1,
          checkpointAt: 1,
          resumedCount: 1,
          "lastError.code": 1,
        },
      },
    );
  }

  getJob(id: ObjectId) {
    return this.col.findOne({ _id: id });
  }

  /** Index: correlationId */
  findByCorrelationId(correlationId: string) {
    return this.col.find({ correlationId }, { projection: SUMMARY_PROJECTION }).sort({ createdAt: 1 }).limit(100).toArray();
  }

  async stats(opts: QueueStatsOptions): Promise<QueueStats> {
    const now = new Date();

    const queues = await Promise.all(
      QUEUE_NAMES.map(async (queue) => {
        const [queued, ready, running, dead, oldest] = await Promise.all([
          this.col.countDocuments({ queue, status: "queued" }),
          this.col.countDocuments({ queue, status: "queued", runAt: { $lte: now } }),
          this.col.countDocuments({ queue, status: "running" }),
          this.col.countDocuments({ queue, status: "dead" }),
          this.col.findOne({ queue, status: "queued", runAt: { $lte: now } }, { sort: { runAt: 1 }, projection: { runAt: 1 } }),
        ]);
        return {
          queue,
          ready,
          delayed: queued - ready,
          running,
          dead,
          oldestReadyAgeSeconds: oldest ? Math.round((now.getTime() - oldest.runAt.getTime()) / 1000) : 0,
        };
      }),
    );

    const [heartbeatOverdue, retryLoops, recentDead, topDeadErrors24h] = await Promise.all([
      this.col
        .find({ status: "running", heartbeatAt: { $lt: new Date(now.getTime() - opts.heartbeatOverdueMs) } }, { projection: SUMMARY_PROJECTION })
        .limit(50)
        .toArray(),
      this.col
        .find(
          {
            queue: { $in: [...QUEUE_NAMES] },
            status: { $in: ["queued", "running"] },
            $or: [{ attempts: { $gte: opts.retryLoopThreshold } }, { stalledCount: { $gte: 2 } }],
          },
          { projection: SUMMARY_PROJECTION },
        )
        .sort({ attempts: -1 })
        .limit(50)
        .toArray(),
      this.col.find({ status: "dead" }, { projection: SUMMARY_PROJECTION }).sort({ finishedAt: -1 }).limit(20).toArray(),
      this.col
        .aggregate<QueueStats["topDeadErrors24h"][number]>([
          { $match: { status: "dead", finishedAt: { $gte: new Date(now.getTime() - 24 * 3_600_000) } } },
          {
            $group: {
              _id: { queue: "$queue", type: "$type", code: "$lastError.code" },
              count: { $sum: 1 },
              lastSeen: { $max: "$finishedAt" },
              sampleMessage: { $last: "$lastError.message" },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 20 },
          { $project: { _id: 0, queue: "$_id.queue", type: "$_id.type", code: "$_id.code", count: 1, lastSeen: 1, sampleMessage: 1 } },
        ])
        .toArray(),
    ]);

    return { generatedAt: now.toISOString(), queues, heartbeatOverdue, retryLoops, recentDead, topDeadErrors24h };
  }

  private failureUpdate(entry: JobErrorEntry, dead: boolean, retryDelayMs: number, now: Date): UpdateFilter<JobDoc> {
    const push = { errorHistory: { $each: [entry], $slice: -ERROR_HISTORY_LIMIT } };
    return dead
      ? { $set: { status: "dead", finishedAt: now, updatedAt: now, lastError: entry }, $unset: UNLOCK, $push: push }
      : {
          $set: { status: "queued", runAt: new Date(now.getTime() + retryDelayMs), updatedAt: now, lastError: entry },
          $unset: UNLOCK,
          $push: push,
        };
  }

  private jobFields(job: WithId<JobDoc>, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      jobId: job._id.toHexString(),
      queue: job.queue,
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      correlationId: job.correlationId,
      ...extra,
    };
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter((v) => typeof v === "string" && v.length > 0))];
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
