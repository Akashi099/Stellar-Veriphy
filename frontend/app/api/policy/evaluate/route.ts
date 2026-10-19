/**
 * POST /api/policy/evaluate
 *
 * Evaluate a compliance policy for an asset being uploaded or certified.
 *
 * Accepts a `PolicyContext` and returns a `PolicyDecision` that describes:
 *   - Whether the upload is `allowed`.
 *   - The aggregate `complianceStatus` (compliant / restricted / blocked).
 *   - Any `violations` and `requiredDisclosures`.
 *
 * The caller must display required disclosures to the creator before
 * proceeding.  Blocked assets must not be uploaded or certified.
 */
import { enumField, integerField, requireObject, textField, type FieldError } from "@stellarveriphy/shared";
import { respond, readJson, serverError, validationError } from "@/lib/server/http";
import { logOperationalEvent, requestIdFrom } from "@/lib/server/observability";
import {
  evaluatePolicy,
  defaultRuleSet,
  type PolicyContext,
  type AssetClass,
  type CreatorSegment,
} from "@stellarveriphy/shared/policy";
import type { AiGenerationType } from "@stellarveriphy/shared/ai-labeling";

const VALID_ASSET_CLASSES: AssetClass[] = [
  "news_media",
  "legal_document",
  "ai_generated_artwork",
  "scientific_data",
  "supply_chain_evidence",
  "nft_asset",
  "other",
];

const VALID_CREATOR_SEGMENTS: CreatorSegment[] = [
  "individual",
  "journalist",
  "enterprise",
  "government",
  "platform_partner",
];

export async function POST(req: Request) {
  const requestId = requestIdFrom(req);
  const parsed = await readJson(req);
  if ("response" in parsed) return parsed.response;

  const object = requireObject(parsed.body);
  if (!object.ok) return validationError(object.errors);
  const body = object.value;

  const errors: FieldError[] = [];
  const assetClass = enumField(body, "assetClass", VALID_ASSET_CLASSES, { required: true }, errors);
  const creatorSegment = enumField(body, "creatorSegment", VALID_CREATOR_SEGMENTS, { required: true }, errors);
  const jurisdiction = textField(body, "jurisdiction", {
    required: true,
    requiredMessage: "jurisdiction is required (e.g. 'EU', 'US', 'GLOBAL').",
    maxLength: 20,
    singleLine: true,
  }, errors);
  const mimeType = textField(body, "mimeType", { maxLength: 100, singleLine: true }, errors);
  const fileSize = integerField(body, "fileSize", { min: 0 }, errors);
  if (errors.length > 0 || !assetClass || !creatorSegment || !jurisdiction) return validationError(errors);

  const context: PolicyContext = {
    assetClass,
    creatorSegment,
    jurisdiction: jurisdiction.toUpperCase(),
    aiLabel: typeof body.aiLabel === "string" ? (body.aiLabel as AiGenerationType) : undefined,
    mimeType,
    fileSize,
  };

  try {
    const decision = evaluatePolicy(defaultRuleSet, context);

    logOperationalEvent(
      decision.allowed ? "info" : "warn",
      "policy.evaluated",
      {
        requestId,
        route: "POST /api/policy/evaluate",
        operation: "evaluate_policy",
        details: {
          assetClass: context.assetClass,
          creatorSegment: context.creatorSegment,
          jurisdiction: context.jurisdiction,
          complianceStatus: decision.complianceStatus,
          allowed: decision.allowed,
          violationCount: decision.violations.length,
        },
      },
    );

    return respond(200, { status: "ok", data: decision });
  } catch (err) {
    return serverError("POST /api/policy/evaluate", err, requestId);
  }
}
