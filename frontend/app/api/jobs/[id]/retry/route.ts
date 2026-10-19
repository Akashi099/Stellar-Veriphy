/**
 * POST /api/jobs/[id]/retry
 *
 * Manually trigger a retry for a failed verification job.
 * Operators can use this endpoint to recover jobs that failed due to transient
 * errors without waiting for automatic backoff scheduling.
 *
 * Query parameter:
 *   ?force=true   Override the max-attempts limit (operator override).
 *
 * Response:
 *   202  { status: "recovery_scheduled", data: JobRecoveryState }
 *   404  Job not found.
 *   409  Max attempts reached (without ?force=true).
 */
import { respond, serverError } from "@/lib/server/http";
import { getJobViews } from "@/lib/server/jobs";
import { retryJob, getRecoveryState } from "@/lib/server/job-recovery";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = requestIdFrom(req);
  const force = new URL(req.url).searchParams.get("force") === "true";

  try {
    // Verify the job exists first
    const [job] = await getJobViews([id]);
    if (!job) {
      return respond(404, { status: "not_found", message: "No verification job exists with this ID." });
    }

    const recoveryState = await retryJob(id, job.uploadId, { force });

    logOperationalEvent("info", "job.manual_retry_requested", {
      requestId,
      route: "POST /api/jobs/[id]/retry",
      operation: "manual_retry",
      jobId: id,
      uploadId: job.uploadId,
      details: { force, attempt: recoveryState.attempts.length },
    });

    return respond(202, {
      status: "queued",
      message: "Recovery attempt scheduled.",
      data: recoveryState,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("maximum")) {
      return respond(409, {
        status: "validation_error",
        message: err.message,
        errors: [{ field: "id", message: err.message, hint: "Add ?force=true to override the attempt limit." }],
      });
    }
    return serverError("POST /api/jobs/[id]/retry", err, requestId);
  }
}

/**
 * GET /api/jobs/[id]/retry
 *
 * Return the full recovery state for a job.  Useful for operator dashboards.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [job] = await getJobViews([id]);
    if (!job) {
      return respond(404, { status: "not_found", message: "No verification job exists with this ID." });
    }
    const state = await getRecoveryState(id, job.uploadId);
    return respond(200, { status: "ok", data: state });
  } catch (err) {
    return serverError("GET /api/jobs/[id]/retry", err, requestIdFrom(_req));
  }
}
