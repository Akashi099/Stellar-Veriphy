# ADR-0010: Verification job recovery

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Core maintainers

## Context

A verification job passes through several external dependencies:

- An in-process Node.js worker (subject to process crashes).
- An oracle provider network (subject to timeouts and transient errors).
- An on-chain Soroban contract call (subject to network congestion and reverts).

Any of these can fail after the job has been created but before a certificate
is minted.  Without a recovery mechanism, the job is silently lost and the
creator must re-upload from scratch with no explanation.

Closes #674.

## Options considered

1. **Simple re-enqueue on failure** — enqueue a new job with the same
   `uploadId`.  Simple but creates duplicate processing risk and gives
   operators no visibility into what happened or how many attempts were made.

2. **Dead-letter queue** — failed jobs go to a separate queue for manual
   intervention.  Solves the duplication problem but requires additional
   infrastructure (Redis, SQS, etc.) not present in the current stack.

3. **Structured recovery state on the existing job store** — attach a
   `JobRecoveryState` record alongside each job.  No new infrastructure;
   idempotency keys prevent duplicate processing; operators get full attempt
   history via a REST endpoint.  Chosen.

## Decision

1. Add `packages/shared/recovery/index.ts` with:
   - `RecoveryAttempt` — per-attempt record with trigger, idempotency key,
     schedule, and outcome.
   - `JobRecoveryState` — full history for a job.
   - `recoveryIdempotencyKey()` — deterministic key from `jobId + attempt`.
   - `isAutoRetryable()` — returns false for non-retryable triggers
     (`manifest_mismatch`, `contract_failure`) that require human intervention.
   - `recoveryDelayMs()` — truncated exponential backoff.

2. Add `frontend/lib/server/job-recovery.ts` — server-side runtime that wires
   recovery state into the job store.  Exposes:
   - `recoverInterruptedJobs()` — startup sweep that moves orphaned `processing`
     jobs back to `pending`.
   - `scheduleRecovery()` — automatic retry scheduling with eligibility check.
   - `retryJob()` — operator-triggered manual retry (bypasses eligibility with
     `force: true`).
   - `markRecoverySucceeded()` / `markRecoveryFailed()` — outcome recording.

3. Add `POST /api/jobs/:id/retry` and `GET /api/jobs/:id/retry` endpoints for
   operator tooling.

## Consequences

- Operators have full visibility into recovery state via `GET /api/jobs/:id/retry`.
- Idempotency keys prevent duplicate certificate mints when a retry races with
  a delayed automatic backoff.
- Non-retryable failures surface immediately in logs rather than wasting retry
  budget.
- The in-process approach means recovery is bounded by server memory.  At high
  scale a persistent queue (SQS, BullMQ) would be a better substrate — this
  design is intentionally simple for the current deployment footprint and can
  be replaced without changing the `packages/shared/recovery` types.

## Related

- `docs/operations/job-recovery.md` — operator runbook
- `packages/shared/recovery/index.ts` — shared types and helpers
- `frontend/lib/server/job-recovery.ts` — server-side runtime
- `frontend/app/api/jobs/[id]/retry/route.ts` — REST endpoints
