/**
 * packages/shared/ai-labeling/index.ts
 *
 * Types and utilities for AI-generated / machine-generated content labeling.
 *
 * A label describes the _confidence_ that a piece of content was produced
 * (fully or partially) by an automated process such as a generative AI model.
 * Labels are non-destructive: they annotate provenance records without altering
 * the underlying content or blocking certification.
 *
 * ## Design principles
 *
 * - Never overstate certainty.  All labels carry an explicit `confidence`
 *   value in [0, 1] and a `detectionSource` that explains how the label
 *   was produced.
 * - Labels originating from unverified or heuristic detectors are clearly
 *   distinguished from labels set explicitly by the creator.
 * - The schema is additive: new `AiGenerationType` variants can be introduced
 *   without breaking existing records.
 *
 * @module shared/ai-labeling
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * How the content was classified.
 *
 * - `"fully_generated"` — entirely produced by an AI model (e.g. a diffusion image).
 * - `"partially_generated"` — human-created base with AI-assisted edits or additions.
 * - `"ai_enhanced"` — real content that was processed or upscaled by a model.
 * - `"human_created"` — confirmed not AI-generated.
 * - `"unknown"` — detection was inconclusive or was not attempted.
 */
export type AiGenerationType =
  | "fully_generated"
  | "partially_generated"
  | "ai_enhanced"
  | "human_created"
  | "unknown";

/**
 * How the label was produced.
 *
 * - `"creator_declared"` — the creator explicitly set this label during upload.
 * - `"detector_heuristic"` — an automated detector applied heuristics (unreliable).
 * - `"detector_model"` — a trained classification model produced the label.
 * - `"tee_verified"` — the label was produced inside a TEE and its origin is attested.
 * - `"platform_review"` — a platform moderator set the label after manual review.
 */
export type DetectionSource =
  | "creator_declared"
  | "detector_heuristic"
  | "detector_model"
  | "tee_verified"
  | "platform_review";

/**
 * A single AI label attached to a content asset.
 */
export interface AiLabel {
  /**
   * Classification result.
   */
  generationType: AiGenerationType;

  /**
   * Confidence in the label expressed as a value in [0, 1].
   * 0 means no confidence (label is effectively `unknown`).
   * 1 means absolute certainty (only valid for `creator_declared`).
   *
   * @minimum 0
   * @maximum 1
   */
  confidence: number;

  /**
   * How the label was produced.
   */
  detectionSource: DetectionSource;

  /**
   * Optional model or tool name used for detection, e.g. "C2PA-detector-v2".
   * Absent when the source is `creator_declared` or `platform_review`.
   */
  modelName?: string;

  /**
   * Optional model version string for reproducibility.
   */
  modelVersion?: string;

  /**
   * ISO 8601 timestamp at which this label was assigned.
   */
  labeledAt: string;

  /**
   * Optional free-text note explaining any nuance (e.g. "background is AI-generated, subject is real").
   * Kept short; not intended as a moderation decision log.
   */
  note?: string;
}

/**
 * Label metadata persisted alongside a provenance record or manifest.
 * A record may carry multiple labels (e.g. one from the creator and a later
 * one from platform review).  The most recent label from the highest-trust
 * source takes precedence when displaying a single label to end users.
 */
export interface AiLabelRecord {
  /**
   * Collection id — equals `assetId`.
   */
  id: string;

  /**
   * Certificate or upload id this label is attached to.
   */
  assetId: string;

  /**
   * Ordered list of labels from oldest to newest.
   */
  labels: AiLabel[];

  /**
   * The resolved label to present to end users.
   * Derived by `resolveDisplayLabel`; stored here so it is available without
   * re-computation in read paths.
   */
  displayLabel: AiLabel;
}

// ---------------------------------------------------------------------------
// Source trust ordering
// ---------------------------------------------------------------------------

const SOURCE_TRUST_ORDER: DetectionSource[] = [
  "detector_heuristic",     // lowest
  "detector_model",
  "creator_declared",
  "platform_review",
  "tee_verified",           // highest
];

function sourceTrustScore(source: DetectionSource): number {
  const idx = SOURCE_TRUST_ORDER.indexOf(source);
  return idx === -1 ? 0 : idx;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve which label in a list should be shown to end users.
 *
 * Precedence: highest-trust source first; within the same trust tier, the
 * most recent label wins.
 */
export function resolveDisplayLabel(labels: AiLabel[]): AiLabel | undefined {
  if (labels.length === 0) return undefined;
  return [...labels].sort((a, b) => {
    const trustDiff = sourceTrustScore(b.detectionSource) - sourceTrustScore(a.detectionSource);
    if (trustDiff !== 0) return trustDiff;
    return b.labeledAt.localeCompare(a.labeledAt);
  })[0];
}

/**
 * Return true if the label's confidence is high enough to be actionable.
 *
 * Any label below the threshold should be presented with a disclaimer that
 * the classification is uncertain and must not be used as a definitive finding.
 */
export function isConfidentLabel(label: AiLabel, threshold = 0.7): boolean {
  return label.confidence >= threshold;
}

/**
 * Build a display-safe confidence description that avoids overstating certainty.
 *
 * Examples:
 * - 0.95, "fully_generated"  → "Very likely AI-generated (95%)"
 * - 0.55, "partially_generated" → "Possibly partially AI-generated (55%) — classification uncertain"
 * - 0.1, "unknown" → "Classification inconclusive (10%)"
 */
export function describeLabel(label: AiLabel): string {
  const pct = Math.round(label.confidence * 100);
  const typeLabels: Record<AiGenerationType, string> = {
    fully_generated: "AI-generated",
    partially_generated: "partially AI-generated",
    ai_enhanced: "AI-enhanced",
    human_created: "human-created",
    unknown: "classification inconclusive",
  };
  const typeText = typeLabels[label.generationType];

  if (label.generationType === "unknown") {
    return `Classification inconclusive (${pct}% confidence)`;
  }

  const qualifier =
    label.confidence >= 0.9
      ? "Very likely"
      : label.confidence >= 0.7
      ? "Likely"
      : label.confidence >= 0.5
      ? "Possibly"
      : "Uncertain —";

  const certaintyWarning =
    label.confidence < 0.7 ? " — classification uncertain, do not treat as definitive" : "";

  return `${qualifier} ${typeText} (${pct}%${certaintyWarning})`;
}

/**
 * Create a creator-declared label with full confidence.
 */
export function creatorDeclaredLabel(generationType: AiGenerationType, note?: string): AiLabel {
  return {
    generationType,
    confidence: 1.0,
    detectionSource: "creator_declared",
    labeledAt: new Date().toISOString(),
    note,
  };
}

/**
 * Create a label produced by an automated detector.
 */
export function detectorLabel(
  generationType: AiGenerationType,
  confidence: number,
  modelName: string,
  modelVersion?: string,
  source: DetectionSource = "detector_model",
): AiLabel {
  if (confidence < 0 || confidence > 1) {
    throw new RangeError(`confidence must be in [0, 1], got ${confidence}`);
  }
  return {
    generationType,
    confidence,
    detectionSource: source,
    modelName,
    modelVersion,
    labeledAt: new Date().toISOString(),
  };
}
