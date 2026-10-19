import { isPlainObject, type VerificationJobView } from "@stellarveriphy/shared";
import { readJson, respond, serverError, validationError } from "@/lib/server/http";
import { enqueueJob, getJobViews } from "@/lib/server/jobs";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import { getUpload } from "@/lib/server/uploads";

const MAX_IDS_PER_REQUEST = 50;

// POST /api/jobs { uploadId }: queue a verification job for a stored upload.
export async function POST(req: Request) {
  const requestId = requestIdFrom(req);
  const parsed = await readJson(req);
  if ("response" in parsed) {
    logOperationalEvent("warn", "verification_submission.rejected", {
      requestId,
      route: "POST /api/jobs",
      operation: "parse_verification_submission",
      status: parsed.response.status,
      reason: "invalid_request_body",
    });
    return parsed.response;
  }

  const uploadId = isPlainObject(parsed.body) ? parsed.body.uploadId : undefined;
  if (typeof uploadId !== "string" || uploadId === "") {
    logOperationalEvent("warn", "verification_submission.rejected", {
      requestId,
      route: "POST /api/jobs",
      operation: "validate_verification_submission",
      status: 422,
      reason: "missing_upload_id",
    });
    return validationError([
      { field: "uploadId", message: "uploadId is required.", hint: "Register the upload with POST /api/uploads first." },
    ]);
  }

  try {
    const upload = await getUpload(uploadId);
    if (!upload) {
      logOperationalEvent("warn", "verification_submission.rejected", {
        requestId,
        route: "POST /api/jobs",
        operation: "load_upload_for_verification",
        status: 404,
        reason: "upload_not_found",
        uploadId,
      });
      return respond(404, { status: "not_found", message: "No upload exists with this ID." });
    }
    const job = await enqueueJob(uploadId);
    const [view] = await getJobViews([job.id]);
    logOperationalEvent("info", "verification_submission.queued", {
      requestId,
      route: "POST /api/jobs",
      operation: "enqueue_verification_job",
      status: 202,
      actor: upload.creator,
      uploadId,
      jobId: job.id,
      contentHash: upload.contentHash,
      manifestHash: upload.manifestHash,
    });
    return respond<VerificationJobView>(202, { status: "queued", data: view });
  } catch (err) {
    logOperationalEvent("error", "verification_submission.failed", {
      requestId,
      route: "POST /api/jobs",
      operation: "enqueue_verification_job",
      status: 500,
      uploadId,
      error: err,
    });
    return serverError("POST /api/jobs", err, requestId);
  }
}

// GET /api/jobs?ids=a,b,c: current state of several jobs. Unknown IDs are omitted.
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > MAX_IDS_PER_REQUEST) {
    return validationError([{ field: "ids", message: `At most ${MAX_IDS_PER_REQUEST} job IDs can be requested at once.` }]);
  }

  try {
    return respond<VerificationJobView[]>(200, { status: "ok", data: await getJobViews(ids) });
  } catch (err) {
    return serverError("GET /api/jobs", err, requestIdFrom(req));
  }
}
