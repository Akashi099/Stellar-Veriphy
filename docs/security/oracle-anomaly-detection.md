# Oracle Anomaly Detection

This document describes the monitoring approach for detecting suspicious oracle
activity — repeated failed attestations, unexpected output volume, inconsistent
signatures, and other signals that may indicate compromise or operational drift.

Closes #685.

> **Warning:** The implementation described here is the design-phase
> specification. Do not test; implement only.

---

## Overview

The anomaly detection engine is defined in `packages/shared/anomaly/index.ts`.
It evaluates an `OracleActivitySnapshot` — a point-in-time window of one
provider's activity — against six built-in rules and returns a list of
`AnomalyAlert` objects.

Alerts are persisted via the `AnomalyAlertStore` interface. An
`InMemoryAnomalyAlertStore` is provided for development; production deployments
should back this with MongoDB or a time-series store.

---

## Detection rules

| Rule ID                    | Signal                                 | Default severity | Fires during maintenance |
| -------------------------- | -------------------------------------- | ---------------- | ------------------------ |
| `failed_attestation_rate`  | Attestation failure rate ≥ 20%         | `high`           | No                       |
| `unexpected_output_volume` | Output count ≥ 3× baseline             | `medium`         | No                       |
| `signature_inconsistency`  | ≥ 3 signature validation failures      | `critical`       | Yes                      |
| `provider_silence`         | No activity for ≥ 1 hour               | `high`           | No                       |
| `burst_submission`         | Submissions ≥ 5× baseline              | `medium`         | No                       |
| `attestation_reuse`        | Same attestation hash submitted > once | `critical`       | Yes                      |

`signature_inconsistency` and `attestation_reuse` fire even during declared
maintenance windows because they indicate integrity violations that are not
explainable by planned downtime.

---

## Distinguishing anomalies from benign outliers

| Situation              | How the engine handles it                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Scheduled maintenance  | Set `inMaintenanceWindow: true` in the snapshot; suppresses volume/silence/failure rules                                     |
| Known traffic spike    | Raise `baselineOutputCount` and `baselineSubmissionCount` before the event; `outputVolumeMultiplier` is relative to baseline |
| Transient network blip | `provider_silence` only fires after `silenceWindowSec` (default 1 hour); a short blip does not reach this threshold          |
| Legitimate batch job   | Raise baseline or pre-register the batch as a maintenance window                                                             |

---

## Alert lifecycle

1. **Generated** — `detectAnomalies` returns one or more `AnomalyAlert` items.
2. **Saved** — caller persists alerts via `AnomalyAlertStore.save`.
3. **Surfaced** — monitoring dashboard calls `listPending` to show unacknowledged
   alerts; PagerDuty / Slack webhooks can be driven from the same list.
4. **Acknowledged** — operator reviews the alert and calls
   `AnomalyAlertStore.acknowledge` with their identity.
5. **Historical review** — `queryHistory` returns all alerts (including
   acknowledged) within a time range for post-incident analysis.

---

## Alert fields for operators

Every `AnomalyAlert` includes:

| Field               | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `ruleId`            | Which rule fired; links to this document                                       |
| `severity`          | Priority for operator triage                                                   |
| `description`       | Human-readable explanation of the anomaly                                      |
| `recommendedAction` | What the operator should do next                                               |
| `evidence`          | Structured key/value pairs from the snapshot (e.g. `failureRate`, `threshold`) |
| `generatedAt`       | ISO 8601 timestamp for event ordering                                          |
| `acknowledged`      | Whether an operator has reviewed this alert                                    |

---

## Tuning thresholds

Override `DEFAULT_ANOMALY_CONFIG` to adjust for your deployment:

```typescript
import { detectAnomalies, DEFAULT_ANOMALY_CONFIG } from "@stellarveriphy/shared/anomaly";

const myConfig = {
  ...DEFAULT_ANOMALY_CONFIG,
  failedAttestationRateThreshold: 0.1, // tighter: 10% failure rate
  silenceWindowSec: 1800, // shorter: 30 min silence
};

const alerts = detectAnomalies(snapshot, myConfig);
```

---

## Baseline computation

The `baselineOutputCount` and `baselineSubmissionCount` fields in
`OracleActivitySnapshot` must be supplied by the caller. The recommended
approach is a 7-day rolling average computed by the monitoring layer before
constructing the snapshot.

Until the monitoring layer provides baselines, set these to `0` to disable the
`unexpected_output_volume` and `burst_submission` rules.

---

## Integration with the oracle analytics dashboard

The oracle analytics dashboard (`frontend/components/dashboard/OracleAnalyticsDashboard.tsx`)
should be updated to:

1. Display unacknowledged `AnomalyAlert` items alongside the per-provider
   metrics.
2. Allow operators to acknowledge alerts inline.
3. Show a historical alert log filterable by provider, severity, and time range.

---

## Related

- `packages/shared/anomaly/index.ts` — implementation
- `docs/adr/0013-oracle-anomaly-detection.md` — decision record
- `packages/shared/failover/index.ts` — failover model
- `frontend/lib/oracle/oracleRequestRouter.ts` — oracle routing
- `frontend/components/dashboard/OracleAnalyticsDashboard.tsx` — dashboard
