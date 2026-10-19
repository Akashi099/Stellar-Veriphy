# Job queue observability

Verification, indexing, and notification work runs as jobs in a MongoDB-backed queue (`backend/src/jobs/`). This page covers how to see what the queue is doing, trace a failure to its cause, and spot retry loops and stalled jobs.

## Job lifecycle

```
enqueue ──► queued ──claim──► running ──success──► succeeded
              ▲                  │
              │   retryable      │ failure / timeout / stall
              └── (backoff) ◄────┤
                                 └── attempts exhausted or
                                     non-retryable ──► dead
```

- **queued** jobs are *ready* once `runAt <= now`. Before that they are *delayed*, waiting out a retry backoff.
- **running** jobs carry `lockedBy` (the worker id `<host>:<pid>/<queue>/<slot>`) and send a heartbeat every `JOB_HEARTBEAT_MS`.
- A running job with no heartbeat for `JOB_STALL_TIMEOUT_MS` is **stalled**. The queue monitor requeues it, or dead-letters it if its attempts are used up, and records a `STALLED` error.
- Retries use exponential backoff with jitter (`JOB_RETRY_BASE_DELAY_MS` up to `JOB_RETRY_MAX_DELAY_MS`) for up to `JOB_MAX_ATTEMPTS` attempts.
- A handler that throws `new JobError(msg, code, false)` goes straight to **dead** without retrying. Use this for errors a retry can't fix, such as invalid input.

## Metrics

**Throughput and failures** (counters, updated as events happen):

| Metric | Use |
|---|---|
| `sv_jobs_enqueued_total{queue,type}` | Inflow |
| `sv_jobs_started_total{queue,type}` | Attempts claimed |
| `sv_jobs_finished_total{queue,type,outcome}` | `outcome` = `succeeded` / `retried` / `dead`. Throughput is `rate(...{outcome="succeeded"})`. |
| `sv_job_failures_total{queue,type,code}` | Every failed attempt by error code. This is the first place to look for *why*. |
| `sv_jobs_stalled_total{queue,type}` | Jobs recovered after their worker died or hung |
| `sv_job_duration_seconds{queue,type,outcome}` | Processing time per attempt |
| `sv_job_wait_seconds{queue,type}` | Time from ready to claimed (worker saturation) |
| `sv_jobs_resumed_total{queue,type}` | Attempts that resumed from a checkpoint instead of starting over |
| `sv_job_checkpoints_total{queue,type}` | Checkpoints saved by long-running handlers |

**Current state** (gauges, sampled every `JOB_MONITOR_INTERVAL_MS`):

| Metric | Use |
|---|---|
| `sv_jobs{queue,state}` | `state` = `ready` / `delayed` / `running` / `dead` |
| `sv_job_oldest_ready_age_seconds{queue}` | Backlog age. If this keeps growing, workers are down or saturated. |
| `sv_jobs_retry_loop_suspects{queue}` | Active jobs at ≥ `JOB_RETRY_LOOP_THRESHOLD` attempts, or stalled at least twice |
| `sv_jobs_heartbeat_overdue{queue}` | Running jobs whose heartbeat is late (hung handler, or about to be recovered) |

Every instance samples the same shared data, so aggregate the gauges with `max by (queue, state)`, not `sum`.

Alert rules are in [`infra/prometheus/alerts.yml`](../../infra/prometheus/alerts.yml) (group `job-queue`).

## Logs

Every job log line carries `jobId`, `queue`, `type`, `attempt`, `maxAttempts`, `correlationId`, and `workerId`. The `correlationId` links a job to the entity it serves (for example the verification `jobId`), so filtering logs on it shows the whole history of a single verification.

| `msg` | Level |
|---|---|
| `job started` (includes `waitedMs`) / `job succeeded` (includes `durationMs`) | info |
| `job attempt failed, will retry` (includes `errorCode`, `error`, `retryInMs`, full `err` with stack and cause) | warn |
| `job moved to dead-letter` (includes `deadReason`: `attempts_exhausted` or `non_retryable_error`) | error |
| `stalled job requeued` / `stalled job moved to dead-letter` (includes `lockedBy`, `lastHeartbeatAt`) | warn |
| `possible job retry loop` (logged once per new attempt) | warn |
| `lost job lock …` / `job finished after its lock was lost` | warn |
| `dead job requeued by operator` (includes `fresh`, `resumeFrom`) | info |
| `job resuming from checkpoint` (includes `checkpointAt`) | info |

## Tracing a failed job to its cause

1. **Which jobs are failing, and with what?** Check `topk(10, sum by (queue, type, code) (rate(sv_job_failures_total[15m])))`, or the `topDeadErrors24h` section of `GET /admin/jobs`.
2. **One job's full story.** `GET /admin/jobs/:id` returns the document. Its `errorHistory` holds the last 10 failures, each with `attempt`, `at`, `workerId`, `durationMs`, `code`, `message`, and `stack`.
3. **Everything for one verification.** `GET /admin/jobs?correlationId=<verification jobId>`, or filter logs on `correlationId`.
4. **The worker's side.** Filter logs on the `workerId` from the error entry to see what that worker was doing around the failure.

## Identifying retry loops and stalled jobs

`GET /admin/jobs` (admin token required) returns:

- `queues`: ready, delayed, running, and dead counts, plus the oldest ready age per queue
- `retryLoops`: active jobs with high attempt counts or repeated stalls, highest attempts first
- `heartbeatOverdue`: running jobs whose heartbeat is late
- `recentDead`: the 20 most recent dead-lettered jobs
- `topDeadErrors24h`: dead-letter causes grouped by queue, type, and code

How to read them:

| Pattern | Likely cause | Action |
|---|---|---|
| `retryLoops` dominated by one `code`, matching a `dependency down` alert | External outage | Fix the dependency (see [health-checks.md](health-checks.md)). Jobs resume on their own. |
| `retryLoops` with a single `code`, no outage | Bug or bad input the handler treats as retryable | Fix the handler or throw `JobError(..., false)`. Retry the dead jobs once fixed. |
| `stalledCount ≥ 2` on the same job | Handler crashes the process (OOM) or hangs past the heartbeat | Look at `lockedBy` pod logs and memory. Consider lowering `JOB_TIMEOUT_MS`. |
| `sv_jobs_heartbeat_overdue > 0` for a long time | Event loop blocked, or handler ignoring `signal` | Profile the handler. Make it honour `ctx.signal`. |
| `ready` growing, `running` at 0 | No worker for that queue, or workers crashed | Check that the queue has handlers in `src/jobs/handlers.ts` and that pods are healthy. |

## Recovery

- Retryable failures and stalls recover automatically.
- Once the cause is fixed, retry a dead job manually with: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://<host>:4000/admin/jobs/<id>/retry`. This resets the attempt budget, keeps `errorHistory`, and increments `manualRetries`. The job resumes from its last checkpoint. Add `?fresh=true` to throw the checkpoint away and start over, for example when the checkpoint itself is the problem.
- Dead jobs are kept for `RETENTION_DEAD_JOB_DAYS` (default 30) and succeeded jobs for `RETENTION_SUCCEEDED_JOB_DAYS` (default 7). See [data-retention.md](data-retention.md).

## Long-running jobs

Verification work such as hashing large media or waiting for on-chain confirmation can take minutes. Handlers get three tools for this from `JobContext` (`backend/src/jobs/worker.ts`). An example is in `backend/src/jobs/handlers.ts`.

### Progress

`ctx.reportProgress({ stage, percent, completed, total, message })` stores `progress` on the job document. Each call also counts as a heartbeat, so a handler that reports progress regularly is never mistaken for stalled.

Progress is visible in three places:

- **Public:** `GET /api/verifications/:jobId/progress`. This returns the latest job for that verification (matched by `correlationId`): `state` (`queued` / `running` / `succeeded` / `dead`), `stage`, `percent`, `completed`, `total`, `attempt`, `maxAttempts`, `resumed`, `nextAttemptAt` (set while waiting for a retry) and `lastErrorCode`. It is never cached.
- **Operators:** `GET /admin/jobs/:id` and `GET /admin/jobs?correlationId=` include `progress`, `checkpointAt`, `resumedCount` and `timeoutMs`.

### Partial retries (checkpoints)

`ctx.saveCheckpoint(state)` stores small, handler-defined resume state on the job, such as the next chunk index or the names of finished steps. On the next attempt, `ctx.checkpoint` holds the last saved value, and the handler skips work that is already done.

| Event | Checkpoint |
|---|---|
| Attempt fails (retryable error) | Kept. The retry resumes from it. |
| Attempt times out (`TIMEOUT`) | Kept |
| Worker crashes or hangs (`STALLED`) | Kept |
| Job dead-lettered | Kept. A manual retry resumes from it unless `?fresh=true`. |
| Job succeeds | Cleared |

Rules for handlers:

- Save a checkpoint after each unit of work is **durably** done, never before.
- Make each unit idempotent. A crash between finishing the work and saving the checkpoint means the unit runs again.
- Keep checkpoints small (well under 1 MB). They live on the job document.
- `saveCheckpoint` throws `LOCK_LOST` if the job was recovered by another worker. Let it propagate. `reportProgress` never throws.

### Timeouts and retries

| Setting | Default | Behaviour |
|---|---|---|
| `JOB_TIMEOUT_MS` | 300 000 (5 min) | Per **attempt**. When it is hit, `ctx.signal` is aborted and the attempt fails with `TIMEOUT` (retryable). |
| `EnqueueOptions.timeoutMs` | — | Per-job override, stored as `timeoutMs`. Use it for job types that legitimately run longer than the default. |
| `JOB_HEARTBEAT_MS` / `JOB_STALL_TIMEOUT_MS` | 10 s / 60 s | A running job with no heartbeat or progress update for the stall timeout is requeued as `STALLED`. |
| `JOB_MAX_ATTEMPTS` | 5 | Total attempts, counting timeouts and stalls. Resumed attempts count too. |
| `JOB_RETRY_BASE_DELAY_MS` / `JOB_RETRY_MAX_DELAY_MS` | 5 s / 10 min | Exponential backoff with jitter between attempts. |

Because each attempt resumes from its checkpoint, a long job that keeps timing out still makes progress. Size `timeoutMs` so that one attempt can finish at least one unit of work. A high `sv_jobs_resumed_total` together with a low success rate means the timeout is too short for the work being done.
