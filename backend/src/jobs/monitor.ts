import type { Logger } from "../lib/logger.js";
import { jobOldestReadyAge, jobsHeartbeatOverdue, jobsInState, jobsRetryLoopSuspects } from "../lib/metrics.js";
import { QUEUE_NAMES } from "../db/collections.js";
import type { JobQueue } from "./queue.js";

export interface QueueMonitorOptions {
  monitorIntervalMs: number;
  stallTimeoutMs: number;
  heartbeatMs: number;
  retryLoopThreshold: number;
}

/**
 * Periodically recovers stalled jobs and samples queue state into gauges.
 * Safe to run on every instance: recovery updates are guarded and gauges are per-instance samples
 * of the same shared data (aggregate with max() in queries).
 */
export class QueueMonitor {
  private timer?: NodeJS.Timeout;
  private running = false;
  /** jobId:attempt pairs already reported, so a retry loop is logged once per attempt. */
  private reported = new Set<string>();

  constructor(
    private readonly queue: JobQueue,
    private readonly opts: QueueMonitorOptions,
    private readonly log: Logger,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.monitorIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.queue.recoverStalled(this.opts.stallTimeoutMs);
      const stats = await this.queue.stats({
        retryLoopThreshold: this.opts.retryLoopThreshold,
        heartbeatOverdueMs: this.opts.heartbeatMs * 3,
      });

      for (const q of stats.queues) {
        jobsInState.set({ queue: q.queue, state: "ready" }, q.ready);
        jobsInState.set({ queue: q.queue, state: "delayed" }, q.delayed);
        jobsInState.set({ queue: q.queue, state: "running" }, q.running);
        jobsInState.set({ queue: q.queue, state: "dead" }, q.dead);
        jobOldestReadyAge.set({ queue: q.queue }, q.oldestReadyAgeSeconds);
      }
      for (const queue of QUEUE_NAMES) {
        jobsRetryLoopSuspects.set({ queue }, stats.retryLoops.filter((j) => j.queue === queue).length);
        jobsHeartbeatOverdue.set({ queue }, stats.heartbeatOverdue.filter((j) => j.queue === queue).length);
      }

      const seen = new Set<string>();
      for (const job of stats.retryLoops) {
        const key = `${job._id.toHexString()}:${job.attempts}:${job.stalledCount}`;
        seen.add(key);
        if (this.reported.has(key)) continue;
        this.log.warn("possible job retry loop", {
          jobId: job._id.toHexString(),
          queue: job.queue,
          type: job.type,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          stalledCount: job.stalledCount,
          correlationId: job.correlationId,
          lastErrorCode: job.lastError?.code,
          lastError: job.lastError?.message,
        });
      }
      this.reported = seen;
    } catch (err) {
      this.log.error("queue monitor tick failed", { err });
    } finally {
      this.running = false;
    }
  }
}
