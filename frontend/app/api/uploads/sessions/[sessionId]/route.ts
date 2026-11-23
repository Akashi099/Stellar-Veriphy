import { describeUploadSession, validateUploadSessionUpdate, type UploadSessionView } from "@stellarveriphy/shared";
import { readValidated, respond, serverError, validationError } from "@/lib/server/http";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import { getSession, sessionEtag, updateSession } from "@/lib/server/upload-sessions";
import { ifMatchFailed } from "@/lib/server/write-concurrency";
import { PipelineObserver, observerFromRequest } from "@/lib/server/pipeline-observability";

function withEtag<T extends Response>(response: T, etag: string): T {
  response.headers.set("ETag", etag);
  return response;
}

type Params = { params: Promise<{ sessionId: string }> };

// GET /api/uploads/sessions/:sessionId: current state, including which chunk to send next.
export async function GET(_req: Request, { params }: Params) {
  const { sessionId } = await params;
  try {
    const session = await getSession(sessionId);
    if (!session) return respond(404, { status: "not_found", message: "No upload session exists with this ID." });
    return withEtag(respond<UploadSessionView>(200, { status: "ok", data: describeUploadSession(session) }), sessionEtag(session));
  } catch (err) {
    return serverError("GET /api/uploads/sessions/[sessionId]", err);
  }
}

// PATCH /api/uploads/sessions/:sessionId { action, … }: record progress, resume,
// restart, abort or complete the session. Send the ETag from the last read as
// If-Match to reject the write if the session changed in between (#786).
export async function PATCH(req: Request, { params }: Params) {
  const { sessionId } = await params;
  const requestId = requestIdFrom(req);
  const parsed = await readValidated(req, validateUploadSessionUpdate);
  if ("response" in parsed) return parsed.response;

  try {
    const currentSession = await getSession(sessionId);
    const incomingObserver = observerFromRequest(req);
    const observer = new PipelineObserver(
      requestId,
      currentSession?.traceId ?? incomingObserver.traceId,
      incomingObserver.traceId === currentSession?.traceId
        ? incomingObserver.traceSpanId ?? currentSession?.traceSpanId
        : currentSession?.traceSpanId ?? incomingObserver.traceSpanId,
    );
    const result = await observer.runStage(
      "storage.upload_session_update",
      "storage",
      ({ traceId, spanId }) =>
        updateSession(
          sessionId,
          parsed.value,
          new Date(),
          (current) => ifMatchFailed(req, sessionEtag(current)),
          { traceId, traceSpanId: spanId },
        ),
      {
        dependency: { source: "frontend", target: "storage" },
        outcome: (updated) => (updated?.ok ? "ok" : "error"),
      },
    );
    if (!result) return respond(404, { status: "not_found", message: "No upload session exists with this ID." });
    if (!result.ok) {
      if (result.reason === "stale") {
        return withEtag(
          respond<UploadSessionView>(409, {
            status: "conflict",
            message: "This upload session changed since you last read it. Re-read it (see `data`) and retry with the new ETag.",
            data: describeUploadSession(result.session),
          }),
          sessionEtag(result.session),
        );
      }
      if (result.reason === "invalid") return validationError(result.errors);
      if (result.reason === "expired") {
        return respond(410, {
          status: "expired",
          message: "This upload session expired. Restart it with { \"action\": \"restart\" } or start a new session.",
        });
      }
      return respond(409, { status: "conflict", message: result.message });
    }

    const view = describeUploadSession(result.session);
    if (parsed.value.action !== "progress") {
      logOperationalEvent("info", `upload_session.${parsed.value.action}`, {
        requestId,
        traceId: observer.traceId,
        route: "PATCH /api/uploads/sessions/[sessionId]",
        operation: "update_upload_session",
        status: 200,
        actor: view.creator,
        contentHash: view.contentHash,
        uploadId: view.uploadId,
        details: { sessionId, attempt: view.attempt, progress: view.progress },
      });
    }
    const response = withEtag(
      respond<UploadSessionView>(200, { status: "ok", data: view }),
      sessionEtag(result.session),
    );
    response.headers.set("X-Trace-Id", observer.traceId);
    if (observer.traceSpanId) response.headers.set("X-Span-Id", observer.traceSpanId);
    return response;
  } catch (err) {
    return serverError("PATCH /api/uploads/sessions/[sessionId]", err);
  }
}
