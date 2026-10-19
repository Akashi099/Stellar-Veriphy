# End-to-End Observability — Upload and Attestation Pipeline

**Related issue:** #675
**Status:** Implemented

---

## Overview

StellarVeriphy instruments the full lifecycle of every upload and verification
job with structured log events.  Each event carries a `traceId` that
correlates all steps for a single asset from the initial HTTP request through
to the on-chain certificate mint (or a recoverable failure).

---

## Trace lifecycle

```
POST /api/uploads
    │  upload.start
    │  upload.validated
    │  upload.stored
    │
POST /api/jobs
    │  job.enqueued
    │
Worker
    │  oracle.provider_selected
    │  oracle.request_sent
    │  oracle.attestation_received
    │  oracle.attestation_validated
    │  contract.mint_requested
    │  contract.mint_confirmed
    │
    └─ (on failure)
         job.failed
         job.retried        (auto-recovery)
         job.recovered      (when retry succeeds)
```

---

## Trace propagation

Every request to `/api/uploads` or `/api/jobs` is assigned a `requestId`
derived from:

1. The incoming `X-Request-Id` header (client-supplied), or
2. The incoming `X-Correlation-Id` header, or
3. A server-generated `req_{timestamp}_{random}` value.

If the client also supplies `X-Trace-Id`, that value is used as the `traceId`
and propagated through all subsequent log events for the job, allowing
distributed correlation across service boundaries (e.g. a frontend request
that triggers a backend worker that calls a Stellar RPC node).

---

## Structured event reference

All events are emitted as JSON on stdout (or stderr for errors) by
`logOperationalEvent` in `frontend/lib/server/observability.ts` and the
`PipelineObserver` in `frontend/lib/server/pipeline-observability.ts`.

| Event | Level | Description |
|---|---|---|
| `upload.start` | info | File metadata received at POST /api/uploads. |
| `upload.validated` | info | Upload metadata passed all validation rules. |
| `upload.stored` | info | Upload record written to the store; `uploadId` assigned. |
| `job.enqueued` | info | Verification job created; `jobId` assigned. |
| `oracle.provider_selected` | info | An oracle provider was chosen for the job. |
| `oracle.request_sent` | info | Attestation request forwarded to the oracle. |
| `oracle.attestation_received` | info | Raw attestation payload received from oracle. |
| `oracle.attestation_validated` | info/warn/error | Pipeline result: `valid`, `suspicious`, or failure. |
| `contract.mint_requested` | info | On-chain mint call initiated. |
| `contract.mint_confirmed` | info | Certificate minted; `certificateId` and `txHash` recorded. |
| `job.failed` | error | Job could not be completed; reason attached. |
| `job.retried` | warn | Recovery attempt scheduled (trigger and attempt number). |
| `job.recovered` | info | Job successfully completed after a retry. |

---

## Field conventions

| Field | Type | Notes |
|---|---|---|
| `traceId` | string | End-to-end correlation id. |
| `requestId` | string | Per-HTTP-request id (may equal `traceId` for the first hop). |
| `jobId` | string | UUID of the verification job. |
| `uploadId` | string | UUID of the upload record. |
| `manifestHashPrefix` | string (12 hex chars) | Truncated hash for correlation (never the full value). |
| `attestationHashPrefix` | string (12 hex chars) | Truncated hash for correlation. |
| `creatorPrefix` | string | First 12 hex chars of a hash of the creator's public key. |
| `providerAddressPrefix` | string | First 12 chars of the oracle provider address. |
| `attestationStatus` | string | One of: `valid`, `suspicious`, `integrity_failure`, `rejected`, `mismatch`. |
| `riskScore` | number | 0–100; ≥70 triggers a `warn` log. |

Sensitive values (full public keys, full hashes) are **never** logged directly.

---

## Triage guide

### Tracing a job from start to finish

1. Obtain the `traceId` (or `requestId`) from the client or from a user report.
2. Search your log aggregator:
   ```
   traceId="<id>"
   ```
3. Events should appear in the order shown in the lifecycle diagram above.
   Any gap indicates where the pipeline stalled.

### Diagnosing a failed attestation

```
event="oracle.attestation_validated" AND attestationStatus != "valid"
```

Inspect `riskScore` and `attestationStatus`.  Cross-reference with the
pipeline audit entries emitted by `frontend/services/attestationPipelineService.ts`.

### Diagnosing a stuck job

```
event="job.enqueued" AND NOT event="oracle.provider_selected" traceId="<id>"
```

If `oracle.provider_selected` never appears, the worker may not be running or
all providers are suspended.  Check `event="oracle.provider_selected"` for
`RouterError.NoCapacity` detail entries.

### Diagnosing a failed mint

```
event="contract.mint_requested" AND NOT event="contract.mint_confirmed" traceId="<id>"
```

Inspect the Stellar transaction hash in `event="job.failed"` details and look
up the transaction on the Stellar network explorer.

---

## Dashboard queries (example Kibana / CloudWatch filter patterns)

```json
{ "event": "job.failed" }
{ "event": "oracle.attestation_validated", "attestationStatus": "suspicious" }
{ "riskScore": { "$gte": 70 } }
{ "event": "job.retried" }
```

---

## Code locations

| Module | Purpose |
|---|---|
| `frontend/lib/server/observability.ts` | Base `logOperationalEvent` and `requestIdFrom`. |
| `frontend/lib/server/pipeline-observability.ts` | `PipelineObserver` class with per-checkpoint helpers. |
| `packages/shared/tracing/index.ts` | `Trace`, `Span`, `TraceContext` types and factory helpers. |
| `frontend/services/attestationPipelineService.ts` | Attestation validation with inline logging. |
