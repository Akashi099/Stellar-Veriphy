import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * All Prometheus metrics live here so operators have one place to look.
 * Exposed at GET /metrics. Naming: sv_<area>_<what>_<unit>.
 */
export const registry = new Registry();
registry.setDefaultLabels({ service: "stellarveriphy-backend" });
collectDefaultMetrics({ register: registry, prefix: "sv_" });

const registers = [registry];

// --- External dependency health (#774) ---------------------------------------

export const dependencyHealth = new Gauge({
  name: "sv_dependency_health",
  help: "Current dependency state from the last health check: 2=up, 1=degraded, 0=down",
  labelNames: ["dependency", "critical"] as const,
  registers,
});

export const dependencyCheckDuration = new Histogram({
  name: "sv_dependency_check_duration_seconds",
  help: "Wall-clock duration of a dependency health check, including retries",
  labelNames: ["dependency", "outcome"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20],
  registers,
});

export const dependencyCheckFailures = new Counter({
  name: "sv_dependency_check_failures_total",
  help: "Dependency health checks that ended in the down state, by failure reason",
  labelNames: ["dependency", "reason"] as const,
  registers,
});

export const dependencyConsecutiveFailures = new Gauge({
  name: "sv_dependency_consecutive_failures",
  help: "Consecutive failed health checks for a dependency (0 when healthy)",
  labelNames: ["dependency"] as const,
  registers,
});

export const dependencyLastSuccess = new Gauge({
  name: "sv_dependency_last_success_timestamp_seconds",
  help: "Unix time of the last successful (up or degraded) health check",
  labelNames: ["dependency"] as const,
  registers,
});

// --- External API calls (#788) ----------------------------------------------

export const externalApiRequests = new Counter({
  name: "sv_external_api_requests_total",
  help: "Attempts against third-party APIs by outcome: success, http_error, timeout, connection, aborted",
  labelNames: ["service", "method", "outcome"] as const,
  registers,
});

export const externalApiDuration = new Histogram({
  name: "sv_external_api_request_duration_seconds",
  help: "Duration of a single attempt against a third-party API",
  labelNames: ["service", "outcome"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30],
  registers,
});

export const externalApiRetries = new Counter({
  name: "sv_external_api_retries_total",
  help: "Retries scheduled for third-party API calls, by the failure that triggered them",
  labelNames: ["service", "reason"] as const,
  registers,
});

// --- Database (#773) ---------------------------------------------------------

export const dbCommandDuration = new Histogram({
  name: "sv_db_command_duration_seconds",
  help: "MongoDB command latency by command and collection",
  labelNames: ["command", "collection", "outcome"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers,
});

export const dbSlowCommands = new Counter({
  name: "sv_db_slow_commands_total",
  help: "MongoDB commands slower than MONGODB_SLOW_QUERY_MS",
  labelNames: ["command", "collection"] as const,
  registers,
});

// --- Job queue (#771) --------------------------------------------------------

export const jobsEnqueued = new Counter({
  name: "sv_jobs_enqueued_total",
  help: "Jobs added to a queue",
  labelNames: ["queue", "type"] as const,
  registers,
});

export const jobsStarted = new Counter({
  name: "sv_jobs_started_total",
  help: "Job attempts claimed by a worker",
  labelNames: ["queue", "type"] as const,
  registers,
});

export const jobsFinished = new Counter({
  name: "sv_jobs_finished_total",
  help: "Job attempts that finished, by outcome: succeeded, retried (failed, will retry) or dead (failed permanently)",
  labelNames: ["queue", "type", "outcome"] as const,
  registers,
});

export const jobFailures = new Counter({
  name: "sv_job_failures_total",
  help: "Failed job attempts by error code (includes retried and dead attempts)",
  labelNames: ["queue", "type", "code"] as const,
  registers,
});

export const jobsStalled = new Counter({
  name: "sv_jobs_stalled_total",
  help: "Running jobs recovered after their worker stopped sending heartbeats",
  labelNames: ["queue", "type"] as const,
  registers,
});

export const jobsResumed = new Counter({
  name: "sv_jobs_resumed_total",
  help: "Job attempts that resumed from a checkpoint saved by an earlier attempt instead of starting over",
  labelNames: ["queue", "type"] as const,
  registers,
});

export const jobCheckpoints = new Counter({
  name: "sv_job_checkpoints_total",
  help: "Checkpoints saved by long-running job handlers",
  labelNames: ["queue", "type"] as const,
  registers,
});

export const jobDuration = new Histogram({
  name: "sv_job_duration_seconds",
  help: "Job attempt processing time by outcome",
  labelNames: ["queue", "type", "outcome"] as const,
  buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600],
  registers,
});

export const jobWait = new Histogram({
  name: "sv_job_wait_seconds",
  help: "Time a job was ready (runAt reached) before a worker claimed it",
  labelNames: ["queue", "type"] as const,
  buckets: [0.1, 0.5, 1, 5, 15, 30, 60, 300, 900, 3600],
  registers,
});

export const jobsInState = new Gauge({
  name: "sv_jobs",
  help: "Jobs currently in each state (sampled): ready, delayed (waiting for retry backoff), running, dead",
  labelNames: ["queue", "state"] as const,
  registers,
});

export const jobOldestReadyAge = new Gauge({
  name: "sv_job_oldest_ready_age_seconds",
  help: "Age of the oldest job that is ready but not yet claimed (0 when the queue is drained)",
  labelNames: ["queue"] as const,
  registers,
});

export const jobsRetryLoopSuspects = new Gauge({
  name: "sv_jobs_retry_loop_suspects",
  help: "Active jobs at or above JOB_RETRY_LOOP_THRESHOLD attempts, or stalled more than once",
  labelNames: ["queue"] as const,
  registers,
});

export const jobsHeartbeatOverdue = new Gauge({
  name: "sv_jobs_heartbeat_overdue",
  help: "Running jobs whose heartbeat is late (likely hung or about to be recovered as stalled)",
  labelNames: ["queue"] as const,
  registers,
});

// --- Retention cleanup (#772) ------------------------------------------------

export const cleanupRuns = new Counter({
  name: "sv_cleanup_runs_total",
  help: "Retention cleanup task executions by outcome",
  labelNames: ["task", "outcome"] as const,
  registers,
});

export const cleanupRecords = new Counter({
  name: "sv_cleanup_records_total",
  help: "Records archived or deleted by retention cleanup",
  labelNames: ["task", "action"] as const,
  registers,
});

export const cleanupDuration = new Histogram({
  name: "sv_cleanup_duration_seconds",
  help: "Retention cleanup task duration",
  labelNames: ["task"] as const,
  buckets: [0.1, 0.5, 1, 5, 15, 30, 60, 300],
  registers,
});

export const cleanupLastSuccess = new Gauge({
  name: "sv_cleanup_last_success_timestamp_seconds",
  help: "Unix time each retention task last completed successfully",
  labelNames: ["task"] as const,
  registers,
});

// --- Public read cache (#779) ------------------------------------------------

export const cacheRequests = new Counter({
  name: "sv_cache_requests_total",
  help: "Public read cache lookups by outcome: hit, negative_hit, miss, coalesced or bypass (cache disabled)",
  labelNames: ["cache", "outcome"] as const,
  registers,
});

export const cacheEvictions = new Counter({
  name: "sv_cache_evictions_total",
  help: "Entries removed from a public read cache before expiry, by reason: capacity, invalidated or cleared",
  labelNames: ["cache", "reason"] as const,
  registers,
});

export const cacheEntries = new Gauge({
  name: "sv_cache_entries",
  help: "Entries currently held by a public read cache (per instance)",
  labelNames: ["cache"] as const,
  registers,
});

// --- Orphaned media cleanup (#782) -------------------------------------------

export const orphanMediaObjects = new Counter({
  name: "sv_orphan_media_objects_total",
  help: "Orphaned media files processed by cleanup, by outcome: deleted or failed",
  labelNames: ["storage", "outcome"] as const,
  registers,
});

export const orphanMediaBytes = new Counter({
  name: "sv_orphan_media_deleted_bytes_total",
  help: "Bytes reclaimed by deleting orphaned media files",
  labelNames: ["storage"] as const,
// --- Service-level timeouts and slow responses (#853) -----------------------
//
// Every HTTP request is timed and recorded in sv_http_request_duration_seconds
// (labels: method, route, status). Two thresholds drive the alerting counters:
//
//   HTTP_SLOW_REQUEST_MS      (default 1000) - requests slower than this are
//                             counted in sv_http_slow_requests_total and are
//                             the primary signal for endpoints needing tuning.
//   HTTP_REQUEST_TIMEOUT_MS   (default 30000) - requests exceeding this are
//                             aborted and counted in sv_http_request_timeouts_total.
//
// Operators: group sv_http_slow_requests_total by (method, route) to find the
// worst offenders, then compare with the p95/p99 of
// sv_http_request_duration_seconds for the same route before adjusting either
// threshold. Both thresholds are reviewed alongside the service SLOs.

export const httpRequestDuration = new Histogram({
  name: "sv_http_request_duration_seconds",
  help: "End-to-end duration of HTTP requests by method, route and status code",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers,
});

export const httpSlowRequests = new Counter({
  name: "sv_http_slow_requests_total",
  help: "HTTP requests slower than HTTP_SLOW_REQUEST_MS, by method and route",
  labelNames: ["method", "route"] as const,
  registers,
});

export const httpRequestTimeouts = new Counter({
  name: "sv_http_request_timeouts_total",
  help: "HTTP requests aborted after exceeding HTTP_REQUEST_TIMEOUT_MS, by method and route",
  labelNames: ["method", "route"] as const,
  registers,
});

// --- Maintenance mode (#787) -------------------------------------------------

export const maintenanceMode = new Gauge({
  name: "sv_maintenance_mode",
  help: "1 while maintenance mode is on (as seen by this instance), else 0",
  labelNames: ["source"] as const,
  registers,
});

export const maintenanceRejected = new Counter({
  name: "sv_maintenance_rejected_requests_total",
  help: "Requests rejected with 503 because maintenance mode is on",
  labelNames: ["method"] as const,
  registers,
});

// --- Webhook deliveries (#789) -----------------------------------------------

export const webhookDeliveries = new Counter({
  name: "sv_webhook_deliveries_total",
  help: "Webhook delivery attempts by outcome: delivered, retry, failed (permanent), duplicate (publish deduplicated), skipped (already delivered)",
  labelNames: ["outcome"] as const,
  registers,
});

export const webhookDeliveryDuration = new Histogram({
  name: "sv_webhook_delivery_duration_seconds",
  help: "Duration of one webhook delivery attempt",
  labelNames: ["outcome"] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers,
});

export const webhookDeliveriesInState = new Gauge({
  name: "sv_webhook_deliveries",
  help: "Webhook deliveries currently in each state (sampled when operators list deliveries)",
  labelNames: ["status"] as const,
  registers,
});
