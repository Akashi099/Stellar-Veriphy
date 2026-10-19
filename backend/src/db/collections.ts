import type { ObjectId } from "mongodb";

export const Collections = {
  verifications: "verifications",
  sessions: "verification_sessions",
  sessionsArchive: "verification_sessions_archive",
  jobs: "jobs",
  locks: "locks",
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

export const QUEUE_NAMES = ["verification", "indexing", "notification"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

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
