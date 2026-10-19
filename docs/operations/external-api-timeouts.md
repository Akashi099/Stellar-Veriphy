# External API timeouts and retries

> Issue #788 · Labels: backend, api, reliability

Every backend call to a third-party HTTP API goes through `ExternalApiClient` (`backend/src/lib/http.ts`). That includes Horizon, Soroban RPC, IPFS, KMS, the TEE oracle and webhook receivers. The client gives each call:

- a **per-attempt timeout** covering connect, response headers and body
- an **overall deadline** across all attempts and backoff
- a **bounded, opt-in retry policy**, with exponential backoff, jitter and `Retry-After` support
- one error type, `ExternalApiError`, with the same metadata every time, plus metrics and structured logs

## Configuration

Defaults apply to every service:

| Variable                           | Default | Meaning                                                                                                             |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `EXTERNAL_API_TIMEOUT_MS`          | `10000` | Limit for one attempt.                                                                                              |
| `EXTERNAL_API_RETRIES`             | `2`     | Retries after the first attempt. Hard-capped at **5** in code, whatever the configured value. `0` disables retries. |
| `EXTERNAL_API_RETRY_BASE_DELAY_MS` | `250`   | First backoff. It doubles each retry, with equal jitter.                                                            |
| `EXTERNAL_API_RETRY_MAX_DELAY_MS`  | `5000`  | Cap on any single backoff, including a server's `Retry-After`.                                                      |
| `EXTERNAL_API_TOTAL_TIMEOUT_MS`    | `30000` | Budget for the whole call. No attempt runs past it, and no retry starts if it can't fit.                            |

Override any of them for one service with `EXTERNAL_API_<SERVICE>_<SETTING>`:

```bash
EXTERNAL_API_HORIZON_TIMEOUT_MS=5000
EXTERNAL_API_SOROBAN_RPC_RETRIES=1
EXTERNAL_API_WEBHOOK_TOTAL_TIMEOUT_MS=15000
```

Service names: `HORIZON`, `SOROBAN_RPC`, `IPFS`, `KMS`, `TEE_ORACLE`, `WEBHOOK`. Invalid values (negative or non-integer) fail startup with a clear error.

## When a call is retried

A failed attempt is retried only if **all** of these hold:

1. **The failure is transient**: a timeout, a connection error, or HTTP `408`, `425`, `429`, `500`, `502`, `503` or `504`. Other `4xx` codes, non-JSON responses and caller cancellation are never retried.
2. **The request is safe to resend**: `GET`, `HEAD`, `OPTIONS`, `PUT` or `DELETE`. A `POST` or `PATCH` is retried only when the caller passes `idempotent: true`, for example a webhook delivery carrying an idempotency key. A Soroban transaction submission is **not** retried by the client, because the job queue owns that retry.
3. **Retries remain**: `attempt <= retries`.
4. **The backoff fits in the overall deadline.**

The backoff is `min(retryMaxDelayMs, max(exponential backoff with jitter, Retry-After))`.

> **Avoid stacking retries.** When the caller already retries (the job queue, `HealthMonitor`), give the client `retries: 0` so attempts don't multiply. Health probes do this. They use `HEALTH_CHECK_TIMEOUT_MS` as their deadline and `HEALTH_CHECK_RETRIES` for retries.

## Error metadata

Every failure throws `ExternalApiError`. `err.code` is `EXTERNAL_<REASON>`, which the job queue uses as its error code. `err.meta` holds:

| Field        | Example                                | Notes                                                                                                    |
| ------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `service`    | `horizon`                              |                                                                                                          |
| `method`     | `GET`                                  |                                                                                                          |
| `url`        | `https://horizon-testnet.stellar.org/` | Credentials and query string removed                                                                     |
| `reason`     | `timeout`                              | `timeout`, `connection`, `http_error`, `invalid_response` or `aborted`                                   |
| `status`     | `503`                                  | Only for `http_error` and `invalid_response`                                                             |
| `attempts`   | `3`                                    | Attempts actually made                                                                                   |
| `timeoutMs`  | `10000`                                | Per-attempt limit used on the last attempt                                                               |
| `durationMs` | `10734`                                | Whole call, including backoff                                                                            |
| `retryable`  | `true`                                 | Whether the failure type is transient. A job handler can use it to decide on `JobError(..., retryable)`. |

Log lines (JSON, level `warn`):

```json
{"level":"warn","msg":"external api call failed, retrying","service":"horizon","method":"GET","url":"https://horizon-testnet.stellar.org/","reason":"http_error","status":503,"attempt":1,"maxAttempts":3,"retryInMs":312}
{"level":"warn","msg":"external api call failed","service":"horizon","method":"GET","url":"https://horizon-testnet.stellar.org/","reason":"timeout","attempts":3,"timeoutMs":10000,"durationMs":21130,"retryable":true,"err":{"name":"ExternalApiError","code":"EXTERNAL_TIMEOUT","message":"..."}}
```

Cancellations by the caller (`reason: "aborted"`, for example a job that hit its own timeout) are not logged as failures.

## Metrics

| Metric                                     | Labels                         | Use                                                                                     |
| ------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------- |
| `sv_external_api_requests_total`           | `service`, `method`, `outcome` | Per-attempt success/failure rate. Alert on `rate(...{outcome!="success"}) / rate(...)`. |
| `sv_external_api_request_duration_seconds` | `service`, `outcome`           | Latency per attempt. Compare its p99 with the configured timeout.                       |
| `sv_external_api_retries_total`            | `service`, `reason`            | Retry volume. A sustained rise means the provider is flaky or the timeout is too tight. |

## Usage

```ts
import { externalApiPolicy } from "../config.js";
import { ExternalApiClient, ExternalApiError } from "../lib/http.js";

const horizon = new ExternalApiClient("horizon", externalApiPolicy("horizon"), log);

const account = await horizon.json<HorizonAccount>(`${horizonUrl}/accounts/${id}`, { signal });

// Non-idempotent call made safe with an idempotency key:
await client.request(url, {
  method: "POST",
  body,
  headers: { "idempotency-key": key },
  idempotent: true,
  policy: { retries: 0 }, // e.g. when the job queue retries instead
});
```

## Tuning guidance

- Set the per-attempt timeout to roughly **3× the provider's p99 latency**. Use `sv_external_api_request_duration_seconds`.
- Keep `retries × timeout + backoff` under `TOTAL_TIMEOUT_MS`. Otherwise later attempts get cut short by the deadline.
- For calls made inside an HTTP request, keep `TOTAL_TIMEOUT_MS` well below the client's own timeout. For calls inside jobs, keep it below `JOB_TIMEOUT_MS`.
