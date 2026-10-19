/**
 * packages/shared/recovery/index.ts
 *
 * Recovery state types and utilities shared between the server job runner
 * and any monitoring / operator tooling.
 *
 * The recovery flow for a failed verification job is:
 *
 *   pending → processing → failed
 *                ↓
 *         recovery_pending → recovery_processing → [certified | recovery_failed]
 *
 * `idempotencyKey` guards against duplicate processing when a retry is
 * triggered more than once (e.g. manual operator retry + automatic backoff).
 *
 * @module shared/recovery
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All states a recovery attempt can be in. */
export type RecoveryStatus =
  | "recovery_pending"
  | "recovery_processing"
  | "recovery_failed"
  | "recovery_succeeded";

/** Reason a job entered the recovery queue. */
export type RecoveryTrigger =
  | "worker_crash"          // process exited mid-job (status was "processing" on restart)
  | "attestation_timeout"   // oracle did not respond within the configured window
  | "provider_error"        // oracle returned a non-retryable error
  | "manifest_mismatch"     // hash verification failed; may be retriable after re-upload
  | "contract_failure"      // on-chain mint call reverted
  | "manual_retry";         // an operator explicitly requested a retry

/** A single recovery attempt record attached to a job. */
export interface RecoveryAttempt {
  /** Attempt sequence number (1-based). */
  attempt: number;
  /** When this attempt was scheduled (ISO 8601). */
  scheduledAt: string;
  /** When this attempt actually started running (ISO 8601). */
  startedAt?: string;
  /** When this attempt finished (ISO 8601). */
  finishedAt?: string;
  /** Outcome of this specific attempt. */
  status: RecoveryStatus;
  /** Human-readable explanation for operators. */
  reason: string;
  /** What caused this recovery attempt. */
  trigger: RecoveryTrigger;
  /**
   * Content-addressable key derived from the job's inputs (jobId + attempt).
   * Stored alongside the job and checked before any work begins so that
   * duplicate retries are skipped without re-running the verification.
   */
  idempotencyKey: string;
}

/** Summary of all recovery activity for a job, suitable for operator dashboards. */
export interface JobRecoveryState {
  /** Collection id — equals `jobId`. */
  id: string;
  jobId: string;
  uploadId: string;
  currentStatus: RecoveryStatus | "none";
  attempts: RecoveryAttempt[];
  lastAttemptAt?: string;
  nextRetryAt?: string;
  maxAttemptsReached: boolean;
  /** True once the job has been successfully recovered (certified). */
  resolved: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of automatic recovery attempts before a job is marked permanently failed. */
export const MAX_RECOVERY_ATTEMPTS = 3;

/** Base delay in milliseconds for exponential-backoff retry scheduling. */
export const RECOVERY_BASE_DELAY_MS = 5_000;

/** Maximum delay cap (5 minutes) so retries don't wait indefinitely. */
export const RECOVERY_MAX_DELAY_MS = 300_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the delay before the next recovery attempt using truncated
 * exponential backoff: `min(base * 2^(attempt-1), max)`.
 */
export function recoveryDelayMs(attempt: number): number {
  const delay = RECOVERY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  return Math.min(delay, RECOVERY_MAX_DELAY_MS);
}

/**
 * Derive an idempotency key from a job id and attempt number.
 * Pure function — no crypto dependency so it works in all environments.
 */
export function recoveryIdempotencyKey(jobId: string, attempt: number): string {
  return `recovery:${jobId}:attempt:${attempt}`;
}

/**
 * Decide whether a job is eligible for an automatic retry given its current
 * recovery state and the trigger that caused the failure.
 *
 * Some triggers (e.g. `manifest_mismatch`) require operator intervention and
 * are not automatically retried.
 */
export function isAutoRetryable(
  state: JobRecoveryState,
  trigger: RecoveryTrigger,
): boolean {
  if (state.maxAttemptsReached) return false;
  if (state.resolved) return false;

  const nonRetryableTriggers: RecoveryTrigger[] = ["manifest_mismatch", "contract_failure"];
  return !nonRetryableTriggers.includes(trigger);
}

/**
 * Build a fresh recovery attempt record.
 */
export function buildRecoveryAttempt(
  jobId: string,
  attempt: number,
  trigger: RecoveryTrigger,
  reason: string,
): RecoveryAttempt {
  return {
    attempt,
    scheduledAt: new Date().toISOString(),
    status: "recovery_pending",
    trigger,
    reason,
    idempotencyKey: recoveryIdempotencyKey(jobId, attempt),
  };
}

/**
 * Create an initial (empty) recovery state for a new job.
 */
export function initialRecoveryState(jobId: string, uploadId: string): JobRecoveryState {
  return {
    id: jobId,
    jobId,
    uploadId,
    currentStatus: "none",
    attempts: [],
    maxAttemptsReached: false,
    resolved: false,
  };
}

/**
 * Append a new attempt to an existing recovery state and recompute derived fields.
 */
export function appendAttempt(
  state: JobRecoveryState,
  attempt: RecoveryAttempt,
): JobRecoveryState {
  const attempts = [...state.attempts, attempt];
  const maxAttemptsReached = attempts.length >= MAX_RECOVERY_ATTEMPTS;
  const nextRetryAt = maxAttemptsReached
    ? undefined
    : new Date(Date.now() + recoveryDelayMs(attempt.attempt)).toISOString();

  return {
    ...state,
    attempts,
    currentStatus: attempt.status,
    lastAttemptAt: attempt.scheduledAt,
    maxAttemptsReached,
    nextRetryAt,
  };
}
