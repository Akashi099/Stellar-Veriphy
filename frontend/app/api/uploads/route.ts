import { paginate, sha256Field, validateUploadMetadata, type FieldError, type UploadRecord } from "@stellarveriphy/shared";
import { readJson, readPagination, respond, serverError, validationError } from "@/lib/server/http";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import { findUploadsByHash, saveUpload } from "@/lib/server/uploads";

// POST /api/uploads: validate and store upload metadata (docs/api/upload-metadata.md).
export async function POST(req: Request) {
  const requestId = requestIdFrom(req);
  const parsed = await readJson(req);
  if ("response" in parsed) {
    logOperationalEvent("warn", "upload.rejected", {
      requestId,
      route: "POST /api/uploads",
      operation: "parse_upload_metadata",
      status: parsed.response.status,
      reason: "invalid_request_body",
    });
    return parsed.response;
  }

  const result = validateUploadMetadata(parsed.body);
  if (!result.ok) {
    logOperationalEvent("warn", "upload.rejected", {
      requestId,
      route: "POST /api/uploads",
      operation: "validate_upload_metadata",
      status: 422,
      reason: "validation_error",
      details: {
        fields: result.errors.map((error) => error.field),
        errorCount: result.errors.length,
      },
    });
    return validationError(result.errors, "Upload metadata is invalid. See `errors` for details.");
  }

  try {
    const { record, created } = await saveUpload(result.value);
    logOperationalEvent("info", created ? "upload.created" : "upload.duplicate", {
      requestId,
      route: "POST /api/uploads",
      operation: "save_upload_metadata",
      status: created ? 201 : 200,
      actor: record.creator,
      uploadId: record.id,
      contentHash: record.contentHash,
      manifestHash: record.manifestHash,
    });
    return respond<UploadRecord>(created ? 201 : 200, {
      status: created ? "created" : "exists",
      message: created ? undefined : "This file was already registered by this creator.",
      data: record,
    });
  } catch (err) {
    logOperationalEvent("error", "upload.failed", {
      requestId,
      route: "POST /api/uploads",
      operation: "save_upload_metadata",
      status: 500,
      actor: result.value.creator,
      contentHash: result.value.contentHash,
      error: err,
    });
    return serverError("POST /api/uploads", err, requestId);
  }
}

// GET /api/uploads?contentHash=<sha256>: look up stored records for a file hash (paginated).
export async function GET(req: Request) {
  const searchParams = new URL(req.url).searchParams;
  const errors: FieldError[] = [];
  const contentHash = sha256Field(
    { contentHash: searchParams.get("contentHash") },
    "contentHash",
    { required: true, requiredMessage: "The contentHash query parameter is required." },
    errors,
  );
  if (!contentHash) return validationError(errors);
  const pageParams = readPagination(req);
  if ("response" in pageParams) return pageParams.response;

  try {
    const page = paginate(await findUploadsByHash(contentHash), pageParams.value);
    return respond<UploadRecord[]>(200, { status: "ok", data: page.items, pagination: page.pagination });
  } catch (err) {
    return serverError("GET /api/uploads", err, requestIdFrom(req));
  }
}
