# Backup and retention for verification artifacts

> **Status:** Policy and recovery procedures for #809. The rules below are enforced in code where noted. The backup schedule and retention periods are proposed values; they take effect once the reviewers in [Review and sign-off](#review-and-sign-off) approve them.

This document covers the off-chain records that make a verification recoverable: the `verifications` collection, the session and job state around it, and their backups. It complements [data retention and stale-session cleanup](data-retention.md), which describes the automated cleanup rules in detail, and [long-term archive strategy](archive-retention-strategy.md), which covers the provenance records on-chain and in IPFS.

---

## 1. What counts as a critical artifact

| Artifact                                                                      | Collection                      | Why it is critical                                                             | Automated deletion                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Verification records (hashes, status, certificate and transaction references) | `verifications`                 | User-facing records and the audit trail. Certificates are looked up from here. | **Never.** Enforced in code (see §2).                                                                          |
| Single-runner lock                                                            | `locks`                         | Stops two instances from running cleanup at once.                              | **Never.** Enforced in code.                                                                                   |
| Verification sessions                                                         | `verification_sessions`         | Temporary upload state. Reconstructable from the user.                         | Yes, under [data-retention.md](data-retention.md).                                                             |
| Archived sessions                                                             | `verification_sessions_archive` | Recovery window for sessions removed by cleanup.                               | Yes, after `RETENTION_ARCHIVE_DAYS` (90).                                                                      |
| Jobs                                                                          | `jobs`                          | Verification work queue and error history.                                     | Only `succeeded` and `dead` jobs, after `RETENTION_SUCCEEDED_JOB_DAYS` (7) and `RETENTION_DEAD_JOB_DAYS` (30). |

On-chain certificates and provenance records are outside this document. They are immutable and cannot be deleted from the backend.

---

## 2. Protection from accidental deletion (enforced in code)

Retention cleanup can only delete from collections on an allow-list, `RETENTION_DELETABLE_COLLECTIONS` in `backend/src/maintenance/protection.ts`:

- `verification_sessions`
- `verification_sessions_archive`
- `jobs`

Every delete path checks this list first, including dry runs, so a misconfigured rule fails loudly instead of deleting data. A collection that is not on the list is protected by default, so a new collection needs an explicit decision before cleanup can touch it. Unit tests in `backend/test/retention-protection.test.ts` cover the list (`pnpm --filter backend test:retention`).

Adding a collection to the allow-list is a policy change. Update this document in the same pull request.

Protection from cleanup is not a backup. Accidental deletion can also come from a manual script, an operator, or a bad migration. The backups in §3 are what cover those cases.

---

## 3. Backup policy

| Item             | Rule (proposed)                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Scope            | `verifications`, `verification_sessions`, `verification_sessions_archive`, `jobs` (the `locks` collection is not backed up) |
| Frequency        | Daily full logical backup, taken during the lowest-traffic window                                                           |
| Daily retention  | 35 days                                                                                                                     |
| Weekly retention | 12 weeks (one backup per week kept beyond the daily window)                                                                 |
| Storage          | Off the database host, in encrypted storage with access limited to the operations role                                      |
| Integrity        | Each backup stores a SHA-256 checksum next to the archive. The checksum is verified before any restore.                     |
| Restore test     | Monthly restore into a scratch database, followed by the checks in §5.2                                                     |

### Taking a backup

Use `mongodump` against the production URI. Store the output in the backup location and record its checksum:

```bash
DATE=$(date -u +%Y%m%dT%H%M%SZ)
OUT="backups/verifications-${DATE}.archive.gz"

DB="${MONGODB_DB:-stellarveriphy}"

mongodump \
  --uri "$MONGODB_URI" \
  --nsInclude "$DB.verifications" \
  --nsInclude "$DB.verification_sessions" \
  --nsInclude "$DB.verification_sessions_archive" \
  --nsInclude "$DB.jobs" \
  --gzip --archive="$OUT"

sha256sum "$OUT" > "$OUT.sha256"
```

Do not back up `locks`. It holds short-lived lease documents, and restoring it could block the scheduler.

---

## 4. Retention rules

| Data                                       | Rule                                                                        |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `verifications`                            | Kept indefinitely. The backend has no code path that deletes these records. |
| Sessions in `open`, `abandoned`, `expired` | Archived after `RETENTION_IDLE_SESSION_HOURS` (24) of inactivity            |
| Sessions in `completed`                    | Archived after `RETENTION_COMPLETED_SESSION_DAYS` (7)                       |
| Archived sessions                          | Deleted after `RETENTION_ARCHIVE_DAYS` (90)                                 |
| Backups (daily)                            | 35 days, then deleted                                                       |
| Backups (weekly)                           | 12 weeks, then deleted                                                      |

The database retention rules are in [data-retention.md](data-retention.md). A backup copy of a verification is only removed by the backup rotation above. It is never removed because the live record was changed.

---

## 5. Recovery procedures

### 5.1 Restore verification records into a scratch database

Use this when records were lost or corrupted and you need to check the backup before touching production.

1. Verify the archive checksum: `sha256sum -c backups/<file>.archive.gz.sha256`. Stop if it fails.
2. Restore into a scratch database, not the live one:

   ```bash
   mongorestore \
     --uri "$SCRATCH_MONGODB_URI" \
     --gzip --archive=backups/<file>.archive.gz \
     --nsFrom "stellarveriphy.verifications" \
     --nsTo "stellarveriphy_restore.verifications"
   ```

3. Run the checks in §5.2 against the scratch database.
4. Only after the checks pass, decide how to merge. Prefer inserting missing `jobId` values over replacing existing documents. Replacing a live record can overwrite a newer status.

### 5.2 Checks before a restore is accepted

- Record count is at least the count recorded at the time of the backup.
- Every document has a `jobId`, `status`, and `createdAt`.
- For every `certified` record with a `txHash`, the transaction exists on the Stellar network and the certificate ID matches the on-chain certificate. [provenance-replay-recovery.md](provenance-replay-recovery.md) covers the on-chain side.
- `certId` is unique (`certId_unique` index in `backend/src/db/indexes.ts`).

### 5.3 Recover an archived session

Archived sessions are kept for `RETENTION_ARCHIVE_DAYS` (90). Restore one with the query in [data-retention.md](data-retention.md#restoring-an-archived-session). Nothing is lost while it is in the archive.

### 5.4 Accidental deletion of verifications

1. Stop writes to the affected collection if the cause is still active (for example, a running script). Do not restart cleanup until the cause is known.
2. Find the most recent backup taken before the deletion.
3. Follow §5.1 to restore into a scratch database, then §5.2 to check it.
4. Merge only the missing documents into production. Record the restore in [deployment-log.md](deployment-log.md) or the incident record.
5. Confirm any affected certificates against the chain.

### 5.5 Job queue state

Dead jobs are kept for 30 days for investigation. To retry one after its cause is fixed, use the procedure in [job-recovery.md](job-recovery.md). Do not restore `jobs` from backup to fix a single job. That would reset progress on every other job.

---

## 6. Review and sign-off

Both the rules and the recovery procedures need a review before they are relied on. Record the review here.

| Role              | Name      | Date      | Outcome   |
| ----------------- | --------- | --------- | --------- |
| Operations owner  | _pending_ | _pending_ | _pending_ |
| Backend owner     | _pending_ | _pending_ | _pending_ |
| Security reviewer | _pending_ | _pending_ | _pending_ |

Review the policy each quarter, and after any change to the retention settings or to `RETENTION_DELETABLE_COLLECTIONS`. Run a restore test (§5.1 and §5.2) at least monthly and record the result.
