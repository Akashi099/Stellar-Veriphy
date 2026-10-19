import type { Db } from "mongodb";
import type { Logger } from "../lib/logger.js";
import { releaseLock, tryAcquireLock } from "../db/locks.js";
import type { CleanupTaskReport, RetentionCleaner } from "./cleanup.js";

const LOCK_NAME = "retention-cleanup";
/** Upper bound on one run; if the holder dies, another instance can take over after this. */
const LOCK_TTL_MS = 30 * 60_000;
/** Let the service settle (indexes, connections) before the first run. */
const FIRST_RUN_DELAY_MS = 60_000;

export class CleanupAlreadyRunningError extends Error {
  constructor() {
    super("Retention cleanup is already running on another instance");
    this.name = "CleanupAlreadyRunningError";
  }
}

/** Runs RetentionCleaner on an interval, on at most one instance at a time (Mongo lease lock). */
export class CleanupScheduler {
  private timer?: NodeJS.Timeout;
  private firstRun?: NodeJS.Timeout;

  constructor(
    private readonly cleaner: RetentionCleaner,
    private readonly db: Db,
    private readonly intervalMs: number,
    private readonly instanceId: string,
    private readonly log: Logger,
  ) {}

  start(): void {
    this.log.info("retention cleanup scheduled", { intervalMs: this.intervalMs });
    this.firstRun = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.firstRun.unref();
    this.timer.unref();
  }

  stop(): void {
    clearTimeout(this.firstRun);
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      await this.runNow({ dryRun: false });
    } catch (err) {
      if (err instanceof CleanupAlreadyRunningError) {
        this.log.debug("retention cleanup skipped; another instance holds the lock");
        return;
      }
      this.log.error("retention cleanup run failed", { err });
    }
  }

  /** Dry runs only count matches and need no lock. Throws CleanupAlreadyRunningError if locked. */
  async runNow({ dryRun }: { dryRun: boolean }): Promise<CleanupTaskReport[]> {
    if (dryRun) return this.cleaner.run({ dryRun: true });

    if (!(await tryAcquireLock(this.db, LOCK_NAME, this.instanceId, LOCK_TTL_MS))) {
      throw new CleanupAlreadyRunningError();
    }
    const started = Date.now();
    try {
      this.log.info("retention cleanup started");
      const reports = await this.cleaner.run({ dryRun: false });
      this.log.info("retention cleanup finished", {
        durationMs: Date.now() - started,
        archived: reports.reduce((n, r) => n + r.archived, 0),
        deleted: reports.reduce((n, r) => n + r.deleted, 0),
        failedTasks: reports.filter((r) => r.error).map((r) => r.task),
      });
      return reports;
    } finally {
      await releaseLock(this.db, LOCK_NAME, this.instanceId).catch((err) =>
        this.log.warn("failed to release retention lock; it will expire on its own", { err }),
      );
    }
  }
}
