/**
 * frontend/lib/server/pipeline-observability.ts
 *
 * End-to-end trace propagation for resumable uploads, verification jobs,
 * attestation validation, and their storage dependencies.
 *
 * This module provides structured span emission for each lifecycle step so
 * that operators can follow one trace across API requests and asynchronous
 * worker execution. Contract stages can use the same context when wired in.
 *
 * Every function emits a JSON log line via `logOperationalEvent`, meaning the
 * output is already compatible with ELK, CloudWatch Logs, and any aggregator
 * that consumes structured JSON from stdout/stderr.
 *
 * ## Usage (server route handler)
 *
 * ```typescript
 * import { PipelineObserver } from "@/lib/server/pipeline-observability";
 *
 * // At the top of a request handler:
 * const obs = new PipelineObserver(requestIdFrom(req));
 *
 * await obs.runStage("storage.upload_record_write", "storage", ({ traceId, spanId }) =>
 *   saveUpload(metadata, { traceId, traceSpanId: spanId }),
 *   { dependency: { source: "frontend", target: "storage" } },
 * );
 * ```
 *
 * @module lib/server/pipeline-observability
 */

import { logOperationalEvent, requestIdFrom } from "./observability";
import {
  createTrace,
  finishSpan,
  SpanStatus,
  startSpan,
  TRACE_CHECKPOINTS,
} from "@stellarveriphy/shared/tracing";

type PipelineService = "frontend" | "storage" | "verification-worker" | "attestation";
type PipelineStage =
  | "upload.parse"
  | "upload.validate"
  | "storage.upload_record_write"
  | "verification.job_enqueue"
  | "storage.upload_record_read"
  | "verification.validate_upload"
  | "verification.process"
  | "storage.verification_result_write"
  | "storage.verification_failure_write"
  | "storage.upload_session_write"
  | "storage.upload_session_update"
  | "attestation.parse"
  | "attestation.validate_shape"
  | "attestation.validate";
type PipelineOutcome = "ok" | "error";
type PipelineDependency = { source: PipelineService; target: PipelineService };
type PipelineStageContext = { traceId: string; spanId: string };
type PipelineMetricsState = {
  stages: Map<string, { count: number; sum: number; buckets: number[] }>;
  dependencies: Map<string, number>;
};

const HISTOGRAM_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const VALID_TRACE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const VALID_SPAN_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const metricState = globalThis as typeof globalThis & {
  __stellarVeriphyPipelineMetrics?: PipelineMetricsState;
};
const pipelineMetricState =
  (metricState.__stellarVeriphyPipelineMetrics ??= { stages: new Map(), dependencies: new Map() });

function metricsState(): PipelineMetricsState {
  return pipelineMetricState;
}

function metricLabel(value: string): string {
  return /^[a-z][a-z0-9_.-]{0,80}$/.test(value) ? value : "other";
}

function recordStageMetrics(
  name: string,
  service: PipelineService,
  outcome: PipelineOutcome,
  durationMs: number,
  dependency?: PipelineDependency,
): void {
  const safeName = metricLabel(name);
  const key = `${safeName}\u0000${service}\u0000${outcome}`;
  const durationSeconds = Math.max(0, durationMs) / 1000;
  const metrics = metricsState();
  const stage = metrics.stages.get(key) ?? {
    count: 0,
    sum: 0,
    buckets: HISTOGRAM_BUCKETS.map(() => 0),
  };
  metrics.stages.set(key, stage);
  stage.count += 1;
  stage.sum += durationSeconds;
  HISTOGRAM_BUCKETS.forEach((bound, index) => {
    if (durationSeconds <= bound) stage.buckets[index] = (stage.buckets[index] ?? 0) + 1;
  });
  if (dependency) {
    const dependencyKey = `${dependency.source}\u0000${dependency.target}`;
    metrics.dependencies.set(dependencyKey, (metrics.dependencies.get(dependencyKey) ?? 0) + 1);
  }
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

/** Prometheus exposition for pipeline stages and low-cardinality service edges. */
export function pipelineMetrics(): string {
  const lines = [
    "# HELP sv_pipeline_stage_duration_seconds Duration of verification pipeline stages",
    "# TYPE sv_pipeline_stage_duration_seconds histogram",
  ];
  for (const [key, stage] of metricsState().stages) {
    const [name, service, outcome] = key.split("\u0000");
    const stageName = name ?? "other";
    HISTOGRAM_BUCKETS.forEach((bound, index) => {
      lines.push(
        `sv_pipeline_stage_duration_seconds_bucket{stage="${escapeLabel(stageName)}",service="${service}",outcome="${outcome}",le="${bound}"} ${stage.buckets[index]}`,
      );
    });
    lines.push(
      `sv_pipeline_stage_duration_seconds_bucket{stage="${escapeLabel(stageName)}",service="${service}",outcome="${outcome}",le="+Inf"} ${stage.count}`,
      `sv_pipeline_stage_duration_seconds_sum{stage="${escapeLabel(stageName)}",service="${service}",outcome="${outcome}"} ${stage.sum}`,
      `sv_pipeline_stage_duration_seconds_count{stage="${escapeLabel(stageName)}",service="${service}",outcome="${outcome}"} ${stage.count}`,
    );
  }

  lines.push(
    "# HELP sv_pipeline_service_dependencies_total Calls observed across pipeline service dependencies",
    "# TYPE sv_pipeline_service_dependencies_total counter",
  );
  for (const [key, count] of metricsState().dependencies) {
    const [source, target] = key.split("\u0000");
    lines.push(`sv_pipeline_service_dependencies_total{source="${source}",target="${target}"} ${count}`);
  }
  return `${lines.join("\n")}\n`;
}

// Re-export so callers only need one import.
export { requestIdFrom };

// ---------------------------------------------------------------------------
// Attribute types per checkpoint
// ---------------------------------------------------------------------------

interface UploadStartAttrs {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

interface UploadValidatedAttrs {
  fileName: string;
  fileSizeBytes: number;
  /** Partial creator key hash (never the full public key). */
  creatorPrefix: string;
  manifestHashPrefix: string;
}

interface UploadStoredAttrs {
  uploadId: string;
}

interface JobEnqueuedAttrs {
  jobId: string;
  uploadId: string;
  queueDepth?: number;
}

interface OracleSelectedAttrs {
  jobId: string;
  providerAddressPrefix: string;
}

interface OracleRequestSentAttrs {
  jobId: string;
  providerAddressPrefix: string;
  attempt: number;
}

interface OracleAttestationReceivedAttrs {
  jobId: string;
  attestationHashPrefix: string;
  enclave: string;
}

interface OracleAttestationValidatedAttrs {
  jobId: string;
  attestationStatus: string;
  riskScore: number;
}

interface MintRequestedAttrs {
  jobId: string;
  manifestHashPrefix: string;
  attestationHashPrefix: string;
}

interface MintConfirmedAttrs {
  jobId: string;
  certificateId: string;
  txHash?: string;
}

interface JobFailedAttrs {
  jobId: string;
  uploadId: string;
  reason: string;
  attempt?: number;
}

interface JobRetriedAttrs {
  jobId: string;
  trigger: string;
  attempt: number;
  nextRetryAt?: string;
}

interface JobRecoveredAttrs {
  jobId: string;
  certificateId?: string;
}

// ---------------------------------------------------------------------------
// PipelineObserver
// ---------------------------------------------------------------------------

/**
 * Emits structured spans and metrics for a pipeline operation. Trace context
 * is persisted with uploads and jobs so asynchronous work retains its lineage.
 */
export class PipelineObserver {
  private readonly requestId: string;
  readonly traceId: string;
  private readonly trace: ReturnType<typeof createTrace>;
  private currentSpanId?: string;

  constructor(requestId: string, traceId?: string, parentSpanId?: string) {
    this.requestId = requestId;
    this.traceId = traceId && VALID_TRACE_ID.test(traceId) ? traceId : requestId;
    this.trace = createTrace("verification-pipeline", this.traceId);
    this.currentSpanId = parentSpanId && VALID_SPAN_ID.test(parentSpanId) ? parentSpanId : undefined;
  }

  get traceSpanId(): string | undefined {
    return this.currentSpanId;
  }

  async runStage<T>(
    name: PipelineStage,
    service: PipelineService,
    work: (context: PipelineStageContext) => Promise<T>,
    options: {
      dependency?: PipelineDependency;
      outcome?: (result: T) => PipelineOutcome;
    } = {},
  ): Promise<T> {
    const span = startSpan(this.trace, name, { service }, this.currentSpanId);
    this.currentSpanId = span.spanId;
    const started = performance.now();
    let outcome: PipelineOutcome = "ok";
    try {
      const result = await work({ traceId: this.traceId, spanId: span.spanId });
      outcome = options.outcome?.(result) ?? "ok";
      finishSpan(span, outcome === "ok" ? SpanStatus.Ok : SpanStatus.Error);
      return result;
    } catch (error) {
      outcome = "error";
      finishSpan(span, SpanStatus.Error);
      throw error;
    } finally {
      const durationMs = performance.now() - started;
      span.durationMs = durationMs;
      recordStageMetrics(name, service, outcome, durationMs, options.dependency);
      logOperationalEvent(outcome === "ok" ? "info" : "warn", "pipeline.span", {
        requestId: this.requestId,
        traceId: this.traceId,
        spanId: span.spanId,
        ...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
        route: "verification pipeline",
        operation: name,
        stage: name,
        service,
        ...(options.dependency
          ? { dependency: `${options.dependency.source}->${options.dependency.target}` }
          : {}),
        outcome,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Upload path
  // -------------------------------------------------------------------------

  uploadStart(_attrs: UploadStartAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.UPLOAD_START, {
      route: "POST /api/uploads",
      operation: "upload_start",
      requestId: this.requestId,
      details: { traceId: this.traceId },
    });
  }

  uploadValidated(_attrs: UploadValidatedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.UPLOAD_VALIDATED, {
      route: "POST /api/uploads",
      operation: "upload_validated",
      requestId: this.requestId,
      details: { traceId: this.traceId },
    });
  }

  uploadStored(attrs: UploadStoredAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.UPLOAD_STORED, {
      route: "POST /api/uploads",
      operation: "upload_stored",
      requestId: this.requestId,
      uploadId: attrs.uploadId,
      details: { traceId: this.traceId },
    });
  }

  jobEnqueued(attrs: JobEnqueuedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.JOB_ENQUEUED, {
      route: "POST /api/jobs",
      operation: "job_enqueued",
      requestId: this.requestId,
      jobId: attrs.jobId,
      uploadId: attrs.uploadId,
      details: { traceId: this.traceId, queueDepth: attrs.queueDepth },
    });
  }

  // -------------------------------------------------------------------------
  // Oracle / attestation path
  // -------------------------------------------------------------------------

  oracleProviderSelected(attrs: OracleSelectedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.ORACLE_SELECTED, {
      route: "worker",
      operation: "oracle_provider_selected",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId },
    });
  }

  oracleRequestSent(attrs: OracleRequestSentAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.ORACLE_REQUEST_SENT, {
      route: "worker",
      operation: "oracle_request_sent",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, attempt: attrs.attempt },
    });
  }

  oracleAttestationReceived(attrs: OracleAttestationReceivedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.ORACLE_ATTESTATION_RECEIVED, {
      route: "worker",
      operation: "oracle_attestation_received",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId },
    });
  }

  oracleAttestationValidated(attrs: OracleAttestationValidatedAttrs): void {
    const level = attrs.attestationStatus === "valid" ? "info" : attrs.attestationStatus === "suspicious" ? "warn" : "error";
    logOperationalEvent(level, TRACE_CHECKPOINTS.ORACLE_ATTESTATION_VALIDATED, {
      route: "worker",
      operation: "oracle_attestation_validated",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, attestationStatus: attrs.attestationStatus, riskScore: attrs.riskScore },
    });
  }

  // -------------------------------------------------------------------------
  // Contract / mint path
  // -------------------------------------------------------------------------

  contractMintRequested(attrs: MintRequestedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.CONTRACT_MINT_REQUESTED, {
      route: "worker",
      operation: "contract_mint_requested",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId },
    });
  }

  contractMintConfirmed(attrs: MintConfirmedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.CONTRACT_MINT_CONFIRMED, {
      route: "worker",
      operation: "contract_mint_confirmed",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, certificateId: attrs.certificateId },
    });
  }

  // -------------------------------------------------------------------------
  // Failure & recovery
  // -------------------------------------------------------------------------

  jobFailed(attrs: JobFailedAttrs): void {
    logOperationalEvent("error", TRACE_CHECKPOINTS.JOB_FAILED, {
      route: "worker",
      operation: "job_failed",
      requestId: this.requestId,
      jobId: attrs.jobId,
      uploadId: attrs.uploadId,
      details: { traceId: this.traceId, attempt: attrs.attempt },
    });
  }

  jobRetried(attrs: JobRetriedAttrs): void {
    logOperationalEvent("warn", TRACE_CHECKPOINTS.JOB_RETRIED, {
      route: "worker",
      operation: "job_retried",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: {
        traceId: this.traceId,
        trigger: attrs.trigger,
        attempt: attrs.attempt,
        nextRetryAt: attrs.nextRetryAt,
      },
    });
  }

  jobRecovered(attrs: JobRecoveredAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.JOB_RECOVERED, {
      route: "worker",
      operation: "job_recovered",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, certificateId: attrs.certificateId },
    });
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a `PipelineObserver` from a `Request` object.
 * Extracts `requestId` and optional trace header automatically.
 */
export function observerFromRequest(req: Request): PipelineObserver {
  const requestId = requestIdFrom(req);
  const traceId = req.headers.get("x-trace-id") ?? requestId;
  const parentSpanId = req.headers.get("x-span-id") ?? undefined;
  return new PipelineObserver(requestId, traceId, parentSpanId);
}
