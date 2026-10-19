/**
 * frontend/lib/server/job-recovery.ts
 *
 * Server-side recovery logic for failed and interrupted verification jobs.
 *
 * This module is the runtime counterpart to the shared recovery types in
 * `packages/shared/recovery/index.ts`.  It wires the type-level recovery
 * model into the actual job store used by the verification worker.
 *
 * ## Recovery flow
 *
 * 1. On server start `recoverInterruptedJobs()` is called.  Any job still in
 *    the `"processing"` state was orphaned by a previous process crash.  It is
 *    moved back to `"pending"` and a `RecoveryAttempt` record is attached.
 * 2. When a job fails during normal processing, `scheduleRecovery()` is called.
 *    It checks whether automatic retry is eligible and, if so, schedules the
 *    next attempt after the appropriate backoff delay.
 * 3. Operators can trigger a manual retry via `POST /api/jobs/:id/retry`, which
 *    calls `retryJob()` regardless of the auto-retry eligibility.
 * 4. `getRecoveryState()` returns the full recovery history for a job.
 *
 * @module lib/server/job-recovery
 */

import {
  MAX_RECOVERY_ATTEMPTS,
  buildRecoveryAttempt,
  initialRecoveryState,
  appendAttempt,
  isAutoRetryable,
  recoveryDelayMs,
  type RecoveryTrigger,
  type JobRecoveryState,
} from "@stellarveriphy/shared/recovery";
import type { VerificationJob } from "@stellarveriphy/shared";
import { collection } from "./json-collection";
import { logOperationalEvent } from "./observability";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const recoveryStore = () => collection<JobRecoveryState>("job-recovery-states");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Called on server startup.  Any job stuck in `"processing"` was orphaned by
 * a previous process crash — move it back to `"pending"` and record the event.
 *
 * Returns the number of jobs that were recovered.
 */
export async function recoverInterruptedJobs(
  getAllJobs: () => Promise<VerificationJob[]>,
  putJob: (job: VerificationJob) => Promise<void>,
): Promise<number> {
  const jobs = await getAllJobs();
  const interrupted = jobs.filter((j) => j.status === "processing");

  let count = 0;
  for (const job of interrupted) {
    const state = (await recoveryStore().get(job.id)) ?? initialRecoveryState(job.id, job.uploadId);
    const attempt = buildRecoveryAttempt(
      job.id,
      state.attempts.length + 1,
      "worker_crash",
      "Job was in 'processing' state on server startup; assumed orphaned by a process restart.",
    );
    const updated = appendAttempt(state, attempt);
    await recoveryStore().put(updated);
    await putJob({ ...job, status: "pending", startedAt: undefined });

    logOperationalEvent("warn", "job.recovered_after_crash", {
      route: "worker",
      operation: "recover_interrupted_jobs",
      jobId: job.id,
      uploadId: job.uploadId,
      details: { attempt: attempt.attempt, idempotencyKey: attempt.idempotencyKey },
    });
    count++;
  }

  return count;
}

/**
 * Schedule an automatic recovery attempt for a failed job (if eligible).
 *
 * Returns the updated `JobRecoveryState` if a retry was scheduled, or `null`
 * if the job is not eligible for automatic retry (max attempts reached, or
 * trigger is non-retryable).
 */
export async function scheduleRecovery(
  jobId: string,
  uploadId: string,
  trigger: RecoveryTrigger,
  reason: string,
): Promise<JobRecoveryState | null> {
  const existing = (await recoveryStore().get(jobId)) ?? initialRecoveryState(jobId, uploadId);

  if (!isAutoRetryable(existing, trigger)) {
    logOperationalEvent("warn", "job.recovery_skipped", {
      route: "worker",
      operation: "schedule_recovery",
      jobId,
      uploadId,
      details: {
        reason: "Not eligible for automatic retry",
        trigger,
        attempts: existing.attempts.length,
        maxAttemptsReached: existing.maxAttemptsReached,
      },
    });
    return null;
  }

  const nextAttemptNumber = existing.attempts.length + 1;
  const attempt = buildRecoveryAttempt(jobId, nextAttemptNumber, trigger, reason);
  const updated = appendAttempt(existing, attempt);
  await recoveryStore().put(updated);

  logOperationalEvent("info", "job.recovery_scheduled", {
    route: "worker",
    operation: "schedule_recovery",
    jobId,
    uploadId,
    details: {
      attempt: nextAttemptNumber,
      trigger,
      idempotencyKey: attempt.idempotencyKey,
      nextRetryAt: updated.nextRetryAt,
      delayMs: recoveryDelayMs(nextAttemptNumber),
    },
  });

  return updated;
}

/**
 * Trigger a manual retry for a job, bypassing the auto-retry eligibility check.
 * Used by operator tooling and the `POST /api/jobs/:id/retry` endpoint.
 *
 * Returns the updated state, or throws if the job already has too many
 * attempts (operators must acknowledge the limit by passing `force: true`).
 */
export async function retryJob(
  jobId: string,
  uploadId: string,
  options: { force?: boolean } = {},
): Promise<JobRecoveryState> {
  const existing = (await recoveryStore().get(jobId)) ?? initialRecoveryState(jobId, uploadId);

  if (existing.maxAttemptsReached && !options.force) {
    throw new Error(
      `Job ${jobId} has reached the maximum of ${MAX_RECOVERY_ATTEMPTS} recovery attempts. ` +
        "Pass force: true to override.",
    );
  }

  const nextAttemptNumber = existing.attempts.length + 1;
  const attempt = buildRecoveryAttempt(jobId, nextAttemptNumber, "manual_retry", "Operator-triggered manual retry.");
  const updated = appendAttempt(existing, attempt);
  await recoveryStore().put(updated);

  logOperationalEvent("info", "job.manual_retry_scheduled", {
    route: "POST /api/jobs/:id/retry",
    operation: "retry_job",
    jobId,
    uploadId,
    details: {
      attempt: nextAttemptNumber,
      idempotencyKey: attempt.idempotencyKey,
      forced: options.force ?? false,
    },
  });

  return updated;
}

/**
 * Mark a job's latest recovery attempt as succeeded.
 */
export async function markRecoverySucceeded(
  jobId: string,
  certificateId?: string,
): Promise<void> {
  const state = await recoveryStore().get(jobId);
  if (!state) return;

  const lastAttempt = state.attempts[state.attempts.length - 1];
  if (!lastAttempt) return;

  const finishedAt = new Date().toISOString();
  const updatedAttempt = {
    ...lastAttempt,
    status: "recovery_succeeded" as const,
    finishedAt,
  };

  const updatedAttempts = [...state.attempts.slice(0, -1), updatedAttempt];
  await recoveryStore().put({
    ...state,
    attempts: updatedAttempts,
    currentStatus: "recovery_succeeded",
    resolved: true,
  });

  logOperationalEvent("info", "job.recovery_succeeded", {
    route: "worker",
    operation: "mark_recovery_succeeded",
    jobId,
    details: { certificateId, attempt: lastAttempt.attempt },
  });
}

/**
 * Mark a job's latest recovery attempt as failed.
 */
export async function markRecoveryFailed(jobId: string, reason: string): Promise<void> {
  const state = await recoveryStore().get(jobId);
  if (!state) return;

  const lastAttempt = state.attempts[state.attempts.length - 1];
  if (!lastAttempt) return;

  const finishedAt = new Date().toISOString();
  const updatedAttempt = {
    ...lastAttempt,
    status: "recovery_failed" as const,
    finishedAt,
  };

  const updatedAttempts = [...state.attempts.slice(0, -1), updatedAttempt];
  const maxAttemptsReached = updatedAttempts.length >= MAX_RECOVERY_ATTEMPTS;

  await recoveryStore().put({
    ...state,
    attempts: updatedAttempts,
    currentStatus: "recovery_failed",
    maxAttemptsReached,
  });

  logOperationalEvent("error", "job.recovery_attempt_failed", {
    route: "worker",
    operation: "mark_recovery_failed",
    jobId,
    details: { attempt: lastAttempt.attempt, reason, maxAttemptsReached },
  });
}

/**
 * Retrieve the full recovery state for a job (empty state if never recorded).
 */
export async function getRecoveryState(jobId: string, uploadId: string): Promise<JobRecoveryState> {
  return (await recoveryStore().get(jobId)) ?? initialRecoveryState(jobId, uploadId);
}
