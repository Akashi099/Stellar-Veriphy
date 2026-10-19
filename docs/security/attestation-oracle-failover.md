# Attestation and Oracle Service Failover

This document describes the failover plan for StellarVeriphy's verification
infrastructure — how the system behaves under provider degradation, partial
outages, or inconsistent network conditions, and how operators restore full
service.

Closes #686.

> **Warning:** The implementation described here is the design-phase
> specification. Do not test; implement only.

---

## Overview

The failover model is defined in `packages/shared/failover/index.ts`. It
introduces a four-state machine that describes the health of the oracle/
attestation provider cluster, and a `DegradedOperationWindow` that documents
exactly which capabilities are available in each state.

---

## Failover states

```
healthy ──degradation_detected──▶ degraded
                                      │
             recovery_completed ◀─────┤─── provider_unresponsive
                                      │
                                      ▼
                                  partial_outage
                                      │
             recovery_completed ◀─────┤─── all_providers_exhausted
                                      │
                                      ▼
                                  full_outage
                                      │
             recovery_completed ◀─────┘
```

| State            | Meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `healthy`        | All providers respond normally                                             |
| `degraded`       | ≥ 1 provider is slow or erroring; failover to another provider is possible |
| `partial_outage` | ≥ 50% of providers are unresponsive; reduced capacity                      |
| `full_outage`    | All providers unresponsive; no dispatch possible                           |

---

## What is available in each state

| Capability                       | `healthy` | `degraded` | `partial_outage` | `full_outage` |
| -------------------------------- | --------- | ---------- | ---------------- | ------------- |
| Accept new jobs                  | ✅        | ✅         | ✅               | ❌            |
| Dispatch jobs                    | ✅        | ✅*        | ✅               | ❌            |
| Mint certificates                | ✅        | ✅         | ✅               | ❌            |
| Finalise with cached attestation | ✅        | ✅*        | ✅*              | ❌            |

\* Controlled by `FailoverConfig.allowDegradedDispatch` and
`allowCachedAttestationFallback` (both `true` by default).

**Trust integrity guarantee:** `canMintCertificates` is only `true` when at
least one healthy provider is reachable. During `full_outage` minting is
blocked regardless of cached state.

---

## Recovery steps

Recovery steps are generated automatically by `evaluateFailoverState` based
on the affected providers and current state. They are surfaced in operator
dashboards and alert notifications.

For reference, the generic steps are:

### `degraded`

1. Investigate affected providers: check oracle worker logs for authentication
   or network errors.
2. Verify the provider's TEE code hash is still approved in the registry
   contract.
3. Monitor provider response times — routing prefers healthy providers
   automatically.
4. If degradation persists beyond the SLA window, escalate to provider support.

### `partial_outage`

1–3. Same as `degraded`. 4. Traffic is being routed to the remaining healthy provider(s). 5. Restore or replace the unresponsive provider(s) and re-register if needed. 6. Monitor the oracle analytics dashboard for latency and error-rate recovery.

### `full_outage`

1–3. Same as `degraded`. 4. Verify network connectivity from the worker host to the Stellar RPC
endpoint. 5. Consider registering a standby oracle provider in the registry contract. 6. Once at least one provider responds, queued jobs resume automatically.

---

## Configuration

`FailoverConfig` controls the thresholds for state transitions:

| Field                            | Default | Meaning                                                              |
| -------------------------------- | ------- | -------------------------------------------------------------------- |
| `unresponsiveThreshold`          | 3       | Consecutive failed health checks before a provider is `unresponsive` |
| `partialOutageThreshold`         | 0.5     | Fraction of providers unresponsive to trigger `partial_outage`       |
| `allowDegradedDispatch`          | `true`  | Route jobs to degraded (non-unresponsive) providers                  |
| `allowCachedAttestationFallback` | `true`  | Allow finalisation with cached attestation                           |

---

## Operational review checklist

Before going to production, reviewers should verify:

- [ ] Oracle workers implement a `/health` or heartbeat endpoint polled by
      the monitoring layer.
- [ ] `evaluateFailoverState` is called on every health-check cycle and the
      result is stored in `FailoverStateRecord`.
- [ ] `FailoverStateRecord` is persisted between process restarts (MongoDB or
      Redis).
- [ ] Operator alerts include the `recoverySteps` array from the
      `DegradedOperationWindow`.
- [ ] A standby oracle provider is registered in the registry contract before
      the primary goes live.
- [ ] The oracle analytics dashboard reflects `currentState` in real time.

---

## Related

- `packages/shared/failover/index.ts` — implementation
- `docs/adr/0012-attestation-oracle-failover.md` — decision record
- `packages/shared/recovery/index.ts` — job-level recovery model
- `packages/shared/anomaly/index.ts` — anomaly detection
- `frontend/lib/oracle/oracleRequestRouter.ts` — request routing
