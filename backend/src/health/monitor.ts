import type { Logger } from "../lib/logger.js";
import {
  dependencyCheckDuration,
  dependencyCheckFailures,
  dependencyConsecutiveFailures,
  dependencyHealth,
  dependencyLastSuccess,
} from "../lib/metrics.js";
import { withRetry } from "../lib/retry.js";
import {
  HealthCheckError,
  failureReason,
  type DependencyCheck,
  type FailureReason,
  type HealthState,
  type ProbeResult,
} from "./checks.js";

export type DependencyState = HealthState | "unknown";

export interface DependencyStatus {
  name: string;
  critical: boolean;
  status: DependencyState;
  checkedAt?: string;
  latencyMs?: number;
  attempts?: number;
  lastSuccessAt?: string;
  downSince?: string;
  consecutiveFailures: number;
  message?: string;
  error?: { reason: FailureReason; message: string };
  details?: Record<string, unknown>;
  remediation: string;
}

export interface HealthReport {
  status: HealthState;
  checkedAt: string;
  dependencies: DependencyStatus[];
}

export interface HealthMonitorOptions {
  intervalMs: number;
  timeoutMs: number;
  /** In-check retries before a dependency is marked down (absorbs single dropped requests). */
  retries: number;
}

const STATE_VALUE: Record<HealthState, number> = { up: 2, degraded: 1, down: 0 };

/** While a dependency stays down, repeat the warning every N failed checks instead of every check. */
const STILL_DOWN_LOG_EVERY = 10;

function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause instanceof Error ? `: ${err.cause.message}` : "";
  return err.message + cause;
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new HealthCheckError(`Timed out after ${ms}ms`, "timeout"));
    }, ms);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Periodically probes every external dependency, keeps the latest status in memory for the
 * /health endpoints, exports Prometheus metrics, and logs state transitions with remediation hints.
 */
export class HealthMonitor {
  private readonly statuses = new Map<string, DependencyStatus>();
  private readonly inFlight = new Map<string, Promise<DependencyStatus>>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly checks: DependencyCheck[],
    private readonly opts: HealthMonitorOptions,
    private readonly log: Logger,
  ) {
    for (const check of checks) {
      this.statuses.set(check.name, {
        name: check.name,
        critical: check.critical,
        status: "unknown",
        consecutiveFailures: 0,
        remediation: check.remediation,
      });
    }
  }

  start(): void {
    this.log.info("health monitor started", {
      dependencies: this.checks.map((c) => ({ name: c.name, critical: c.critical })),
      intervalMs: this.opts.intervalMs,
    });
    void this.runAll();
    this.timer = setInterval(() => void this.runAll(), this.opts.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async runAll(): Promise<void> {
    await Promise.all(this.checks.map((c) => this.run(c.name)));
  }

  /** Runs one check now (deduplicated with any in-flight run). Returns undefined for unknown names. */
  run(name: string): Promise<DependencyStatus> | undefined {
    const check = this.checks.find((c) => c.name === name);
    if (!check) return undefined;
    let pending = this.inFlight.get(name);
    if (!pending) {
      pending = this.execute(check).finally(() => this.inFlight.delete(name));
      this.inFlight.set(name, pending);
    }
    return pending;
  }

  snapshot(): HealthReport {
    const dependencies = [...this.statuses.values()];
    let status: HealthState = "up";
    for (const dep of dependencies) {
      const failing = dep.status === "down" || dep.status === "unknown";
      if (dep.critical && failing) {
        status = "down";
        break;
      }
      if (dep.status !== "up") status = "degraded";
    }
    return { status, checkedAt: new Date().toISOString(), dependencies };
  }

  /** Names of critical dependencies that are down or not yet checked. Empty means ready. */
  failingCritical(): string[] {
    return [...this.statuses.values()]
      .filter((d) => d.critical && (d.status === "down" || d.status === "unknown"))
      .map((d) => d.name);
  }

  private async execute(check: DependencyCheck): Promise<DependencyStatus> {
    const started = performance.now();
    let attempts = 0;
    try {
      const result = await withRetry(
        (attempt) => {
          attempts = attempt;
          return withTimeout((signal) => check.probe(signal), this.opts.timeoutMs);
        },
        {
          retries: this.opts.retries,
          baseDelayMs: 250,
          maxDelayMs: 2_000,
          onRetry: (err, attempt, delayMs) =>
            this.log.debug("dependency check attempt failed, retrying", {
              dependency: check.name,
              attempt,
              delayMs,
              reason: failureReason(err),
              error: errorMessage(err),
            }),
        },
      );
      return this.recordSuccess(check, result, performance.now() - started, attempts);
    } catch (err) {
      return this.recordFailure(check, err, performance.now() - started, attempts);
    }
  }

  private recordSuccess(check: DependencyCheck, result: ProbeResult, latencyMs: number, attempts: number): DependencyStatus {
    const prev = this.statuses.get(check.name)!;
    const now = new Date();
    const next: DependencyStatus = {
      ...prev,
      status: result.status,
      checkedAt: now.toISOString(),
      latencyMs: Math.round(latencyMs),
      attempts,
      lastSuccessAt: now.toISOString(),
      downSince: undefined,
      consecutiveFailures: 0,
      message: result.message,
      error: undefined,
      details: result.details,
    };
    this.statuses.set(check.name, next);

    dependencyHealth.set({ dependency: check.name, critical: String(check.critical) }, STATE_VALUE[result.status]);
    dependencyCheckDuration.observe({ dependency: check.name, outcome: result.status }, latencyMs / 1000);
    dependencyConsecutiveFailures.set({ dependency: check.name }, 0);
    dependencyLastSuccess.set({ dependency: check.name }, Math.floor(now.getTime() / 1000));

    const fields = { dependency: check.name, critical: check.critical, latencyMs: next.latencyMs, details: result.details };
    if (prev.status === "down") {
      const downtimeSeconds = prev.downSince ? Math.round((now.getTime() - Date.parse(prev.downSince)) / 1000) : undefined;
      this.log.info("dependency recovered", { ...fields, status: result.status, downtimeSeconds, failedChecks: prev.consecutiveFailures });
    } else if (result.status === "degraded" && prev.status !== "degraded") {
      this.log.warn("dependency degraded", { ...fields, message: result.message, remediation: check.remediation });
    } else if (result.status === "up" && prev.status === "degraded") {
      this.log.info("dependency no longer degraded", fields);
    } else if (prev.status === "unknown") {
      this.log.info("dependency check passed", { ...fields, status: result.status });
    }
    return next;
  }

  private recordFailure(check: DependencyCheck, err: unknown, latencyMs: number, attempts: number): DependencyStatus {
    const prev = this.statuses.get(check.name)!;
    const now = new Date();
    const reason = failureReason(err);
    const message = errorMessage(err);
    const next: DependencyStatus = {
      ...prev,
      status: "down",
      checkedAt: now.toISOString(),
      latencyMs: Math.round(latencyMs),
      attempts,
      downSince: prev.status === "down" ? prev.downSince : now.toISOString(),
      consecutiveFailures: prev.consecutiveFailures + 1,
      message: undefined,
      error: { reason, message },
      details: undefined,
    };
    this.statuses.set(check.name, next);

    dependencyHealth.set({ dependency: check.name, critical: String(check.critical) }, STATE_VALUE.down);
    dependencyCheckDuration.observe({ dependency: check.name, outcome: "down" }, latencyMs / 1000);
    dependencyCheckFailures.inc({ dependency: check.name, reason });
    dependencyConsecutiveFailures.set({ dependency: check.name }, next.consecutiveFailures);

    const fields = {
      dependency: check.name,
      critical: check.critical,
      reason,
      error: message,
      attempts,
      consecutiveFailures: next.consecutiveFailures,
      downSince: next.downSince,
      lastSuccessAt: next.lastSuccessAt,
      remediation: check.remediation,
    };
    if (prev.status !== "down") {
      this.log.error("dependency down", fields);
    } else if (next.consecutiveFailures % STILL_DOWN_LOG_EVERY === 0) {
      this.log.warn("dependency still down", fields);
    }
    return next;
  }
}
