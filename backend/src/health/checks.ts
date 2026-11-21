import type { Db } from "mongodb";
import { config, externalApiPolicy } from "../config.js";
import { ExternalApiClient, ExternalApiError } from "../lib/http.js";

export { safeUrl } from "../lib/url.js";

export type HealthState = "up" | "degraded" | "down";

export type FailureReason =
  | "timeout"
  | "connection"
  | "http_error"
  | "invalid_response"
  | "unhealthy"
  | "misconfigured"
  | "error";

export class HealthCheckError extends Error {
  constructor(
    message: string,
    readonly reason: FailureReason,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "HealthCheckError";
  }
}

export function failureReason(err: unknown): FailureReason {
  if (err instanceof HealthCheckError) return err.reason;
  if (err instanceof ExternalApiError) return err.meta.reason === "aborted" ? "timeout" : err.meta.reason;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") return "timeout";
    if (err.name === "TypeError" && /fetch failed/i.test(err.message)) return "connection";
    if (/^Mongo(ServerSelection|Network)/.test(err.name)) return "connection";
  }
  return "error";
}

/** A probe resolves when the dependency is usable and throws when it is down. */
export interface ProbeResult {
  status: Exclude<HealthState, "down">;
  /** Shown in GET /health; never include secrets. */
  details?: Record<string, unknown>;
  message?: string;
}

export interface DependencyProbe {
  name: string;
  /** What an operator should do when this check fails. Logged and returned by GET /health. */
  remediation: string;
  probe(signal: AbortSignal): Promise<ProbeResult>;
}

export interface DependencyCheck extends DependencyProbe {
  /** Critical dependencies gate GET /health/ready. */
  critical: boolean;
}

function join(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

const probeClients = new Map<string, ExternalApiClient>();

/**
 * Probes go through the shared external API client (#788) for consistent timeouts, error
 * metadata and sv_external_api_* metrics. Retries are left to HealthMonitor (HEALTH_CHECK_RETRIES),
 * so the client itself never retries here.
 */
function probeClient(service: string): ExternalApiClient {
  let client = probeClients.get(service);
  if (!client) {
    const policy = externalApiPolicy(service);
    client = new ExternalApiClient(service, {
      ...policy,
      timeoutMs: Math.min(policy.timeoutMs, config.health.timeoutMs),
      totalTimeoutMs: config.health.timeoutMs,
      retries: 0,
    });
    probeClients.set(service, client);
  }
  return client;
}

async function fetchJson<T>(service: string, url: string, signal: AbortSignal, body?: unknown): Promise<T> {
  return probeClient(service).json<T>(url, {
    method: body === undefined ? "GET" : "POST",
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --- MongoDB -------------------------------------------------------------------

export function mongoCheck(db: Db): DependencyProbe {
  return {
    name: "mongodb",
    remediation:
      "Check MONGODB_URI and that the replica set is reachable from this host. The driver reconnects automatically " +
      "once the server is back; if it does not recover within a few minutes, restart the pod.",
    async probe() {
      await db.command({ ping: 1 });
      return { status: "up" };
    },
  };
}

// --- Stellar Horizon -----------------------------------------------------------

interface HorizonRoot {
  horizon_version?: string;
  core_version?: string;
  history_latest_ledger: number;
  history_latest_ledger_closed_at: string;
  core_latest_ledger: number;
  network_passphrase: string;
}

/** Horizon ingestion more than this many ledgers behind Stellar Core is reported as degraded. */
const MAX_INGESTION_LAG_LEDGERS = 10;

export function horizonCheck(horizonUrl: string, passphrase: string, maxLedgerAgeSeconds: number): DependencyProbe {
  return {
    name: "stellar_horizon",
    remediation:
      "Check https://status.stellar.org and STELLAR_HORIZON_URL. If the provider is down or lagging, point " +
      "STELLAR_HORIZON_URL at a fallback Horizon instance and restart. A passphrase mismatch means the URL " +
      "points at the wrong network.",
    async probe(signal) {
      const root = await fetchJson<HorizonRoot>("horizon", join(horizonUrl, "/"), signal);
      if (typeof root.history_latest_ledger !== "number") {
        throw new HealthCheckError("Horizon root response is missing ledger fields", "invalid_response");
      }
      if (passphrase && root.network_passphrase !== passphrase) {
        throw new HealthCheckError(
          `Horizon network passphrase "${root.network_passphrase}" does not match configured "${passphrase}"`,
          "misconfigured",
        );
      }
      const ledgerAgeSeconds = Math.round((Date.now() - Date.parse(root.history_latest_ledger_closed_at)) / 1000);
      const ingestionLag = root.core_latest_ledger - root.history_latest_ledger;
      const details = {
        latestLedger: root.history_latest_ledger,
        ledgerAgeSeconds,
        ingestionLag,
        horizonVersion: root.horizon_version,
      };
      if (ledgerAgeSeconds > maxLedgerAgeSeconds) {
        return { status: "degraded", details, message: `Latest ledger is ${ledgerAgeSeconds}s old` };
      }
      if (ingestionLag > MAX_INGESTION_LAG_LEDGERS) {
        return { status: "degraded", details, message: `Horizon ingestion is ${ingestionLag} ledgers behind core` };
      }
      return { status: "up", details };
    },
  };
}

// --- Soroban RPC ---------------------------------------------------------------

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

async function rpc<T>(url: string, method: string, signal: AbortSignal): Promise<T> {
  const res = await fetchJson<JsonRpcResponse<T>>("soroban_rpc", url, signal, { jsonrpc: "2.0", id: 1, method });
  if (res.error) throw new HealthCheckError(`${method} failed: ${res.error.message} (${res.error.code})`, "unhealthy");
  if (res.result === undefined) throw new HealthCheckError(`${method} returned no result`, "invalid_response");
  return res.result;
}

export function sorobanRpcCheck(rpcUrl: string, passphrase: string): DependencyProbe {
  return {
    name: "soroban_rpc",
    remediation:
      "Check STELLAR_SOROBAN_RPC_URL and the provider's status page. Contract submissions (oracle, provenance, " +
      "registry) fail while this is down; queued verification jobs retry with backoff and resume automatically. " +
      "Switch to a fallback RPC provider if the outage persists.",
    async probe(signal) {
      const [health, network] = await Promise.all([
        rpc<{ status: string; latestLedger?: number; oldestLedger?: number }>(rpcUrl, "getHealth", signal),
        rpc<{ passphrase: string; protocolVersion?: number }>(rpcUrl, "getNetwork", signal),
      ]);
      if (passphrase && network.passphrase !== passphrase) {
        throw new HealthCheckError(
          `Soroban RPC network passphrase "${network.passphrase}" does not match configured "${passphrase}"`,
          "misconfigured",
        );
      }
      if (health.status !== "healthy") {
        throw new HealthCheckError(`Soroban RPC reports status "${health.status}"`, "unhealthy");
      }
      return {
        status: "up",
        details: { latestLedger: health.latestLedger, protocolVersion: network.protocolVersion },
      };
    },
  };
}

// --- IPFS (Kubo HTTP API) ------------------------------------------------------

export function ipfsCheck(apiUrl: string): DependencyProbe {
  return {
    name: "ipfs",
    remediation:
      "Check that the IPFS node behind IPFS_API_URL is running and reachable. Uploads and storage-layer reads fail " +
      "while it is down; indexing jobs retry automatically once it recovers.",
    async probe(signal) {
      // Kubo's RPC API only accepts POST.
      const version = await fetchJson<{ Version?: string }>("ipfs", join(apiUrl, "/api/v0/version"), signal, {});
      return { status: "up", details: { version: version.Version } };
    },
  };
}

// --- Generic HTTP health endpoint (KMS, oracle worker, ...) ----------------------

export function httpHealthCheck(name: string, url: string, remediation: string): DependencyProbe {
  return {
    name,
    remediation,
    async probe(signal) {
      const { text } = await probeClient(name).request(url, { signal, headers: { accept: "application/json" } });
      let body: { status?: unknown } | undefined;
      try {
        body = JSON.parse(text) as { status?: unknown };
      } catch {
        body = undefined;
      }
      const reported = typeof body?.status === "string" ? body.status.toLowerCase() : undefined;
      if (reported === "down" || reported === "error" || reported === "fail") {
        throw new HealthCheckError(`${name} reports status "${reported}"`, "unhealthy");
      }
      if (reported === "degraded" || reported === "warn") {
        return { status: "degraded", message: `${name} reports status "${reported}"` };
      }
      return { status: "up" };
    },
  };
}

// --- Registry --------------------------------------------------------------------

export function buildDependencyChecks(db: Db): DependencyCheck[] {
  const { stellar, integrations } = config;
  const probes: DependencyProbe[] = [
    mongoCheck(db),
    horizonCheck(stellar.horizonUrl, stellar.passphrase, stellar.maxLedgerAgeSeconds),
    sorobanRpcCheck(stellar.sorobanRpcUrl, stellar.passphrase),
  ];
  if (integrations.ipfsApiUrl) probes.push(ipfsCheck(integrations.ipfsApiUrl));
  if (integrations.kmsHealthUrl) {
    probes.push(
      httpHealthCheck(
        "kms",
        integrations.kmsHealthUrl,
        "Check the KMS service and its credentials. Encryption/decryption of media fails while it is down; " +
          "uploads should be rejected rather than stored unencrypted.",
      ),
    );
  }
  if (integrations.oracleHealthUrl) {
    probes.push(
      httpHealthCheck(
        "tee_oracle",
        integrations.oracleHealthUrl,
        "Check the oracle worker and its Nitro Enclave. Verification jobs wait in the queue (see " +
          "sv_job_oldest_ready_age_seconds) and are processed once the oracle is back.",
      ),
    );
  }

  const critical = new Set(config.health.criticalDependencies);
  return probes.map((probe) => ({ ...probe, critical: critical.has(probe.name) }));
}
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
