/**
 * packages/shared/tracing/index.ts
 *
 * Lightweight end-to-end tracing primitives shared across the frontend and
 * any Node.js service layer.  Intentionally zero-dependency: no OpenTelemetry
 * SDK is imported here, so this module is safe for both browser and server
 * bundles.
 *
 * ## Concepts
 *
 * - **Trace**: a logical end-to-end operation (e.g. "upload + attestation + mint").
 * - **Span**: a single named step within a trace.  Each span carries timing,
 *   status, and structured attributes.
 * - **TraceContext**: the propagation envelope that flows with every request
 *   so spans from different services can be correlated.
 *
 * ## Usage
 *
 * ```typescript
 * import { createTrace, startSpan, finishSpan, SpanStatus } from "@stellarveriphy/shared/tracing";
 *
 * const trace = createTrace("upload-and-verify");
 * const span  = startSpan(trace, "hash-content", { fileName: "photo.jpg" });
 * // ... do work ...
 * const finished = finishSpan(span, SpanStatus.Ok);
 * ```
 *
 * @module shared/tracing
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Named lifecycle checkpoints used across frontend, oracle, and contracts. */
export const TRACE_CHECKPOINTS = {
  // Upload path
  UPLOAD_START: "upload.start",
  UPLOAD_VALIDATED: "upload.validated",
  UPLOAD_STORED: "upload.stored",
  JOB_ENQUEUED: "job.enqueued",

  // Verification / oracle path
  ORACLE_SELECTED: "oracle.provider_selected",
  ORACLE_REQUEST_SENT: "oracle.request_sent",
  ORACLE_ATTESTATION_RECEIVED: "oracle.attestation_received",
  ORACLE_ATTESTATION_VALIDATED: "oracle.attestation_validated",

  // Contract path
  CONTRACT_MINT_REQUESTED: "contract.mint_requested",
  CONTRACT_MINT_CONFIRMED: "contract.mint_confirmed",

  // Failure / recovery
  JOB_FAILED: "job.failed",
  JOB_RETRIED: "job.retried",
  JOB_RECOVERED: "job.recovered",
} as const;

export type TraceCheckpoint = (typeof TRACE_CHECKPOINTS)[keyof typeof TRACE_CHECKPOINTS];

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export enum SpanStatus {
  /** Span completed successfully. */
  Ok = "ok",
  /** Span completed with a non-fatal warning. */
  Warning = "warning",
  /** Span terminated due to an error. */
  Error = "error",
  /** Span started but has not yet finished. */
  InProgress = "in_progress",
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/** Portable propagation envelope.  Attach to HTTP headers or job records. */
export interface TraceContext {
  /** Globally unique trace identifier (UUID v4 or similar). */
  traceId: string;
  /** Identifier of the immediate parent span, if any. */
  parentSpanId?: string;
  /**
   * Optional human-readable name for the root operation.
   * Useful for log aggregation ("what overall flow does this trace belong to?")
   */
  operationName?: string;
}

/** Immutable record of a single unit of work. */
export interface Span {
  /** Span identifier (unique within the trace). */
  spanId: string;
  /** Trace this span belongs to. */
  traceId: string;
  /** Parent span id (absent for the root span). */
  parentSpanId?: string;
  /** Human-readable name for this step. */
  name: string;
  /** ISO 8601 start time. */
  startedAt: string;
  /** ISO 8601 finish time (absent while the span is still open). */
  finishedAt?: string;
  /** Duration in milliseconds (set when finishedAt is populated). */
  durationMs?: number;
  /** Span outcome. */
  status: SpanStatus;
  /** Structured metadata attached at span creation or finish time. */
  attributes: Record<string, unknown>;
  /** Error message if status is Error. */
  errorMessage?: string;
}

/** Lightweight trace object grouping related spans. */
export interface Trace {
  traceId: string;
  operationName: string;
  startedAt: string;
  spans: Span[];
}

// ---------------------------------------------------------------------------
// ID generation (crypto-safe where available, fallback elsewhere)
// ---------------------------------------------------------------------------

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/**
 * Create a new trace for a top-level operation.
 *
 * @param operationName   Human-readable label (e.g. "upload-and-verify").
 * @param existingTraceId Reuse a trace id forwarded from an upstream service.
 */
export function createTrace(operationName: string, existingTraceId?: string): Trace {
  return {
    traceId: existingTraceId ?? generateId(),
    operationName,
    startedAt: new Date().toISOString(),
    spans: [],
  };
}

/**
 * Open a new span within an existing trace.
 * The span is appended to `trace.spans` and returned for further mutation.
 */
export function startSpan(
  trace: Trace,
  name: string,
  attributes: Record<string, unknown> = {},
  parentSpanId?: string,
): Span {
  const span: Span = {
    spanId: generateId(),
    traceId: trace.traceId,
    parentSpanId,
    name,
    startedAt: new Date().toISOString(),
    status: SpanStatus.InProgress,
    attributes,
  };
  trace.spans.push(span);
  return span;
}

/**
 * Close an open span, recording its outcome and optional error message.
 * Returns the mutated span (same object reference as was opened).
 */
export function finishSpan(
  span: Span,
  status: SpanStatus,
  attributes: Record<string, unknown> = {},
  errorMessage?: string,
): Span {
  const now = new Date().toISOString();
  span.finishedAt = now;
  span.durationMs = Date.parse(now) - Date.parse(span.startedAt);
  span.status = status;
  span.attributes = { ...span.attributes, ...attributes };
  if (errorMessage) span.errorMessage = errorMessage;
  return span;
}

/**
 * Produce a {@link TraceContext} propagation envelope from a trace and optional
 * current span.  Pass this in HTTP headers or persist it with a job record.
 */
export function toTraceContext(trace: Trace, currentSpan?: Span): TraceContext {
  return {
    traceId: trace.traceId,
    parentSpanId: currentSpan?.spanId,
    operationName: trace.operationName,
  };
}

/**
 * Derive HTTP propagation headers from a {@link TraceContext}.
 * Compatible with the W3C `traceparent` convention for broad interoperability.
 */
export function traceContextToHeaders(ctx: TraceContext): Record<string, string> {
  const headers: Record<string, string> = {
    "x-trace-id": ctx.traceId,
  };
  if (ctx.parentSpanId) headers["x-span-id"] = ctx.parentSpanId;
  if (ctx.operationName) headers["x-operation-name"] = ctx.operationName;
  return headers;
}

/**
 * Extract a {@link TraceContext} from HTTP request headers.
 * Falls back to generating a fresh trace id when no headers are present.
 */
export function traceContextFromHeaders(headers: Record<string, string | null | undefined>): TraceContext {
  const traceId =
    headers["x-trace-id"] ?? headers["x-request-id"] ?? headers["x-correlation-id"] ?? generateId();
  return {
    traceId,
    parentSpanId: headers["x-span-id"] ?? undefined,
    operationName: headers["x-operation-name"] ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

/** Return a compact, log-friendly summary of a finished trace. */
export function summariseTrace(trace: Trace): Record<string, unknown> {
  const finished = trace.spans.filter((s) => s.finishedAt);
  const errors = trace.spans.filter((s) => s.status === SpanStatus.Error);
  const warnings = trace.spans.filter((s) => s.status === SpanStatus.Warning);
  const totalDurationMs =
    finished.length > 0
      ? Date.parse(finished[finished.length - 1].finishedAt!) - Date.parse(trace.startedAt)
      : null;

  return {
    traceId: trace.traceId,
    operationName: trace.operationName,
    startedAt: trace.startedAt,
    totalDurationMs,
    spanCount: trace.spans.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    hasErrors: errors.length > 0,
    errorSpans: errors.map((s) => ({ name: s.name, message: s.errorMessage })),
  };
}
