# Public read cache

Public, unauthenticated asset lookups are served through an in-process cache (`backend/src/lib/cache.ts`, wired up in `CachedVerificationReads` in `backend/src/db/verifications.ts`). It takes repeated lookups of popular assets off MongoDB and makes asset detail reads faster.

## What is cached

| Endpoint                                | Cache                       | What gets stored                                               | TTL                                       |
| --------------------------------------- | --------------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `GET /api/verifications/:jobId`         | `verification_status`       | Only `certified` / `failed` results. These never change again. | `PUBLIC_CACHE_STATUS_TTL_MS` (5 min)      |
| `GET /api/certificates/:certId`         | `verification_cert_id`      | Only `certified` / `failed` records                            | `PUBLIC_CACHE_STATUS_TTL_MS` (5 min)      |
| `GET /api/verifications?contentHash=`   | `verification_content_hash` | The latest verification for the content                        | `PUBLIC_CACHE_CONTENT_HASH_TTL_MS` (30 s) |
| Any of the above, when nothing is found | same cache                  | A "not found" marker                                           | `PUBLIC_CACHE_NEGATIVE_TTL_MS` (5 s)      |

Never cached:

- `pending` / `processing` status. Clients poll these and must see each change.
- `GET /api/verifications?creator=`. This is creator history: paginated, and it changes with every new verification.
- Anything under `/admin`.

Each cache holds at most `PUBLIC_CACHE_MAX_ENTRIES` entries (default 10 000) and evicts the least recently used. Concurrent misses for the same key share one database query.

## Invalidation

Invalidation is predictable because it depends only on time and state:

1. **Terminal records are immutable.** A `certified` or `failed` verification never changes, so a cached copy is always correct. The TTL only bounds memory use.
2. **Mutable lookups have short TTLs.** "Latest verification for this content" can change when the content is verified again. A new result is visible on every instance within `PUBLIC_CACHE_CONTENT_HASH_TTL_MS`.
3. **"Not found" expires quickly.** A newly created record shows up within `PUBLIC_CACHE_NEGATIVE_TTL_MS`.
4. **Explicit invalidation on write.** Code that changes a verification must call `CachedVerificationReads.invalidate(doc)`. This drops the record's `jobId`, `contentHash` and `certId` entries on the local instance right away. Other instances catch up within the TTLs above.
5. **Manual flush.** `DELETE /admin/cache` (admin token required) clears every cache on the instance that receives the request. Send it to each instance, or restart, after fixing data directly in MongoDB.

Set `PUBLIC_CACHE_MAX_ENTRIES=0` to disable caching. Every lookup then goes to MongoDB and is counted as `bypass`.

## Observability

| Metric                                   | Meaning                                                                                       |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sv_cache_requests_total{cache,outcome}` | `outcome` = `hit`, `negative_hit`, `miss`, `coalesced` (shared an in-flight miss) or `bypass` |
| `sv_cache_evictions_total{cache,reason}` | `reason` = `capacity`, `invalidated` or `cleared`                                             |
| `sv_cache_entries{cache}`                | Current size per instance                                                                     |

Hit ratio:

```promql
sum by (cache) (rate(sv_cache_requests_total{outcome=~"hit|negative_hit|coalesced"}[5m]))
  / sum by (cache) (rate(sv_cache_requests_total[5m]))
```

Logs use `component: "cache"`. Every lookup is logged at `debug` as `cache hit`, `cache miss`, `cache negative hit`, `cache coalesced` or `cache bypass`, with `cache`, `outcome` and `key` fields. Set `LOG_LEVEL=debug` to see them. Clears are logged at `info`.

`GET /admin/cache` returns the current entry counts.

## Configuration

| Variable                           | Default  |                                         |
| ---------------------------------- | -------- | --------------------------------------- |
| `PUBLIC_CACHE_MAX_ENTRIES`         | `10000`  | Per cache. `0` disables caching.        |
| `PUBLIC_CACHE_STATUS_TTL_MS`       | `300000` | Terminal status and certificate lookups |
| `PUBLIC_CACHE_CONTENT_HASH_TTL_MS` | `30000`  | Latest verification by content hash     |
| `PUBLIC_CACHE_NEGATIVE_TTL_MS`     | `5000`   | "Not found" results                     |
