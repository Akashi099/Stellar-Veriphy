import {
  describeUploadSession,
  paginate,
  sha256Field,
  stellarAddressField,
  validateUploadSessionStart,
  type FieldError,
  type UploadSessionView,
} from "@stellarveriphy/shared";
import { readPagination, readValidated, respond, serverError, validationError } from "@/lib/server/http";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import { listSessions, startOrResumeSession } from "@/lib/server/upload-sessions";

const SESSION_STATUSES = ["in_progress", "completed", "aborted", "expired"];

// POST /api/uploads/sessions: start a resumable upload session, or resume the
// open one for the same file and creator (docs/api/upload-sessions.md).
export async function POST(req: Request) {
  const requestId = requestIdFrom(req);
  const parsed = await readValidated(req, validateUploadSessionStart);
  if ("response" in parsed) {
    logOperationalEvent("warn", "upload_session.rejected", {
      requestId,
      route: "POST /api/uploads/sessions",
      operation: "validate_upload_session",
      status: parsed.response.status,
    });
    return parsed.response;
  }

  try {
    const { session, resumed } = await startOrResumeSession(parsed.value);
    logOperationalEvent("info", resumed ? "upload_session.resumed" : "upload_session.created", {
      requestId,
      route: "POST /api/uploads/sessions",
      operation: "start_upload_session",
      status: resumed ? 200 : 201,
      actor: session.creator,
      contentHash: session.contentHash,
      details: { sessionId: session.id, attempt: session.attempt, completedChunks: session.completedChunks.length },
    });
    return respond<UploadSessionView>(resumed ? 200 : 201, {
      status: resumed ? "exists" : "created",
      message: resumed ? "An unfinished upload of this file was found; resume from nextChunk." : undefined,
      data: describeUploadSession(session),
    });
  } catch (err) {
    return serverError("POST /api/uploads/sessions", err);
  }
}

// GET /api/uploads/sessions?creator=G…[&contentHash=…][&status=…]: list sessions (paginated).
export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const query = Object.fromEntries(searchParams.entries());
  const errors: FieldError[] = [];
  const creator = stellarAddressField(query, "creator", {}, errors);
  const contentHash = sha256Field(query, "contentHash", {}, errors);
  const status = query.status;
  if (status && !SESSION_STATUSES.includes(status)) {
    errors.push({ field: "status", message: "Value is not allowed.", hint: `Use one of: ${SESSION_STATUSES.join(", ")}.` });
  }
  if (errors.length === 0 && !creator && !contentHash) {
    errors.push({ field: "creator", message: "Provide creator or contentHash to list upload sessions." });
  }
  if (errors.length > 0) return validationError(errors);
  const pageParams = readPagination(req);
  if ("response" in pageParams) return pageParams.response;

  try {
    const page = paginate(await listSessions({ creator, contentHash, status }), pageParams.value);
    return respond<UploadSessionView[]>(200, {
      status: "ok",
      data: page.items.map(describeUploadSession),
      pagination: page.pagination,
    });
  } catch (err) {
    return serverError("GET /api/uploads/sessions", err);
  }
}
