import type { ObjectId } from "mongodb";

export const Collections = {
  verifications: "verifications",
  sessions: "verification_sessions",
  sessionsArchive: "verification_sessions_archive",
  jobs: "jobs",
  locks: "locks",
  settings: "settings",
  webhookDeliveries: "webhook_deliveries",
} as const;

// --- Verifications -----------------------------------------------------------

/** Mirrors VerificationStatus in packages/shared/types. */
export type VerificationStatus = "pending" | "processing" | "certified" | "failed";

/** A verification request and its on-chain outcome. Never touched by retention cleanup. */
export interface VerificationDoc {
  _id?: ObjectId;
  /** Public id used by GET /api/verify/status/:jobId. */
  jobId: string;
  contentHash: string;
  manifestHash: string;
  /** Stellar public key (G...). */
  creator: string;
  storageRef: string;
  status: VerificationStatus;
  certId?: string;
  txHash?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// --- Verification sessions ---------------------------------------------------

/**
 * open      – creator is uploading / editing the manifest
 * submitted – handed off to a verification job (in flight; never auto-cleaned)
 * completed – linked verification reached a terminal state
 * abandoned – creator cancelled
 * expired   – app marked the session expired
 */
export type SessionState = "open" | "submitted" | "completed" | "abandoned" | "expired";

/** Temporary, per-upload working state. Subject to retention cleanup. */
export interface VerificationSessionDoc {
  _id?: ObjectId;
  sessionId: string;
  creator: string;
  state: SessionState;
  verificationJobId?: string;
  /** Reference to a temporary upload in the storage layer, if any. */
  tempUploadRef?: string;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface ArchivedSessionDoc extends VerificationSessionDoc {
  archivedAt: Date;
  archiveReason: "idle" | "completed";
}

// --- Jobs --------------------------------------------------------------------

export const QUEUE_NAMES = ["verification", "indexing", "notification", "reindex"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

// --- Reindexing (#854) -------------------------------------------------------

/**
 * Selective reindex request for verification / provenance data (#854).
 * Exactly one of `verificationIds` or `contentHashes` must be provided.
 */
export interface ReindexJobPayload {
  /** Verification jobIds to refresh. */
  verificationIds?: string[];
  /** Content hashes whose verification/provenance records should be refreshed. */
  contentHashes?: string[];
  /** Operator (or service) that requested the reindex; recorded for auditing. */
  requestedBy: string;
  /** How many records to process per batch; defaults to REINDEX_DEFAULT_BATCH_SIZE. */
  batchSize?: number;
}

export const REINDEX_DEFAULT_BATCH_SIZE = 100;
export const REINDEX_MAX_BATCH_SIZE = 1000;

/**
 * queued    – waiting for a worker (ready when runAt <= now, otherwise delayed for retry backoff)
 * running   – claimed by a worker that sends periodic heartbeats
 * succeeded – finished successfully
 * dead      – failed permanently (attempts exhausted or non-retryable error)
 */
export type JobStatus = "queued" | "running" | "succeeded" | "dead";

export interface JobErrorEntry {
  attempt: number;
  at: Date;
  workerId: string;
  durationMs: number;
  code: string;
  message: string;
  stack?: string;
}

/** Progress a long-running handler reports via ctx.reportProgress (#781). */
export interface JobProgress {
  /** 0–100, when the handler can estimate it. */
  percent?: number;
  /** Short machine-friendly step name, e.g. "hashing", "anchoring". */
  stage?: string;
  /** Units done / total, e.g. chunks hashed. */
  completed?: number;
  total?: number;
  message?: string;
  updatedAt: Date;
}

export interface JobDoc<P = unknown> {
  _id?: ObjectId;
  queue: QueueName;
  type: string;
  payload: P;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  lockedBy?: string;
  lockedAt?: Date;
  heartbeatAt?: Date;
  /** Ties a job to the entity it serves (e.g. a verification jobId) for tracing. */
  correlationId?: string;
  lastError?: JobErrorEntry;
  /** Most recent failures, newest last (capped). */
  errorHistory: JobErrorEntry[];
  stalledCount: number;
  manualRetries?: number;
  /** Per-job attempt timeout; overrides JOB_TIMEOUT_MS. */
  timeoutMs?: number;
  progress?: JobProgress;
  /**
   * Handler-defined resume state saved via ctx.saveCheckpoint. Kept across failed, timed-out and
   * stalled attempts so the next attempt resumes instead of starting over (#781).
   */
  checkpoint?: unknown;
  checkpointAt?: Date;
  /** Attempts that started from a saved checkpoint. */
  resumedCount?: number;
}

// --- Locks -------------------------------------------------------------------

export interface LockDoc {
  _id: string;
  owner: string;
  acquiredAt: Date;
  lockedUntil: Date;
}

// --- Runtime settings --------------------------------------------------------

/** Operator-controlled maintenance flag (#787). Stored as settings/_id="maintenance". */
export interface MaintenanceDoc {
  _id: "maintenance";
  enabled: boolean;
  /** Shown to users; falls back to MAINTENANCE_MESSAGE when unset. */
  message?: string;
  /** Expected end of the window; drives Retry-After and the banner countdown. */
  endsAt?: Date;
  /** Also stop workers from claiming new jobs (in-flight jobs finish normally). */
  pauseJobs: boolean;
  startedAt?: Date;
  updatedAt: Date;
  updatedBy: string;
}

// --- Webhook deliveries (#789) -------------------------------------------------

/**
 * pending   – waiting for its first attempt or a retry (the backing job is queued or running)
 * delivered – the endpoint answered 2xx; never sent again
 * failed    – permanent failure (attempts exhausted or a non-retryable response); needs an operator
 */
export type WebhookDeliveryStatus = "pending" | "delivered" | "failed";

export interface WebhookAttemptEntry {
  attempt: number;
  at: Date;
  durationMs: number;
  /** HTTP status, when the endpoint answered. */
  httpStatus?: number;
  outcome: "delivered" | "retry" | "failed";
  errorCode?: string;
  error?: string;
}

/** One event sent to one endpoint. Unique per (event, endpoint) via idempotencyKey. */
export interface WebhookDeliveryDoc {
  _id?: ObjectId;
  /** sha256(endpoint + eventId); sent as the Idempotency-Key header. */
  idempotencyKey: string;
  eventId: string;
  eventType: string;
  endpoint: string;
  /** Exact JSON body sent on every attempt, so retries are byte-identical. */
  body: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  /** Most recent attempts, newest last (capped). */
  attemptHistory: WebhookAttemptEntry[];
  lastError?: { code: string; message: string; httpStatus?: number; at: Date };
  jobId?: ObjectId;
  manualRedeliveries?: number;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt?: Date;
  failedAt?: Date;
}
