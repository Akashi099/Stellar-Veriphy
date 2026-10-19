import { hostname } from "node:os";

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? undefined : value.trim();
}

function str(name: string, fallback: string): string {
  return env(name) ?? fallback;
}

function int(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name}: expected a non-negative integer, got "${raw}"`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function list(name: string, fallback: string[]): string[] {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

const NETWORK_PASSPHRASES: Record<string, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
  futurenet: "Test SDF Future Network ; October 2022",
};

const network = str("STELLAR_NETWORK", "testnet");

export const config = {
  port: int("PORT", 4000),
  instanceId: `${hostname()}:${process.pid}`,
  adminToken: env("ADMIN_TOKEN"),

  mongo: {
    uri: str("MONGODB_URI", "mongodb://localhost:27017"),
    dbName: str("MONGODB_DB", "stellarveriphy"),
    slowQueryMs: int("MONGODB_SLOW_QUERY_MS", 200),
  },

  stellar: {
    network,
    passphrase: env("STELLAR_NETWORK_PASSPHRASE") ?? NETWORK_PASSPHRASES[network],
    horizonUrl: str("STELLAR_HORIZON_URL", "https://horizon-testnet.stellar.org"),
    sorobanRpcUrl: str("STELLAR_SOROBAN_RPC_URL", "https://soroban-testnet.stellar.org"),
    maxLedgerAgeSeconds: int("STELLAR_MAX_LEDGER_AGE_SECONDS", 60),
  },

  integrations: {
    ipfsApiUrl: env("IPFS_API_URL"),
    kmsHealthUrl: env("KMS_HEALTH_URL"),
    oracleHealthUrl: env("ORACLE_HEALTH_URL"),
  },

  /** Defaults for third-party HTTP calls (#788); see externalApiPolicy() for per-service overrides. */
  externalApi: {
    timeoutMs: int("EXTERNAL_API_TIMEOUT_MS", 10_000),
    retries: int("EXTERNAL_API_RETRIES", 2),
    retryBaseDelayMs: int("EXTERNAL_API_RETRY_BASE_DELAY_MS", 250),
    retryMaxDelayMs: int("EXTERNAL_API_RETRY_MAX_DELAY_MS", 5_000),
    totalTimeoutMs: int("EXTERNAL_API_TOTAL_TIMEOUT_MS", 30_000),
  },

  health: {
    intervalMs: int("HEALTH_CHECK_INTERVAL_MS", 30_000),
    timeoutMs: int("HEALTH_CHECK_TIMEOUT_MS", 5_000),
    retries: int("HEALTH_CHECK_RETRIES", 2),
    criticalDependencies: list("HEALTH_CRITICAL_DEPENDENCIES", ["mongodb"]),
  },

  jobs: {
    concurrency: int("JOB_CONCURRENCY", 4),
    pollIntervalMs: int("JOB_POLL_INTERVAL_MS", 1_000),
    heartbeatMs: int("JOB_HEARTBEAT_MS", 10_000),
    stallTimeoutMs: int("JOB_STALL_TIMEOUT_MS", 60_000),
    jobTimeoutMs: int("JOB_TIMEOUT_MS", 300_000),
    defaultMaxAttempts: int("JOB_MAX_ATTEMPTS", 5),
    retryBaseDelayMs: int("JOB_RETRY_BASE_DELAY_MS", 5_000),
    retryMaxDelayMs: int("JOB_RETRY_MAX_DELAY_MS", 600_000),
    retryLoopThreshold: int("JOB_RETRY_LOOP_THRESHOLD", 3),
    monitorIntervalMs: int("JOB_MONITOR_INTERVAL_MS", 15_000),
  },

  cache: {
    maxEntries: int("PUBLIC_CACHE_MAX_ENTRIES", 10_000),
    /** Terminal verification status and certificate lookups never change, so they can live longer. */
    statusTtlMs: int("PUBLIC_CACHE_STATUS_TTL_MS", 300_000),
    /** "Latest verification for this content" can change when the content is re-verified. */
    contentHashTtlMs: int("PUBLIC_CACHE_CONTENT_HASH_TTL_MS", 30_000),
    negativeTtlMs: int("PUBLIC_CACHE_NEGATIVE_TTL_MS", 5_000),
  webhooks: {
    /** Comma-separated receiver URLs; every published event is delivered to each. */
    endpoints: list("WEBHOOK_ENDPOINTS", []),
    /** HMAC-SHA256 key for the X-Veriphy-Signature header. Unsigned when unset. */
    signingSecret: env("WEBHOOK_SIGNING_SECRET"),
    maxAttempts: int("WEBHOOK_MAX_ATTEMPTS", 8),
  },

  maintenance: {
    /** Forces maintenance on regardless of the stored flag (break-glass; needs a restart to change). */
    forceEnabled: bool("MAINTENANCE_MODE", false),
    defaultMessage: str(
      "MAINTENANCE_MESSAGE",
      "StellarVeriphy is undergoing scheduled maintenance. Existing verifications can still be viewed; new submissions are paused.",
    ),
    refreshMs: int("MAINTENANCE_REFRESH_MS", 5_000),
    retryAfterSeconds: int("MAINTENANCE_RETRY_AFTER_SECONDS", 300),
  },

  retention: {
    enabled: bool("RETENTION_CLEANUP_ENABLED", true),
    intervalMinutes: int("RETENTION_INTERVAL_MINUTES", 60),
    batchSize: int("RETENTION_BATCH_SIZE", 500),
    maxBatchesPerRun: int("RETENTION_MAX_BATCHES_PER_RUN", 20),
    idleSessionHours: int("RETENTION_IDLE_SESSION_HOURS", 24),
    completedSessionDays: int("RETENTION_COMPLETED_SESSION_DAYS", 7),
    archiveDays: int("RETENTION_ARCHIVE_DAYS", 90),
    succeededJobDays: int("RETENTION_SUCCEEDED_JOB_DAYS", 7),
    deadJobDays: int("RETENTION_DEAD_JOB_DAYS", 30),
  },

  /** Orphaned media cleanup (#782). Runs as a retention task when MEDIA_STORAGE_DIR is set. */
  orphanMedia: {
    enabled: bool("ORPHAN_MEDIA_CLEANUP_ENABLED", true),
    storageDir: env("MEDIA_STORAGE_DIR"),
    /** Files newer than this are never deleted: their record may not be written yet. */
    minAgeHours: int("ORPHAN_MEDIA_MIN_AGE_HOURS", 48),
    /** Abort without deleting if more than this share of scanned files look orphaned. */
    maxDeletePercent: int("ORPHAN_MEDIA_MAX_DELETE_PERCENT", 25),
  },
};

export type Config = typeof config;

/**
 * Effective timeout/retry policy for one external service. Each default in `config.externalApi`
 * can be overridden per service, e.g. EXTERNAL_API_HORIZON_TIMEOUT_MS or EXTERNAL_API_WEBHOOK_RETRIES.
 * The service name is upper-cased: horizon, soroban_rpc, ipfs, kms, tee_oracle, webhook.
 */
export function externalApiPolicy(service: string) {
  const prefix = `EXTERNAL_API_${service.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const d = config.externalApi;
  return {
    timeoutMs: int(`${prefix}_TIMEOUT_MS`, d.timeoutMs),
    retries: int(`${prefix}_RETRIES`, d.retries),
    retryBaseDelayMs: int(`${prefix}_RETRY_BASE_DELAY_MS`, d.retryBaseDelayMs),
    retryMaxDelayMs: int(`${prefix}_RETRY_MAX_DELAY_MS`, d.retryMaxDelayMs),
    totalTimeoutMs: int(`${prefix}_TOTAL_TIMEOUT_MS`, d.totalTimeoutMs),
  };
}
