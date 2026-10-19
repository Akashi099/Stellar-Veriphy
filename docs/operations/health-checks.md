# External integration health checks

The backend probes every external dependency on a schedule and reports the results through HTTP endpoints, Prometheus metrics, and structured logs. Each probe lives in `backend/src/health/checks.ts`, and `backend/src/health/monitor.ts` runs them.

## Endpoints

| Endpoint                         | Purpose                                                                                                        | Status codes                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `GET /health/live`               | Liveness. Confirms the process is up. Does not check any dependency.                                           | `200`                                  |
| `GET /health/ready`              | Readiness. Fails when a **critical** dependency is down or has not been checked yet.                           | `200` / `503`                          |
| `GET /health`                    | Full report: overall status plus every dependency's state, latency, last success, error, and remediation hint. | `200`, or `503` when overall is `down` |
| `POST /admin/health/:name/check` | Re-runs one check right away. Use it to confirm a fix. Requires `ADMIN_TOKEN`.                                 | `200` / `404`                          |

Wire the orchestrator's liveness probe to `/health/live` and its readiness probe to `/health/ready`. Don't point liveness at `/health`, because an outage at an external provider would then restart every pod.

The overall `status` in `GET /health` is:

- `down` when a critical dependency is down or unknown
- `degraded` when any non-critical dependency is down, or any dependency is degraded
- `up` otherwise

## Dependencies

| Name              | When checked            | What the probe does                                                                   | `degraded` when                                                                                                    |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `mongodb`         | always                  | `ping` command                                                                        | n/a                                                                                                                |
| `stellar_horizon` | always                  | `GET /` on `STELLAR_HORIZON_URL`; verifies the network passphrase                     | the latest ledger is older than `STELLAR_MAX_LEDGER_AGE_SECONDS`, or ingestion is more than 10 ledgers behind Core |
| `soroban_rpc`     | always                  | JSON-RPC `getHealth` + `getNetwork`; verifies the passphrase                          | n/a                                                                                                                |
| `ipfs`            | `IPFS_API_URL` set      | `POST /api/v0/version` (Kubo)                                                         | n/a                                                                                                                |
| `kms`             | `KMS_HEALTH_URL` set    | `GET` the URL; 2xx is required, and a JSON `status` of `degraded`/`down` is respected | the service reports `degraded`                                                                                     |
| `tee_oracle`      | `ORACLE_HEALTH_URL` set | same as `kms`                                                                         | the service reports `degraded`                                                                                     |

Only `mongodb` is critical by default (`HEALTH_CRITICAL_DEPENDENCIES=mongodb`). External Stellar and storage providers are reported but don't gate readiness. A Horizon outage should degrade verification features. It should not pull every pod out of the load balancer, because status lookups served from MongoDB still work during it.

A passphrase mismatch is reported as `down` with reason `misconfigured`. It means the URL points at the wrong network (for example, mainnet Horizon with `STELLAR_NETWORK=testnet`).

## How a check runs

1. Every `HEALTH_CHECK_INTERVAL_MS` (default 30s), all checks run in parallel.
2. Each attempt is capped at `HEALTH_CHECK_TIMEOUT_MS` (default 5s) and aborted on timeout.
3. A failed attempt is retried up to `HEALTH_CHECK_RETRIES` times (default 2) with short jittered backoff, so a single dropped request doesn't flip the state.
4. If every attempt fails, the dependency is marked `down` with a classified `reason`: `timeout`, `connection`, `http_error`, `invalid_response`, `unhealthy`, `misconfigured`, or `error`.

## Monitoring

| Metric                                                     | Meaning                                 |
| ---------------------------------------------------------- | --------------------------------------- |
| `sv_dependency_health{dependency,critical}`                | `2` = up, `1` = degraded, `0` = down    |
| `sv_dependency_consecutive_failures{dependency}`           | Failed checks in a row (0 when healthy) |
| `sv_dependency_check_failures_total{dependency,reason}`    | Failure count by reason                 |
| `sv_dependency_check_duration_seconds{dependency,outcome}` | Check latency, including retries        |
| `sv_dependency_last_success_timestamp_seconds{dependency}` | Last time the dependency was usable     |

Alert rules are in [`infra/prometheus/alerts.yml`](../../infra/prometheus/alerts.yml) (group `dependencies`). These metrics are also charted on the [infrastructure health dashboard](infrastructure-dashboard.md).

## Logs

All logs are JSON lines with `component: "health"` and a `dependency` field.

| `msg`                                                   | Level       | When                                                                               |
| ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `dependency check passed`                               | info        | First successful check after startup                                               |
| `dependency down`                                       | error       | Transition into `down`. Includes `reason`, `error`, `remediation`, `lastSuccessAt` |
| `dependency still down`                                 | warn        | Every 10th consecutive failed check                                                |
| `dependency recovered`                                  | info        | Transition out of `down`. Includes `downtimeSeconds` and `failedChecks`            |
| `dependency degraded` / `dependency no longer degraded` | warn / info | Degraded transitions                                                               |

## Recovery and retries

No manual reset is needed. When a dependency comes back, the next scheduled check marks it up and logs `dependency recovered`. The MongoDB driver reconnects automatically. Work that depends on an external provider runs as queued jobs, which retry with exponential backoff (see [job-queue.md](job-queue.md)), so nothing is lost during an outage. It is delayed.

| Dependency        | Impact while down                                                                   | Operator action                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `mongodb`         | Pod becomes unready; all reads and writes fail                                      | Check `MONGODB_URI`, network policy, and replica set health. Restart the pod if it doesn't recover within minutes of MongoDB returning. |
| `stellar_horizon` | Account and ledger lookups fail; verification jobs retry                            | Check https://status.stellar.org. If the provider is the problem, set `STELLAR_HORIZON_URL` to a fallback and redeploy.                 |
| `soroban_rpc`     | Contract submissions (oracle/provenance/registry) fail; jobs retry                  | Check the provider status. Switch `STELLAR_SOROBAN_RPC_URL` to a fallback if the outage persists.                                       |
| `ipfs`            | Uploads and storage reads fail; indexing jobs retry                                 | Restart or scale the IPFS node and check its disk space.                                                                                |
| `kms`             | Encryption and decryption fail. Uploads must be rejected, never stored unencrypted. | Check KMS credentials and key availability.                                                                                             |
| `tee_oracle`      | Verification jobs wait in the queue (`sv_job_oldest_ready_age_seconds` rises)       | Check the oracle worker and its Nitro Enclave. The jobs drain once it's back.                                                           |

After a fix, confirm it right away with:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://<host>:4000/admin/health/soroban_rpc/check
```

## Adding a dependency

1. Add a probe factory to `backend/src/health/checks.ts` that resolves with `{ status: "up" | "degraded" }` or throws a `HealthCheckError` with a reason.
2. Give it a `remediation` string that an on-call engineer can act on.
3. Register it in `buildDependencyChecks`.
4. Add a row to the tables above.
