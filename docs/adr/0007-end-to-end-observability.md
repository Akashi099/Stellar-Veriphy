# ADR-0007: End-to-end tracing and structured observability

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Core maintainers

## Context

The upload → verification → mint pipeline spans multiple system layers:

- An HTTP API route (`/api/uploads`, `/api/jobs`)
- A Node.js in-process worker
- An off-chain oracle router
- An on-chain Soroban contract call (mint)

Without explicit correlation identifiers, a single failed verification job
produces log lines scattered across all of those layers with no way to tie
them together.  Debugging requires matching timestamps manually, which is
error-prone and slow.

Additionally, the existing `observability.ts` only covers the upload and
job-submission routes.  The oracle and contract layers emit no structured
events at all, making it impossible to determine *where* a pipeline stall
occurred in production.

Closes #675.

## Options considered

1. **OpenTelemetry SDK** — industry standard, broad ecosystem support.
   Rejected for now because the SDK adds significant bundle weight and
   requires a running collector sidecar (Jaeger / Zipkin / OTEL Collector)
   that is not part of the current infrastructure.  This is a good eventual
   migration target.

2. **Custom `traceId` forwarded through every log line** — lightweight, zero
   new dependencies, immediately usable with any log aggregator that supports
   JSON field search (ELK, CloudWatch Logs, Datadog).  Chosen for now.

3. **Per-request in-memory trace tree** — captures spans as an in-memory data
   structure for later export.  Useful for request-scoped dashboards but adds
   memory overhead in a stateless serverless deployment.  Included as an
   optional capability in `packages/shared/tracing/index.ts` but not mandated
   for every handler.

## Decision

1. Add `packages/shared/tracing/index.ts` with zero-dependency `Trace`,
   `Span`, and `TraceContext` types plus factory helpers (`createTrace`,
   `startSpan`, `finishSpan`, `traceContextToHeaders`,
   `traceContextFromHeaders`).

2. Define named lifecycle checkpoints in `TRACE_CHECKPOINTS` so all system
   layers use the same event name vocabulary.

3. Add `frontend/lib/server/pipeline-observability.ts` — a `PipelineObserver`
   class that wraps `logOperationalEvent` with a typed method per checkpoint,
   ensuring every step emits consistent field names.

4. Propagate `traceId` via `X-Trace-Id` HTTP header between the client, the
   API routes, and the worker.  Jobs store their `traceId` so the worker can
   emit correlated events even after the originating HTTP request has closed.

## Consequences

- Every pipeline step now emits a structured log event with `traceId` and
  `requestId`, enabling end-to-end correlation in any JSON log aggregator.
- The checkpoint vocabulary is centralized in one place; adding a new step
  means adding an entry to `TRACE_CHECKPOINTS` and a method to
  `PipelineObserver`.
- No external services are required.  The system degrades gracefully to
  unstructured console output if the log aggregator is unavailable.
- When the project is ready to adopt OpenTelemetry, the `Span` and
  `TraceContext` types align closely with the OTEL data model and the
  migration will be largely mechanical.

## Related

- `docs/operations/observability.md` — operator triage guide
- `frontend/lib/server/observability.ts` — base log emitter
- `frontend/lib/server/pipeline-observability.ts` — pipeline-specific observer
- `packages/shared/tracing/index.ts` — shared types and helpers
