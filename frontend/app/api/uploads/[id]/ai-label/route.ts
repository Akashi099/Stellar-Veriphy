/**
 * POST /api/uploads/[id]/ai-label
 * GET  /api/uploads/[id]/ai-label
 *
 * Attach or retrieve an AI-generation label for an uploaded asset.
 *
 * ## POST
 * Accepts a label payload and persists it alongside the upload record.
 * Creator-declared labels are accepted unconditionally.
 * Detector-produced labels must include a modelName.
 *
 * ## GET
 * Returns all labels and the resolved display label for the asset.
 */
import { enumField, requireObject, textField, type FieldError } from "@stellarveriphy/shared";
import { respond, readJson, serverError, validationError } from "@/lib/server/http";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import { getUpload } from "@/lib/server/uploads";
import { collection } from "@/lib/server/json-collection";
import {
  creatorDeclaredLabel,
  detectorLabel,
  resolveDisplayLabel,
  type AiLabel,
  type AiLabelRecord,
  type AiGenerationType,
  type DetectionSource,
} from "@stellarveriphy/shared/ai-labeling";

const aiLabelStore = () => collection<AiLabelRecord>("ai-labels");

const VALID_GENERATION_TYPES: AiGenerationType[] = [
  "fully_generated",
  "partially_generated",
  "ai_enhanced",
  "human_created",
  "unknown",
];

const VALID_DETECTION_SOURCES: DetectionSource[] = [
  "creator_declared",
  "detector_heuristic",
  "detector_model",
  "tee_verified",
  "platform_review",
];

// ---------------------------------------------------------------------------
// POST — attach a label
// ---------------------------------------------------------------------------

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = requestIdFrom(req);

  const parsed = await readJson(req);
  if ("response" in parsed) return parsed.response;

  const object = requireObject(parsed.body);
  if (!object.ok) return validationError(object.errors);
  const body = object.value;

  // Validate upload exists
  const upload = await getUpload(id);
  if (!upload) {
    return respond(404, { status: "not_found", message: "No upload exists with this ID." });
  }

  const errors: FieldError[] = [];
  const generationType = enumField(body, "generationType", VALID_GENERATION_TYPES, { required: true }, errors);
  const detectionSource =
    enumField(body, "detectionSource", VALID_DETECTION_SOURCES, {}, errors) ?? "creator_declared";
  const note = textField(body, "note", { maxLength: 1000 }, errors);
  const modelName = textField(body, "modelName", {
    required: detectionSource !== "creator_declared",
    requiredMessage: "modelName is required for detector-produced labels.",
    maxLength: 200,
    singleLine: true,
  }, errors);
  const modelVersion = textField(body, "modelVersion", { maxLength: 100, singleLine: true }, errors);
  if (body.confidence !== undefined && (typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1)) {
    errors.push({ field: "confidence", message: "confidence must be a number between 0 and 1." });
  }
  if (errors.length > 0 || !generationType) return validationError(errors);

  let label: AiLabel;

  if (detectionSource === "creator_declared") {
    label = creatorDeclaredLabel(generationType, note);
  } else {
    const confidence = typeof body.confidence === "number" ? body.confidence : 0.5;
    label = detectorLabel(
      generationType,
      confidence,
      modelName!,
      modelVersion,
      detectionSource,
    );
  }

  try {
    const existing = (await aiLabelStore().get(id)) ?? { id, assetId: id, labels: [], displayLabel: label };
    const labels = [...existing.labels, label];
    const displayLabel = resolveDisplayLabel(labels) ?? label;
    const record: AiLabelRecord = { id, assetId: id, labels, displayLabel };
    await aiLabelStore().put(record);

    logOperationalEvent("info", "ai_label.attached", {
      requestId,
      route: "POST /api/uploads/[id]/ai-label",
      operation: "attach_ai_label",
      uploadId: id,
      details: { generationType, detectionSource, confidence: label.confidence },
    });

    return respond(201, { status: "created", data: record });
  } catch (err) {
    return serverError("POST /api/uploads/[id]/ai-label", err, requestId);
  }
}

// ---------------------------------------------------------------------------
// GET — retrieve labels
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const upload = await getUpload(id);
    if (!upload) {
      return respond(404, { status: "not_found", message: "No upload exists with this ID." });
    }
    const record = await aiLabelStore().get(id);
    if (!record) {
      return respond(200, { status: "ok", data: null, message: "No AI label has been attached to this asset." });
    }
    return respond(200, { status: "ok", data: record });
  } catch (err) {
    return serverError("GET /api/uploads/[id]/ai-label", err, requestIdFrom(_req));
  }
}
