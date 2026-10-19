# Database indexes for verification lookups

All indexes are declared in `backend/src/db/indexes.ts`. That file is the single source of truth: indexes are applied idempotently on startup and by `pnpm --filter backend db:indexes`. Every verification read goes through a repository method (`backend/src/db/verifications.ts`, `sessions.ts`), and each method's comment names the index it relies on.

## Query → index map

### `verifications`

| Query                                                                                          | Repository method         | Index                                                       | Notes                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Status poll by `jobId` (`GET /api/verifications/:jobId`, README's `/api/verify/status/:jobId`) | `getStatus`               | `jobId_unique { jobId: 1 }`                                 | The hottest path. Unique, which also enforces one record per job. Uses a projection so only status fields are returned. |
| Latest verification for a piece of content                                                     | `findLatestByContentHash` | `contentHash_createdAt { contentHash: 1, createdAt: -1 }`   | The sort is satisfied by the index, so there's no in-memory sort.                                                       |
| Creator history, newest first                                                                  | `listByCreator`           | `creator_createdAt { creator: 1, createdAt: -1 }`           | Keyset pagination (`before=<createdAt>`), see below.                                                                    |
| Requests stuck in a status                                                                     | `findStale`               | `status_updatedAt { status: 1, updatedAt: 1 }`              | Also serves the retention safety check (`jobId $in` + `status $in` uses `jobId_unique`).                                |
| Lookup by certificate                                                                          | `findByCertId`            | `certId_unique { certId: 1 }`, partial on `certId` existing | Uncertified records aren't indexed, which keeps the index small.                                                        |

### `verification_sessions` and archive

| Query                                            | Index                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `touch` / point lookup by `sessionId`            | `sessionId_unique`                                                    |
| Resume a creator's latest open session           | `creator_state_lastActivityAt { creator, state, lastActivityAt: -1 }` |
| Close the session when its verification finishes | `verificationJobId` (partial)                                         |
| Retention: stale sessions by state and idle time | `state_lastActivityAt { state, lastActivityAt }`                      |
| Retention: purge old archive entries             | archive `archivedAt`                                                  |
| Operator lookup and restore                      | archive `sessionId`                                                   |

### `jobs`

| Query                                                                                                    | Index                                                 |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Claim the oldest ready job (`queue`, `status: queued`, `runAt ≤ now`, sort `runAt`) and per-queue counts | `queue_status_runAt`                                  |
| Stall detection (`status: running`, `heartbeatAt < cutoff`)                                              | `running_heartbeatAt`, partial on `status: "running"` |
| Recent dead jobs, retention purge of finished jobs                                                       | `status_finishedAt`                                   |
| All jobs for one verification                                                                            | `correlationId` (partial)                             |

### `webhook_deliveries` (#789)

| Query                                                                     | Index                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------- |
| One delivery per (event, endpoint); duplicate publishes rejected          | `idempotencyKey_unique { idempotencyKey: 1 }`   |
| Operator list of failed / pending deliveries, newest first; status counts | `status_updatedAt { status: 1, updatedAt: -1 }` |
| Every delivery of one event                                               | `eventId { eventId: 1 }`                        |

## Decisions

1. **Equality → Sort → Range field order.** Compound indexes put equality-matched fields first, then the sort field, then range fields (for example `queue, status, runAt`). Each query is then one bounded index scan with no blocking sort.
2. **Keyset pagination instead of `skip`.** `skip(n)` still walks and discards _n_ index entries, so page 50 of a creator's history costs 50× page 1. `listByCreator` takes the previous page's last `createdAt` as `before`, so every page is a fresh bounded scan. The API returns `nextCursor` for this.
3. **Unique indexes where the data model requires uniqueness** (`jobId`, `certId`, `sessionId`). The same index serves the lookup and enforces the invariant.
4. **Partial indexes for sparse or narrow fields.** `certId`, `verificationJobId`, and `correlationId` only exist on some documents. The running-jobs index only covers jobs in `running`, a small fraction of the collection. Partial indexes stay small and cheap to maintain. A partial index is only used when the query includes its filter condition (for example `status: "running"`), and the repository queries always include it.
5. **Projections on hot paths.** The status endpoint returns only status fields, so large manifest metadata never crosses the wire.
6. **No TTL indexes.** Expiry is handled by the retention cleaner ([data-retention.md](data-retention.md)), not TTL indexes. That gives safety checks before deletion, metrics, and windows you can change without `collMod`. A TTL index's `expireAfterSeconds` would conflict with `ensureIndexes` whenever the configured window changed.
7. **No index on `status` alone.** `status` has four values. On its own it barely narrows a scan, and it would add write cost to every status transition.

## Observing query performance

- Every MongoDB command is timed into `sv_db_command_duration_seconds{command,collection,outcome}`.
- Commands slower than `MONGODB_SLOW_QUERY_MS` (default 200 ms) increment `sv_db_slow_commands_total` and log a `slow mongodb command` warning. The warning includes the collection and the query _shape_ (filter and sort field names only, never values, which may contain creator keys or hashes).
- To check a query plan, run it with `explain` in `mongosh` and confirm the winning plan is an `IXSCAN` on the expected index, with `totalDocsExamined` close to `nReturned`:

  ```js
  db.verifications
    .find({ creator: "G..." })
    .sort({ createdAt: -1 })
    .limit(20)
    .explain("executionStats");
  ```

## Changing indexes

1. Add, change, or remove the entry in `INDEXES` (`backend/src/db/indexes.ts`), including its `serves` description, and update the tables above.
2. Run `pnpm --filter backend db:indexes` against staging. The report lists:
   - `conflicts`: an index with the same name or key but different options already exists. Drop it manually (`db.<col>.dropIndex("<name>")`) and re-run. This is never done automatically.
   - `unexpected`: indexes in the database that aren't declared. Review them before dropping. They may be ad-hoc fixes someone applied directly.
3. On large collections, build new indexes during low traffic. MongoDB 4.2+ builds indexes without blocking reads and writes, but the build still consumes I/O.

## Regression notes

- The new indexes only add write cost on inserts and updates to the indexed fields. All of them sit on low-write-rate fields, except the `jobs` indexes, which are needed for queue claiming.
- No existing query shape changed. Previously the verification collections had no indexes beyond `_id`, so every lookup was a collection scan.
