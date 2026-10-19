import type { WithId } from "mongodb";
import type { Logger } from "../lib/logger.js";
import { sleep } from "../lib/retry.js";
import type { JobDoc, JobProgress, QueueName } from "../db/collections.js";
import { JobError, describeError } from "./errors.js";
import type { JobQueue } from "./queue.js";

export interface JobContext {
  /** Pre-bound with jobId, queue, type, attempt, correlationId and workerId. */
  log: Logger;
  /** Aborted on timeout or when the job's lock is lost; long-running handlers should honour it. */
  signal: AbortSignal;
  /**
   * Resume state saved by an earlier attempt via saveCheckpoint, or undefined on a fresh start.
   * Handlers should skip work the checkpoint says is done (#781).
   */
  checkpoint: unknown;
  /** Publishes progress to the job document (and counts as a heartbeat). Never throws. */
  reportProgress(progress: Omit<JobProgress, "updatedAt">): Promise<void>;
  /**
   * Persists resume state so an interrupted attempt (crash, timeout, transient error) continues from
   * here. Keep it small: ids, offsets, completed step names. Throws if the job's lock was lost.
   */
  saveCheckpoint(checkpoint: unknown): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JobHandler<P = any> = (job: WithId<JobDoc<P>>, ctx: JobContext) => Promise<void>;
export type HandlerMap = Record<string, JobHandler>;

export interface WorkerOptions {
  concurrency: number;
  pollIntervalMs: number;
  heartbeatMs: number;
  jobTimeoutMs: number;
}

function runWithTimeout(work: Promise<void>, ms: number, controller: AbortController): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new JobError(`Job exceeded timeout of ${ms}ms`, "TIMEOUT"));
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Polls one queue with `concurrency` independent slots. */
export class Worker {
  private stopping = false;
  private readonly idle = new AbortController();
  private loops: Promise<void>[] = [];

  constructor(
    private readonly queue: JobQueue,
    private readonly queueName: QueueName,
    private readonly handlers: HandlerMap,
    private readonly opts: WorkerOptions,
    private readonly instanceId: string,
    private readonly log: Logger,
  ) {}

  start(): void {
    for (let slot = 0; slot < this.opts.concurrency; slot++) {
      this.loops.push(this.loop(`${this.instanceId}/${this.queueName}/${slot}`));
    }
    this.log.info("worker started", { concurrency: this.opts.concurrency, types: Object.keys(this.handlers) });
  }

  /** Stops claiming new jobs and waits for in-flight jobs to finish. */
  async stop(): Promise<void> {
    this.stopping = true;
    this.idle.abort();
    await Promise.allSettled(this.loops);
    this.log.info("worker stopped");
  }

  private async loop(workerId: string): Promise<void> {
    let claimFailures = 0;
    while (!this.stopping) {
      let job: WithId<JobDoc> | null;
      try {
        job = await this.queue.claim(this.queueName, workerId);
        claimFailures = 0;
      } catch (err) {
        claimFailures++;
        this.log.error("failed to claim job", { workerId, claimFailures, err });
        await sleep(Math.min(30_000, this.opts.pollIntervalMs * 2 ** claimFailures), this.idle.signal);
        continue;
      }
      if (!job) {
        await sleep(this.opts.pollIntervalMs, this.idle.signal);
        continue;
      }
      await this.process(job, workerId);
    }
  }

  private async process(job: WithId<JobDoc>, workerId: string): Promise<void> {
    const log = this.log.child({
      jobId: job._id.toHexString(),
      type: job.type,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      correlationId: job.correlationId,
      workerId,
    });
    const controller = new AbortController();
    const started = performance.now();

    const heartbeat = setInterval(() => {
      this.queue
        .heartbeat(job._id, workerId)
        .then((owned) => {
          if (!owned && !controller.signal.aborted) {
            log.warn("lost job lock (recovered as stalled by another process); aborting handler");
            controller.abort();
          }
        })
        .catch((err) => log.warn("heartbeat failed", { err }));
    }, this.opts.heartbeatMs);

    log.info("job started", {
      waitedMs: Date.now() - job.runAt.getTime(),
      resumed: job.checkpoint !== undefined,
      timeoutMs: job.timeoutMs ?? this.opts.jobTimeoutMs,
    });
    try {
      const handler = this.handlers[job.type];
      if (!handler) {
        throw new JobError(`No handler registered for job type "${job.type}" on queue "${job.queue}"`, "NO_HANDLER", false);
      }
      const ctx: JobContext = {
        log,
        signal: controller.signal,
        checkpoint: job.checkpoint,
        reportProgress: async (progress) => {
          try {
            if (!(await this.queue.updateProgress(job._id, workerId, progress))) controller.abort();
          } catch (err) {
            log.warn("progress update failed", { err });
          }
        },
        saveCheckpoint: async (checkpoint) => {
          if (!(await this.queue.saveCheckpoint(job, workerId, checkpoint))) {
            controller.abort();
            throw new JobError("Lost job lock while saving checkpoint", "LOCK_LOST");
          }
          log.debug("checkpoint saved");
        },
      };
      await runWithTimeout(handler(job, ctx), job.timeoutMs ?? this.opts.jobTimeoutMs, controller);
      const durationMs = performance.now() - started;
      if (await this.queue.complete(job, workerId, durationMs)) {
        log.info("job succeeded", { durationMs: Math.round(durationMs) });
      }
    } catch (err) {
      try {
        await this.queue.fail(job, workerId, err, performance.now() - started);
      } catch (recordErr) {
        log.error("could not record job failure; stall recovery will requeue it", { ...describeError(err), err: recordErr });
      }
    } finally {
      clearInterval(heartbeat);
    }
  }
}
