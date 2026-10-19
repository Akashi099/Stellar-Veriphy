# Verification Job Recovery

**Related issue:** #674
**Status:** Implemented

---

## Overview

When a verification job fails mid-request — because a worker process crashed,
an oracle provider timed out, or the on-chain mint reverted — StellarVeriphy
routes it through a structured recovery flow rather than silently discarding it.

The recovery flow is designed so that:

- **State is always visible**: operators can see exactly how many attempts have
  been made, why each one was triggered, and what the next retry window is.
- **Duplicate processing is prevented**: every attempt is guarded by an
  `idempotencyKey` derived from `jobId + attemptNumber`.  If the same attempt
  is triggered twice (e.g. operator retry + automatic backoff), the second
  trigger is a no-op.
- **Non-retryable failures surface immediately**: manifest hash mismatches and
  on-chain contract failures are not automatically retried because they require
  operator or creator intervention.

---

## Recovery state machine

```
pending → processing → certified
                ↓
             failed
                ↓
        recovery_pending → recovery_processing → certified
                                     ↓
                              recovery_failed
                                     ↓
                       (up to MAX_RECOVERY_ATTEMPTS=3)
```

---

## Recovery triggers

| Trigger | Auto-retry? | Reason |
|---|---|---|
| `worker_crash` | ✅ Yes | Job was in `processing` on server startup; process was restarted. |
| `attestation_timeout` | ✅ Yes | Oracle did not respond within the configured window. |
| `provider_error` | ✅ Yes | Oracle returned a transient error (e.g. HTTP 503). |
| `manual_retry` | ✅ Yes | Operator triggered a retry via the API. |
| `manifest_mismatch` | ❌ No | The stored hash does not match the manifest; creator must re-upload. |
| `contract_failure` | ❌ No | On-chain mint reverted; requires operator investigation. |

---

## Retry backoff schedule

Automatic retries use truncated exponential backoff:

| Attempt | Delay |
|---|---|
| 1st retry | 5 s |
| 2nd retry | 10 s |
| 3rd retry | 20 s |
| Further | Capped at 5 minutes (`RECOVERY_MAX_DELAY_MS`) |

After `MAX_RECOVERY_ATTEMPTS` (3) the job is left in `recovery_failed`.
Operators can override this via `POST /api/jobs/:id/retry?force=true`.

---

## API reference

### `POST /api/jobs/:id/retry`

Manually schedule a recovery attempt for a failed job.

**Query parameters:**
- `force=true` — bypass the max-attempts limit (use with care).

**Responses:**

| Status | Meaning |
|---|---|
| 202 | Recovery attempt scheduled; response body contains `JobRecoveryState`. |
| 404 | No job with this ID. |
| 409 | Max attempts reached; add `?force=true` to override. |

### `GET /api/jobs/:id/retry`

Return the full `JobRecoveryState` for a job, including all past attempts.

**Response:**

```json
{
  "status": "ok",
  "data": {
    "jobId": "uuid",
    "uploadId": "uuid",
    "currentStatus": "recovery_pending",
    "attempts": [
      {
        "attempt": 1,
        "scheduledAt": "2026-09-27T21:00:00Z",
        "trigger": "worker_crash",
        "idempotencyKey": "recovery:uuid:attempt:1",
        "status": "recovery_succeeded",
        "finishedAt": "2026-09-27T21:00:05Z"
      }
    ],
    "lastAttemptAt": "2026-09-27T21:00:00Z",
    "nextRetryAt": null,
    "maxAttemptsReached": false,
    "resolved": true
  }
}
```

---

## Operator runbook

### Step 1 — Find failed jobs

```
event="job.failed"
```

Note the `jobId` and `reason`.

### Step 2 — Check recovery state

`GET /api/jobs/{jobId}/retry`

Look at `currentStatus`, `attempts.length`, and `maxAttemptsReached`.

### Step 3 — Decide recovery path

| `reason` | Action |
|---|---|
| Transient error (timeout, provider error) | Wait for auto-retry, or `POST /retry` to accelerate. |
| `manifest_mismatch` | Ask the creator to re-upload the asset. |
| `contract_failure` | Check the Stellar transaction in `details.txHash`. |
| Max attempts reached | Investigate root cause, then `POST /retry?force=true`. |

### Step 4 — Confirm recovery

Poll `GET /api/jobs/{jobId}` until `status` transitions to `"certified"`.
Structured log event `job.recovered` will appear once the attempt succeeds.

---

## Code locations

| Module | Purpose |
|---|---|
| `packages/shared/recovery/index.ts` | Types, constants, pure helper functions. |
| `frontend/lib/server/job-recovery.ts` | Server-side recovery runtime (store wiring, logging). |
| `frontend/app/api/jobs/[id]/retry/route.ts` | `POST` and `GET` API endpoints. |
