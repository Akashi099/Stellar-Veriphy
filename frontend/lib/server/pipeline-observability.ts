/**
 * frontend/lib/server/pipeline-observability.ts
 *
 * End-to-end observability for the upload → hash → attestation → mint pipeline.
 *
 * This module provides structured span emission for each lifecycle step so
 * that operators can trace a single request from the initial POST /api/uploads
 * all the way through to the on-chain certificate mint.
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
 * obs.uploadValidated({ fileName: "photo.jpg", fileSize: 512000, creator: "GABC..." });
 * obs.jobEnqueued({ jobId: "uuid" });
 * // ...etc
 * obs.mintConfirmed({ certificateId: "42", txHash: "abc..." });
 * ```
 *
 * @module lib/server/pipeline-observability
 */

import { logOperationalEvent, requestIdFrom } from "./observability";
import { TRACE_CHECKPOINTS } from "@stellarveriphy/shared/tracing";

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
  manifestHashPrefix: string;
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
 * Emits structured log events for each lifecycle checkpoint in the
 * upload-to-mint pipeline.  One instance per request; carry `requestId`
 * through the entire flow so all events are correlated.
 */
export class PipelineObserver {
  private readonly requestId: string;
  private readonly traceId: string;

  constructor(requestId: string, traceId?: string) {
    this.requestId = requestId;
    this.traceId = traceId ?? requestId;
  }

  // -------------------------------------------------------------------------
  // Upload path
  // -------------------------------------------------------------------------

  uploadStart(attrs: UploadStartAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.UPLOAD_START, {
      route: "POST /api/uploads",
      operation: "upload_start",
      requestId: this.requestId,
      details: { traceId: this.traceId, ...attrs },
    });
  }

  uploadValidated(attrs: UploadValidatedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.UPLOAD_VALIDATED, {
      route: "POST /api/uploads",
      operation: "upload_validated",
      requestId: this.requestId,
      manifestHash: attrs.manifestHashPrefix,
      details: { traceId: this.traceId, creatorPrefix: attrs.creatorPrefix, fileName: attrs.fileName },
    });
  }

  uploadStored(attrs: UploadStoredAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.UPLOAD_STORED, {
      route: "POST /api/uploads",
      operation: "upload_stored",
      requestId: this.requestId,
      uploadId: attrs.uploadId,
      manifestHash: attrs.manifestHashPrefix,
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
      details: { traceId: this.traceId, providerAddressPrefix: attrs.providerAddressPrefix },
    });
  }

  oracleRequestSent(attrs: OracleRequestSentAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.ORACLE_REQUEST_SENT, {
      route: "worker",
      operation: "oracle_request_sent",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, attempt: attrs.attempt, providerAddressPrefix: attrs.providerAddressPrefix },
    });
  }

  oracleAttestationReceived(attrs: OracleAttestationReceivedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.ORACLE_ATTESTATION_RECEIVED, {
      route: "worker",
      operation: "oracle_attestation_received",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, attestationHashPrefix: attrs.attestationHashPrefix, enclave: attrs.enclave },
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
      manifestHash: attrs.manifestHashPrefix,
      details: { traceId: this.traceId, attestationHashPrefix: attrs.attestationHashPrefix },
    });
  }

  contractMintConfirmed(attrs: MintConfirmedAttrs): void {
    logOperationalEvent("info", TRACE_CHECKPOINTS.CONTRACT_MINT_CONFIRMED, {
      route: "worker",
      operation: "contract_mint_confirmed",
      requestId: this.requestId,
      jobId: attrs.jobId,
      details: { traceId: this.traceId, certificateId: attrs.certificateId, txHash: attrs.txHash },
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
      details: { traceId: this.traceId, reason: attrs.reason, attempt: attrs.attempt },
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
  return new PipelineObserver(requestId, traceId);
}
