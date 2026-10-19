# ADR-0013: Anomaly Detection for Suspicious Oracle Activity

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Security, Monitoring, Oracle

## Context

Oracle providers are a trusted part of the verification pipeline — they produce
the attestations that eventually justify minting a provenance certificate. A
compromised, misconfigured, or operationally drifting oracle can produce invalid
certificates without any on-chain signal.

Current monitoring only covers per-request success/failure; there is no
population-level view that can distinguish:

- A burst of legitimate high-volume verifications vs. a replay attack.
- A provider with a consistently high failure rate vs. a transient network blip.
- An oracle reusing the same attestation hash across multiple distinct
  verifications (a serious integrity violation).

Alerting also does not distinguish "benign" outliers — scheduled maintenance,
known traffic spikes — from genuine anomalies.

Alternatives considered:

- **Third-party SIEM integration only** — defers the problem to an external
  system and adds a dependency before the signal sources are even defined.
- **Hard-coded threshold checks in the oracle worker** — mixes detection logic
  with orchestration code; hard to test or tune independently.
- **Self-contained detection module with a store interface** — the chosen
  approach: detection logic is pure and testable; the persistence layer is an
  interface that can be swapped.

## Decision

Implement an anomaly detection engine (`packages/shared/anomaly/index.ts`)
with six built-in rules, a configurable threshold object, and a pluggable
`AnomalyAlertStore` interface.

Built-in rules:

| Rule ID                    | Signal                     | Default severity |
| -------------------------- | -------------------------- | ---------------- |
| `failed_attestation_rate`  | Failure rate ≥ 20%         | high             |
| `unexpected_output_volume` | Output count ≥ 3× baseline | medium           |
| `signature_inconsistency`  | ≥ 3 signature failures     | critical         |
| `provider_silence`         | No activity for ≥ 1 hour   | high             |
| `burst_submission`         | Submissions ≥ 5× baseline  | medium           |
| `attestation_reuse`        | Same hash submitted > once | critical         |

Key properties:

- **Maintenance window suppression** — rules `failed_attestation_rate`,
  `unexpected_output_volume`, `provider_silence`, and `burst_submission` are
  suppressed when `snapshot.inMaintenanceWindow === true`. `signature_inconsistency`
  and `attestation_reuse` fire regardless; they indicate integrity violations
  that are not explainable by maintenance.
- **Actionable alerts** — every `AnomalyAlert` carries a `recommendedAction`
  string that can be surfaced directly in PagerDuty / Slack without further
  interpretation.
- **Historical review** — `AnomalyAlertStore.queryHistory` returns alerts in a
  time range, enabling post-incident reconstruction.
- **Acknowledgement workflow** — operators acknowledge alerts via
  `AnomalyAlertStore.acknowledge`; unacknowledged alerts are surfaced via
  `listPending`.

## Consequences

**Easier:**

- Adding a new detection rule requires only a new entry in the rules array;
  the engine and store contract do not change.
- Thresholds are tunable per deployment via `AnomalyDetectionConfig` without
  code changes.
- Rules are independently unit-testable via their `predicate` function.

**Harder:**

- `OracleActivitySnapshot.baselineOutputCount` and
  `baselineSubmissionCount` must be derived from historical data (e.g. a
  7-day rolling average). Computing these baselines is follow-up work for the
  monitoring layer.
- `attestationHashes` must be collected per window by the oracle worker — this
  requires a new field in the job record or a per-window aggregation query.
- The `InMemoryAnomalyAlertStore` is for development only; a production
  implementation must persist alerts to MongoDB or a time-series store and
  support multi-process access.

Closes #685.
