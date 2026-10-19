import type { ObjectId } from "mongodb";

export const Collections = {
  verifications: "verifications",
  sessions: "verification_sessions",
  sessionsArchive: "verification_sessions_archive",
  jobs: "jobs",
  locks: "locks",
  settings: "settings",
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
