import type { QueueName } from "../db/collections.js";
import type { HandlerMap } from "./worker.js";

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
export const jobHandlers: Partial<Record<QueueName, HandlerMap>> = {};
