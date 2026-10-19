# Data retention and stale-session cleanup

Verification sessions and job records are temporary working state. A scheduled cleanup removes them once they're no longer useful, so the collections and their indexes stay small. The rules live in `backend/src/maintenance/cleanup.ts`.

## Retention rules

| Task | Applies to | Rule (defaults) | Action |
|---|---|---|---|
| `archive_idle_sessions` | `verification_sessions` in state `open`, `abandoned`, or `expired` | no activity for `RETENTION_IDLE_SESSION_HOURS` (24h) | move to archive |
| `archive_completed_sessions` | `verification_sessions` in state `completed` | no activity for `RETENTION_COMPLETED_SESSION_DAYS` (7d) | move to archive |
| `purge_session_archive` | `verification_sessions_archive` | archived more than `RETENTION_ARCHIVE_DAYS` (90d) ago | delete |
| `purge_succeeded_jobs` | `jobs` with status `succeeded` | finished more than `RETENTION_SUCCEEDED_JOB_DAYS` (7d) ago | delete |
| `purge_dead_jobs` | `jobs` with status `dead` | finished more than `RETENTION_DEAD_JOB_DAYS` (30d) ago | delete |
| `purge_orphaned_media` | files under `MEDIA_STORAGE_DIR` | no record references the file, and it is older than `ORPHAN_MEDIA_MIN_AGE_HOURS` (48h) | delete file (see [Orphaned media](#orphaned-media)) |

"Activity" means `lastActivityAt`. The app updates it on every interaction with a session (`SessionRepository.touch`).

## What cleanup never removes

- **`verifications`**: verification records and certificate references are user data and the product's audit trail. No retention rule touches this collection, and the cleanup code refuses to delete from any collection not on its allow-list (see [backup-retention.md](backup-retention.md#2-protection-from-accidental-deletion-enforced-in-code)).
- **Sessions in state `submitted`**: their verification is in flight.
- **Any session whose linked verification is `pending` or `processing`**, whatever the session's own state. These are counted as `skippedActive` in the report.
- **Queued or running jobs**: only `succeeded` and `dead` jobs are purged.
- **On-chain data**: Soroban contract storage is immutable from the backend's point of view.

## Safety guarantees

- **Archive before delete.** Sessions are copied to `verification_sessions_archive` with `archivedAt` and `archiveReason`, then removed. The archive keeps a 90-day recovery window.
- **Re-checked at delete time.** The delete re-applies the staleness filter. A session that becomes active between the copy and the delete is kept, and its archive copy is removed.
- **Idempotent.** Archive writes are upserts keyed by `_id`, so a crash part-way through a batch is resolved by the next run.
- **Bounded.** Work happens in batches of `RETENTION_BATCH_SIZE` (500), up to `RETENTION_MAX_BATCHES_PER_RUN` (20) per task per run. When a backlog exceeds that, the report sets `truncated: true` and the next run continues.
- **Single runner.** A lease lock in the `locks` collection keeps scheduled and manual runs from overlapping across instances. The lease expires after 30 minutes if its holder dies.
- **Isolated failures.** If one task fails, it's logged and counted, and the remaining tasks still run.

## Schedule

Every instance runs the scheduler (first run 1 minute after start, then every `RETENTION_INTERVAL_MINUTES`, default 60), but only the lock holder does the work. Set `RETENTION_CLEANUP_ENABLED=false` to turn it off, for example during a data migration.

## Running it manually

Always do a dry run first. It only counts the records that currently match each rule:

```bash
pnpm --filter backend retention:dry-run
# or, against a running instance:
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "http://<host>:4000/admin/maintenance/cleanup?dryRun=1"
```

Apply:

```bash
pnpm --filter backend retention:cleanup
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://<host>:4000/admin/maintenance/cleanup
```

Both commands return one report per task: `archived`, `deleted`, `skippedActive`, `truncated`, `durationMs`, and `error`, if any. A manual run returns `409` while another run holds the lock.

## Restoring an archived session

```js
const doc = db.verification_sessions_archive.findOne({ sessionId: "<id>" });
delete doc.archivedAt; delete doc.archiveReason;
doc.lastActivityAt = new Date();       // otherwise the next run archives it again
db.verification_sessions.insertOne(doc);
db.verification_sessions_archive.deleteOne({ _id: doc._id });
```

## Temporary uploads

Archived sessions keep `tempUploadRef`, so their upload survives as long as the session can be restored. Once the archive entry is purged after `RETENTION_ARCHIVE_DAYS`, nothing references the file any more, and the orphaned media task removes it.

## Orphaned media

`purge_orphaned_media` (`backend/src/maintenance/orphans.ts`) deletes media files that no record or upload state points to. It runs as the last retention task, on the same schedule and under the same lock. It is active only when `MEDIA_STORAGE_DIR` is set and `ORPHAN_MEDIA_CLEANUP_ENABLED` is not `false`.

**A file is kept when any of these is true:**

- `verifications.storageRef` references it. This is certified media and is never removed.
- `verification_sessions.tempUploadRef` references it, whatever state the session is in, including `open` and `submitted`.
- `verification_sessions_archive.tempUploadRef` references it, so it can still be restored.
- It was modified within the last `ORPHAN_MEDIA_MIN_AGE_HOURS` (48h). This covers the gap between a file being written and its record being saved.

References match `local://<path>`, `<path>` and `/<path>`. References for another storage backend (for example `ipfs://…`) never match a local file, so they don't protect one, and the task never deletes outside `MEDIA_STORAGE_DIR`.

**Safety:**

- **Safety ceiling.** If more than `ORPHAN_MEDIA_MAX_DELETE_PERCENT` (25%) of scanned files look orphaned, the run deletes nothing. It logs `orphaned media cleanup aborted by safety limit` and the task reports a failure. This usually means `MEDIA_STORAGE_DIR` and `MONGODB_DB` belong to different environments. If the backlog is real, raise the limit for one run.
- **Re-checked at delete time.** References are checked again just before deleting. A file that gained a record during the scan is kept (counted as `rescued` in the log).
- **Bounded.** Each run scans at most `RETENTION_BATCH_SIZE × RETENTION_MAX_BATCHES_PER_RUN` files and sets `truncated: true` when there are more.
- **Dry run.** `pnpm --filter backend retention:dry-run` or `POST /admin/maintenance/cleanup?dryRun=true` reports `scanned`, `matched` (orphans) and `skippedActive` (referenced) without deleting anything.

**Logs** (`component: "orphan-media"`):

- `orphaned media scan started`: the scope (`storage`, `minAgeHours`, `maxDeletePercent`, `dryRun`).
- `orphaned media cleanup completed` / `orphaned media dry run`: `scanned`, `referenced`, `tooRecent`, `orphaned`, `orphanBytes`, `rescued`, `deleted`, `failed`, `deletedBytes`, `truncated`, and up to 50 `sampleKeys`.
- `failed to delete orphaned media` (warn): per file. The file is retried on the next run.
- `orphaned media deleted` (debug): per file.

| Variable | Default | |
|---|---|---|
| `MEDIA_STORAGE_DIR` | unset | Root of the media store. Cleanup is inactive when this is unset. |
| `ORPHAN_MEDIA_CLEANUP_ENABLED` | `true` | Set to `false` to switch off the task |
| `ORPHAN_MEDIA_MIN_AGE_HOURS` | `48` | Grace period for new files |
| `ORPHAN_MEDIA_MAX_DELETE_PERCENT` | `25` | Safety ceiling per run |

## Monitoring

| Metric | Meaning |
|---|---|
| `sv_cleanup_runs_total{task,outcome}` | Runs by `success` / `failure` |
| `sv_cleanup_records_total{task,action}` | Records `archived` / `deleted` |
| `sv_cleanup_duration_seconds{task}` | Task duration |
| `sv_cleanup_last_success_timestamp_seconds{task}` | Last successful run |
| `sv_orphan_media_objects_total{storage,outcome}` | Orphaned files `deleted` / `failed` |
| `sv_orphan_media_deleted_bytes_total{storage}` | Storage reclaimed |

Logs use `component: "retention"`, with `retention task completed`, `retention task failed`, and `retention backlog exceeds per-run limit`. Alerts are in group `retention` of [`infra/prometheus/alerts.yml`](../../infra/prometheus/alerts.yml).

## Changing the rules

Any change to the retention windows must keep the guarantees above. Update this page in the same change. Shortening a window takes effect on the next run, so do a dry run against production first to see how many records it would affect.
