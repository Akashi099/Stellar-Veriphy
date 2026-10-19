import type { Db } from "mongodb";
import type { Logger } from "../lib/logger.js";
import { maintenanceMode } from "../lib/metrics.js";
import { Collections, type MaintenanceDoc } from "../db/collections.js";

const DOC_ID = "maintenance";

export interface MaintenanceOptions {
  forceEnabled: boolean;
  defaultMessage: string;
  refreshMs: number;
}

export interface MaintenanceState {
  enabled: boolean;
  /** "env" when forced by MAINTENANCE_MODE, "operator" when set via the admin API. */
  source: "env" | "operator" | "off";
  message: string;
  startedAt?: string;
  endsAt?: string;
  pauseJobs: boolean;
  updatedBy?: string;
}

export interface EnableMaintenanceInput {
  message?: string;
  endsAt?: Date;
  pauseJobs?: boolean;
}

/**
 * Runtime maintenance flag (#787). The flag lives in MongoDB so an operator can toggle it on
 * every instance without a deploy; each instance re-reads it every `refreshMs` and serves the
 * cached value, so request handling never waits on the database. If a refresh fails the last
 * known state is kept (a database blip must not flip maintenance on or off by itself).
 */
export class MaintenanceMode {
  private state: MaintenanceState;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly db: Db,
    private readonly opts: MaintenanceOptions,
    private readonly log: Logger,
  ) {
    this.state = this.resolve(null);
    this.publishMetric();
  }

  private get col() {
    return this.db.collection<MaintenanceDoc>(Collections.settings);
  }

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.opts.refreshMs);
    this.timer.unref();
    if (this.opts.forceEnabled) this.log.warn("maintenance mode forced on by MAINTENANCE_MODE");
  }

  stop(): void {
    clearInterval(this.timer);
  }

  current(): MaintenanceState {
    return this.state;
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  jobsPaused(): boolean {
    return this.state.enabled && this.state.pauseJobs;
  }

  /** Seconds clients should wait before retrying a rejected request. */
  retryAfterSeconds(fallback: number): number {
    if (!this.state.endsAt) return fallback;
    const remaining = Math.ceil((Date.parse(this.state.endsAt) - Date.now()) / 1000);
    return remaining > 0 ? remaining : fallback;
  }

  async refresh(): Promise<MaintenanceState> {
    try {
      this.apply(this.resolve(await this.col.findOne({ _id: DOC_ID })));
    } catch (err) {
      this.log.warn("failed to refresh maintenance flag; keeping last known state", { enabled: this.state.enabled, err });
    }
    return this.state;
  }

  async enable(input: EnableMaintenanceInput, updatedBy: string): Promise<MaintenanceState> {
    const now = new Date();
    const existing = await this.col.findOne({ _id: DOC_ID });
    const unset: Partial<Record<"message" | "endsAt", "">> = {};
    if (!input.message) unset.message = "";
    if (!input.endsAt) unset.endsAt = "";
    await this.col.updateOne(
      { _id: DOC_ID },
      {
        $set: {
          enabled: true,
          pauseJobs: input.pauseJobs ?? false,
          // Keep the original start time when an operator only edits the message or end time.
          startedAt: existing?.enabled && existing.startedAt ? existing.startedAt : now,
          updatedAt: now,
          updatedBy,
          ...(input.message ? { message: input.message } : {}),
          ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        },
        // MongoDB rejects an empty $unset.
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { upsert: true },
    );
    this.log.info("maintenance mode enabled by operator", {
      updatedBy,
      endsAt: input.endsAt,
      pauseJobs: input.pauseJobs ?? false,
    });
    return this.refresh();
  }

  async disable(updatedBy: string): Promise<MaintenanceState> {
    await this.col.updateOne(
      { _id: DOC_ID },
      { $set: { enabled: false, pauseJobs: false, updatedAt: new Date(), updatedBy }, $unset: { startedAt: "", endsAt: "" } },
      { upsert: true },
    );
    this.log.info("maintenance mode disabled by operator", { updatedBy, forcedByEnv: this.opts.forceEnabled });
    return this.refresh();
  }

  private resolve(doc: MaintenanceDoc | null): MaintenanceState {
    const stored = doc?.enabled === true;
    if (!stored && !this.opts.forceEnabled) {
      return { enabled: false, source: "off", message: this.opts.defaultMessage, pauseJobs: false, updatedBy: doc?.updatedBy };
    }
    return {
      enabled: true,
      source: stored ? "operator" : "env",
      message: (stored && doc?.message) || this.opts.defaultMessage,
      startedAt: stored ? doc?.startedAt?.toISOString() : undefined,
      endsAt: stored ? doc?.endsAt?.toISOString() : undefined,
      pauseJobs: stored ? doc?.pauseJobs === true : false,
      updatedBy: doc?.updatedBy,
    };
  }

  private apply(next: MaintenanceState): void {
    const prev = this.state;
    this.state = next;
    this.publishMetric();
    if (prev.enabled !== next.enabled) {
      if (next.enabled) {
        this.log.warn("maintenance mode is ON; write requests will be rejected with 503", {
          source: next.source,
          endsAt: next.endsAt,
          pauseJobs: next.pauseJobs,
          updatedBy: next.updatedBy,
        });
      } else {
        this.log.info("maintenance mode is OFF; normal operation resumed", { updatedBy: next.updatedBy });
      }
    } else if (prev.pauseJobs !== next.pauseJobs) {
      this.log.info(next.pauseJobs ? "job processing paused for maintenance" : "job processing resumed", {
        updatedBy: next.updatedBy,
      });
    }
  }

  private publishMetric(): void {
    maintenanceMode.reset();
    maintenanceMode.set({ source: this.state.source }, this.state.enabled ? 1 : 0);
  }
}
