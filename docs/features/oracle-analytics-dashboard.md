# Oracle Analytics Dashboard

Labels: `analytics`, `operations`, `oracle`

## Overview

Operational dashboard tracking oracle throughput, attestation health, quality metrics, and latency across all registered providers. Reduces blind spots in verification reliability and surfaces anomalies that require action.

## Metrics tracked

### Quality overview (6 KPI cards)
| Metric | Description |
|---|---|
| Total verifications | Cumulative across all providers |
| Success rate | `successful / total × 100` — color-coded red/amber/green |
| Avg latency | Mean response time in seconds |
| Active providers | Providers not suspended |
| Suspended | Count of suspended providers |
| Active anomalies | Unresolved anomaly count |

### Provider health table
Per-provider row showing:
- Health status badge (healthy / degraded / critical / unknown)
- Success rate with threshold highlight (red below 70%)
- Avg latency with threshold highlight (amber above 30s)
- Uptime %
- Last checked timestamp
- Inline badges for **Suspended** and **TEE expiring** states

### Throughput chart
24-hour rolling window of hourly verification counts, displayed as a dual-color bar chart (green = successful, red = failed).

### Anomaly list
Active anomaly cards with severity badges (warning / critical), description, provider reference, and detection timestamp. Auto-dismissed when resolved.

## Anomaly types

| Type | Trigger |
|---|---|
| `high_failure_rate` | Provider success rate below 50% |
| `latency_spike` | Response time exceeds threshold |
| `tee_expiry` | TEE hash within 14-day warning window |
| `provider_suspended` | Auto-suspension applied by oracle contract |
| `low_throughput` | Abnormally low request volume |

## Health status derivation

| Status | Condition |
|---|---|
| `healthy` | Success rate ≥ 90%, latency ≤ 30s |
| `degraded` | Success rate ≥ 70% or latency > 30s |
| `critical` | Success rate < 70% or provider suspended |
| `unknown` | No data available |

## Auto-refresh

The dashboard page polls `/api/oracles/analytics` every 60 seconds automatically, with a manual Refresh button.

## API

`GET /api/oracles/analytics` — returns `OracleDashboardData` (quality, providerHealth, throughput, anomalies, snapshotAt).

In production this queries:
- Oracle contract: `get_verification_metrics`, `get_sla_compliance`, `is_provider_suspended`, `get_provider_list`
- Registry contract: `is_tee_hash_near_expiry` for each provider's active TEE hash

## Files

| File | Purpose |
|---|---|
| `packages/shared/types/index.ts` | `OracleDashboardData`, `OracleAttestationHealth`, etc. |
| `frontend/components/dashboard/OracleAnalyticsDashboard.tsx` | Full dashboard component |
| `frontend/app/oracles/analytics/page.tsx` | Dashboard page (auto-refresh) |
| `frontend/app/api/oracles/analytics/route.ts` | API route |
