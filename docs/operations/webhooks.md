# Outbound webhooks: retries, idempotency and failure tracking

> Issue #789 · Labels: backend, integrations, reliability

`WebhookService` (`backend/src/webhooks/service.ts`) delivers backend events, such as a verification being certified, to the HTTP endpoints in `WEBHOOK_ENDPOINTS`. Each delivery is retried in a controlled way, is never processed twice for the same event, and is visible to operators when it fails.

## Flow

```text
publish(event) ──► webhook_deliveries (one doc per event × endpoint, unique idempotencyKey)
                    │
                    └─► job: notification / webhook.deliver ──► POST endpoint
                                     ▲                           │
                                     │  2xx ─────────────────────┼─► status = delivered
                                     │  transient failure ───────┼─► status = pending, job retried with backoff
                                     └───────────────────────────┘
                           permanent failure / attempts exhausted ─► status = failed (operator)
```

```ts
await webhooks.publish({
  id: `verification.certified:${verification.jobId}`, // stable id ⇒ safe to publish twice
  type: "verification.certified",
  data: { jobId, certId, txHash },
});
```

## Controlled retries

- Each delivery is a job on the `notification` queue. Retries use the queue's exponential backoff with jitter (`JOB_RETRY_BASE_DELAY_MS` up to `JOB_RETRY_MAX_DELAY_MS`), plus its heartbeats, stall recovery and dead-lettering. See [job-queue.md](./job-queue.md).
- Attempts per delivery: `WEBHOOK_MAX_ATTEMPTS` (default 8). With the default backoff that covers about 20 minutes of receiver downtime.
- The HTTP client is called with `retries: 0`, so attempts are never multiplied. The per-attempt timeout comes from `EXTERNAL_API_WEBHOOK_TIMEOUT_MS`, or the default `EXTERNAL_API_TIMEOUT_MS`. See [external-api-timeouts.md](./external-api-timeouts.md).

| Receiver response                                     | Outcome                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `2xx`                                                 | `delivered`. Never sent again.                               |
| Timeout, connection error, `408`, `425`, `429`, `5xx` | Retried until attempts run out, then `failed`                |
| Any other `4xx` (`400`, `401`, `404`, `410`, …)       | `failed` immediately. Resending the same request won't help. |

## Idempotency and deduplication

1. **Publishing is idempotent.** A delivery's `idempotencyKey` is `sha256(endpoint + "\n" + eventId)`, with a unique index on it. Publishing the same event id again does nothing for endpoints that already have a delivery. It is counted as `outcome="duplicate"`.
2. **Delivered stays delivered.** If a delivery job runs again after a successful send (for example, its worker lost the lock), it sees `status: delivered` and skips the send (`outcome="skipped"`). An attempt record never downgrades a delivered delivery.
3. **Receivers can dedupe.** Every attempt of a delivery sends the same `Idempotency-Key` header and a byte-identical body. Receivers should store processed keys and ignore repeats, because at-least-once delivery means a receiver can still see a repeat when its `2xx` response was lost.

### Request format

```http
POST /hooks/veriphy HTTP/1.1
Content-Type: application/json
User-Agent: StellarVeriphy-Webhooks/1.0
Idempotency-Key: 5f1c…e9a2
X-Veriphy-Event-Id: verification.certified:7b3e…
X-Veriphy-Event-Type: verification.certified
X-Veriphy-Delivery-Id: 6710f0c2a4d1e83b5c9f0a12
X-Veriphy-Attempt: 2
X-Veriphy-Timestamp: 1760900000
X-Veriphy-Signature: t=1760900000,v1=3b8f…

{"id":"verification.certified:7b3e…","type":"verification.certified","createdAt":"2026-10-19T18:53:20.000Z","data":{…}}
```

To verify a request, compute `HMAC-SHA256(WEBHOOK_SIGNING_SECRET, "<timestamp>.<raw body>")` and compare it with `v1` in constant time. Reject requests whose timestamp is more than about 5 minutes old. Without `WEBHOOK_SIGNING_SECRET`, requests are unsigned and a warning is logged at startup.

## Failure visibility for operators

| Endpoint (requires `ADMIN_TOKEN`)               | Purpose                                                                                                                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/webhooks/deliveries?status=failed`  | Failed deliveries, newest first, plus `counts` per status. Also accepts `status=pending`, `eventId=…` and `limit` (max 200).              |
| `GET /admin/webhooks/deliveries/:id`            | One delivery with its `attemptHistory` (last 10 attempts: time, duration, HTTP status, error code and message) and `lastError`.           |
| `POST /admin/webhooks/deliveries/:id/redeliver` | Re-sends a `failed` delivery with a fresh attempt budget and the **same** idempotency key. Returns `409` unless the delivery is `failed`. |
| `GET /admin/jobs?correlationId=<eventId>`       | The queue jobs behind an event's deliveries.                                                                                              |

Endpoint URLs are returned without credentials or query strings.

### Logs

| Message                                           | Level | Fields                                                                                           |
| ------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------ |
| `webhook delivered`                               | info  | `deliveryId`, `eventId`, `eventType`, `endpoint`, `httpStatus`, `durationMs`                     |
| `job attempt failed, will retry`                  | warn  | Standard job failure fields; `errorCode` such as `EXTERNAL_HTTP_ERROR` or `EXTERNAL_TIMEOUT`     |
| `webhook delivery failed permanently`             | error | Above plus `attempts`, `reason` (`attempts_exhausted` or `non_retryable_response`)               |
| `could not queue webhook delivery; marked failed` | error | The delivery was stored but its job could not be queued. Redeliver it once the queue is healthy. |

### Metrics

| Metric                                 | Labels                                                            |
| -------------------------------------- | ----------------------------------------------------------------- |
| `sv_webhook_deliveries_total`          | `outcome`: `delivered`, `retry`, `failed`, `duplicate`, `skipped` |
| `sv_webhook_delivery_duration_seconds` | `outcome`                                                         |
| `sv_webhook_deliveries`                | `status`. Sampled when deliveries are listed.                     |
| `sv_jobs{queue="notification"}`        | Backlog of pending delivery jobs                                  |

Suggested alert: `increase(sv_webhook_deliveries_total{outcome="failed"}[15m]) > 0`.

## Configuration

| Variable                          | Default                   | Purpose                                       |
| --------------------------------- | ------------------------- | --------------------------------------------- |
| `WEBHOOK_ENDPOINTS`               | empty (disabled)          | Comma-separated receiver URLs                 |
| `WEBHOOK_SIGNING_SECRET`          | unset                     | HMAC key for `X-Veriphy-Signature`            |
| `WEBHOOK_MAX_ATTEMPTS`            | `8`                       | Attempts before a delivery is marked `failed` |
| `EXTERNAL_API_WEBHOOK_TIMEOUT_MS` | `EXTERNAL_API_TIMEOUT_MS` | Per-attempt timeout                           |

Indexes on `webhook_deliveries`: `idempotencyKey_unique`, `status_updatedAt`, `eventId`. See [database-indexes.md](./database-indexes.md).

## Known edge case

If a delivery job is dead-lettered by stall recovery rather than by the handler (the worker crashed on its last attempt), the delivery stays `pending`. It then appears in `GET /admin/webhooks/deliveries?status=pending` with no recent attempt. Use `POST /admin/jobs/:jobId/retry` on its `jobId` to resume it.
