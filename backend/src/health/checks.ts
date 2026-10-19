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
