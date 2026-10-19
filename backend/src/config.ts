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
};

export type Config = typeof config;
