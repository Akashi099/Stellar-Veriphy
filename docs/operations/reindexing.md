# Record Reindexing Operator Guide

This document describes how operators can trigger selective reindexing of records and how to monitor the service-level timeout and slow-response metrics that surface backend bottlenecks.

---

## 1. Record Reindexing

Reindexing refreshes derived data (verification results, provenance links, search indexes) for records without mutating the underlying source records. Use it when:

- Verification data is stale after a rules or provider change.
- Provenance links need to be recomputed after an ingestion fix.
- Search or lookup indexes are out of sync with the source of truth.

### 1.1 Required Permissions

Reindex requests are permission-checked. The caller must hold the `admin:reindex` scope (or an equivalent operator role). Requests without this permission are rejected with `403 Forbidden` and are logged for audit.

- `admin:reindex` — required to submit any reindex request.
- `admin:reindex:all` — required to request a full/global reindex scope.

Support teams should confirm the operator's role before walking them through the workflow.

### 1.2 Endpoint

```
POST /admin/reindex
Content-Type: application/json
```

Request body:

```json
{
  "scope": "record",
  "record_ids": ["rec_123", "rec_456"],
  "targets": ["verification", "provenance"],
  "dry_run": false
}
```

Fields:

| Field        | Required | Description                                                                 |
|--------------|----------|-----------------------------------------------------------------------------|
| `scope`      | Yes      | One of `record`, `collection`, or `all`. See supported scopes below.        |
| `record_ids` | Conditional | Required when `scope` is `record`. List of record identifiers.           |
| `collection` | Conditional | Required when `scope` is `collection`. Collection identifier.            |
| `targets`    | No       | Subset of `verification`, `provenance`, `search`. Defaults to all targets.  |
| `dry_run`    | No       | When `true`, validates and reports the plan without performing work.        |

### 1.3 Supported Scopes

- **`record`** — Reindex specific records by ID. Safest and most common for support workflows.
- **`collection`** — Reindex all records within a single collection.
- **`all`** — Global reindex. Requires `admin:reindex:all`. Use sparingly; subject to stricter rate limits.

### 1.4 Response and Job Status

A successful submission returns `202 Accepted` with a job handle:

```json
{
  "job_id": "reindex_01H...",
  "status": "queued",
  "scope": "record",
  "submitted_at": "2025-01-01T00:00:00Z"
}
```

Poll job status:

```
GET /admin/reindex/{job_id}
```

Example response:

```json
{
  "job_id": "reindex_01H...",
  "status": "running",
  "progress": {
    "total": 2,
    "processed": 1,
    "failed": 0
  },
  "started_at": "2025-01-01T00:00:05Z",
  "updated_at": "2025-01-01T00:00:20Z"
}
```

Status values: `queued`, `running`, `completed`, `failed`, `cancelled`.

Progress fields:

- `total` — number of records/units in scope.
- `processed` — units completed successfully.
- `failed` — units that errored (see `errors` array when present).

### 1.5 Safety Notes

- **Idempotency:** Reindex operations are idempotent. Re-running the same request is safe and will not duplicate derived data. Submitting an identical request while a job is in flight returns the existing `job_id`.
- **Rate limits:** Reindex submissions are rate limited per operator and per scope. `all` scope has the strictest limits. Exceeding limits returns `429 Too Many Requests` with a `Retry-After` header.
- **Dry runs first:** For `collection` and `all` scopes, run with `"dry_run": true` to validate the plan before executing.
- **No source mutation:** Reindexing never modifies source records; it only refreshes derived data. If source data is wrong, fix the source first.
- **Audit:** All reindex submissions and permission denials are recorded in the audit log.

---

## 2. Timeout and Slow-Response Metrics

These service-level metrics surface long-running API calls so operators can identify endpoints needing tuning.

### 2.1 Metric Names

| Metric                                   | Type      | Description                                                        |
|------------------------------------------|-----------|--------------------------------------------------------------------|
| `api_request_duration_seconds`           | Histogram | End-to-end request latency, labeled by `endpoint` and `method`.    |
| `api_request_timeouts_total`             | Counter   | Count of requests that exceeded the timeout threshold.             |
| `api_slow_responses_total`               | Counter   | Count of requests exceeding the slow-response threshold.           |
| `api_inflight_requests`                  | Gauge     | Currently in-flight requests, labeled by `endpoint`.               |

All metrics are labeled by `endpoint`, `method`, and `status` where applicable.

### 2.2 Thresholds

| Threshold          | Default | Notes                                                        |
|--------------------|---------|--------------------------------------------------------------|
| Slow response      | 1000 ms | Requests above this increment `api_slow_responses_total`.    |
| Timeout            | 30000 ms| Requests above this increment `api_request_timeouts_total`.  |

Thresholds are configuration-driven and reviewed as part of capacity planning. Changes to thresholds must be documented here and reviewed by the platform team.

### 2.3 Dashboard Guidance

- Use `api_slow_responses_total` and `api_request_timeouts_total` grouped by `endpoint` to rank endpoints by slow/timeout volume.
- Use the `api_request_duration_seconds` histogram (p95/p99) to spot latency regressions.
- Watch `api_inflight_requests` for saturation on specific endpoints.

Operators should use these signals to identify which endpoints need tuning and escalate accordingly.