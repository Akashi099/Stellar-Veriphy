import type { QueueName } from "../db/collections.js";
import { WEBHOOK_JOB_TYPE, type WebhookService } from "../webhooks/service.js";
import { JobError, type HandlerMap } from "./worker.js";

export const REINDEX_JOB_TYPE = "reindex";

/** Batch size used when reindexing records; also the checkpoint granularity. */
const REINDEX_BATCH_SIZE = 100;

export interface ReindexJobPayload {
  /** Record ids to reindex. When omitted, all records of the given kind are reindexed. */
  ids?: string[];
  /** Optional filter limiting which records are reindexed. */
  kind?: "verification" | "provenance";
}

export interface ReindexStore {
  /** Load the ids targeted by a reindex request (resolves filters / defaults). */
  resolveTargets(payload: ReindexJobPayload): Promise<string[]>;
  /** Refresh verification/provenance data for a single record. */
  refreshRecord(id: string): Promise<void>;
}

export interface JobHandlerDeps {
  webhooks: WebhookService;
  reindex: ReindexStore;
}

/**
 * Job handlers by queue and job type. A worker is started only for queues listed here, so jobs
 * enqueued for a queue with no handlers wait (visible as sv_jobs{state="ready"}) instead of being
 * dead-lettered. Throw JobError(message, code, retryable) from handlers for traceable failures.
 *
 * Example:
 *   verification: {
 *     "submit-attestation": async (job, { log, signal }) => { ... },
 *   },
 *
 * Long-running handlers (#781) should report progress and checkpoint after each unit of work so an
 * interrupted attempt resumes instead of reprocessing everything:
 *
 *   "verify-media": async (job, { signal, checkpoint, reportProgress, saveCheckpoint }) => {
 *     const done = (checkpoint as { chunk: number } | undefined)?.chunk ?? 0;
 *     for (let chunk = done; chunk < total; chunk++) {
 *       if (signal.aborted) throw new JobError("aborted", "ABORTED");
 *       await processChunk(chunk);
 *       await saveCheckpoint({ chunk: chunk + 1 });
 *       await reportProgress({ stage: "hashing", completed: chunk + 1, total, percent: ((chunk + 1) / total) * 100 });
 *     }
 *   },
 */
export function buildJobHandlers({ webhooks, reindex }: JobHandlerDeps): Partial<Record<QueueName, HandlerMap>> {
  return {
    notification: {
      // #789 — outbound webhook delivery; retries come from the queue's backoff.
      [WEBHOOK_JOB_TYPE]: (job, ctx) => webhooks.deliver(job, ctx),
    },
    reindex: {
      // #854 — selective record reindexing; resumes from the last checkpointed batch.
      [REINDEX_JOB_TYPE]: async (job, { signal, checkpoint, reportProgress, saveCheckpoint }) => {
        const payload = (job.data ?? {}) as ReindexJobPayload;
        const targets = await reindex.resolveTargets(payload);
        const total = targets.length;

        const done = (checkpoint as { offset: number } | undefined)?.offset ?? 0;
        if (done > total) {
          throw new JobError("checkpoint offset exceeds target count", "INVALID_CHECKPOINT");
        }

        await reportProgress({ stage: "reindexing", completed: done, total, percent: total === 0 ? 100 : (done / total) * 100 });

        for (let offset = done; offset < total; offset += REINDEX_BATCH_SIZE) {
          if (signal.aborted) throw new JobError("aborted", "ABORTED");

          const batch = targets.slice(offset, offset + REINDEX_BATCH_SIZE);
          for (const id of batch) {
            if (signal.aborted) throw new JobError("aborted", "ABORTED");
            await reindex.refreshRecord(id);
          }

          const completed = offset + batch.length;
          await saveCheckpoint({ offset: completed });
          await reportProgress({
            stage: "reindexing",
            completed,
            total,
            percent: total === 0 ? 100 : (completed / total) * 100,
          });
        }
      },
    },
  };
}
