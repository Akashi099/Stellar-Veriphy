/**
 * packages/shared/policy/index.ts
 *
 * Compliance policy engine for StellarVeriphy.
 *
 * Policies are applied per asset class, creator segment, or jurisdiction to
 * determine what verification requirements, restrictions, and disclosures
 * apply to a given upload or certificate.
 *
 * ## Design goals
 *
 * - Policy logic is data-driven and configurable — specific rules are not
 *   hard-coded; instead a `PolicyRuleSet` is evaluated against a `PolicyContext`.
 * - The engine never silently passes or fails — every evaluation produces an
 *   explicit `PolicyDecision` with a `complianceStatus` and a list of
 *   `PolicyViolation` items that explain any failures.
 * - The schema is extensible: adding a new asset class or jurisdiction does
 *   not require changes to the evaluation engine.
 *
 * ## Usage
 *
 * ```typescript
 * import { evaluatePolicy, defaultRuleSet } from "@stellarveriphy/shared/policy";
 *
 * const decision = evaluatePolicy(defaultRuleSet, {
 *   assetClass: "news_media",
 *   creatorSegment: "journalist",
 *   jurisdiction: "EU",
 *   aiLabel: "fully_generated",
 *   fileSize: 5_000_000,
 *   mimeType: "video/mp4",
 * });
 *
 * if (!decision.allowed) {
 *   console.error("Upload blocked:", decision.violations);
 * }
 * ```
 *
 * @module shared/policy
 */

import type { AiGenerationType } from "../ai-labeling";

// ---------------------------------------------------------------------------
// Asset classes
// ---------------------------------------------------------------------------

/**
 * Broad categories of content that can have different compliance requirements.
 * Extensible — unknown values fall through to the `"other"` default rules.
 */
export type AssetClass =
  | "news_media"
  | "legal_document"
  | "ai_generated_artwork"
  | "scientific_data"
  | "supply_chain_evidence"
  | "nft_asset"
  | "other";

// ---------------------------------------------------------------------------
// Creator segments
// ---------------------------------------------------------------------------

/**
 * Broad categories of content creators.
 * Used to determine which verification tier a creator falls into.
 */
export type CreatorSegment =
  | "individual"
  | "journalist"
  | "enterprise"
  | "government"
  | "platform_partner";

// ---------------------------------------------------------------------------
// Jurisdiction
// ---------------------------------------------------------------------------

/**
 * ISO 3166-1 alpha-2 country codes plus supra-national regions.
 * The policy engine accepts any string; these are the well-known values.
 */
export type Jurisdiction = "EU" | "US" | "UK" | "GLOBAL" | string;

// ---------------------------------------------------------------------------
// Compliance status
// ---------------------------------------------------------------------------

export type ComplianceStatus =
  | "compliant"       // all rules passed
  | "restricted"      // allowed with conditions (e.g. disclosure required)
  | "blocked";        // upload or certificate must not proceed

// ---------------------------------------------------------------------------
// Policy context — the facts evaluated against a rule set
// ---------------------------------------------------------------------------

/**
 * Facts about a specific upload or asset that are evaluated against a rule set.
 */
export interface PolicyContext {
  assetClass: AssetClass;
  creatorSegment: CreatorSegment;
  jurisdiction: Jurisdiction;
  /** AI generation classification for this asset (from `AiLabel.generationType`). */
  aiLabel?: AiGenerationType;
  /** MIME type of the asset. */
  mimeType?: string;
  /** File size in bytes. */
  fileSize?: number;
  /** Any additional facts for custom rules. */
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Policy rule
// ---------------------------------------------------------------------------

/**
 * A single evaluable rule.
 *
 * - `predicate` receives the context and returns `true` when the rule is triggered.
 * - `effect` is what happens when the rule triggers.
 * - `message` is shown to the creator / operator explaining what was triggered.
 * - `remediation` is optional guidance on what to do next.
 */
export interface PolicyRule {
  id: string;
  description: string;
  /**
   * Returns `true` when this rule applies to the given context.
   * Must be a pure function — no side effects, no async.
   */
  predicate: (ctx: PolicyContext) => boolean;
  effect: ComplianceStatus;
  message: string;
  remediation?: string;
}

// ---------------------------------------------------------------------------
// Policy rule set
// ---------------------------------------------------------------------------

/**
 * A named, versioned collection of rules that are evaluated in order.
 * Evaluation stops at the first `"blocked"` outcome.
 */
export interface PolicyRuleSet {
  id: string;
  version: string;
  description: string;
  rules: PolicyRule[];
}

// ---------------------------------------------------------------------------
// Policy violation
// ---------------------------------------------------------------------------

/** Details about a rule that was triggered during evaluation. */
export interface PolicyViolation {
  ruleId: string;
  effect: ComplianceStatus;
  message: string;
  remediation?: string;
}

// ---------------------------------------------------------------------------
// Policy decision
// ---------------------------------------------------------------------------

/**
 * The result of evaluating a `PolicyRuleSet` against a `PolicyContext`.
 */
export interface PolicyDecision {
  /** Whether the upload / action is allowed to proceed. */
  allowed: boolean;
  /** Aggregate compliance status across all triggered rules. */
  complianceStatus: ComplianceStatus;
  /** All rule violations found (empty when fully compliant). */
  violations: PolicyViolation[];
  /**
   * Disclosures that must be shown to the creator or end-user even when the
   * asset is allowed (e.g. "AI-generated content labeling required").
   */
  requiredDisclosures: string[];
  /** ISO 8601 timestamp of when this decision was produced. */
  evaluatedAt: string;
  /** The rule set id + version used for this evaluation, for audit trails. */
  policyId: string;
  policyVersion: string;
}

// ---------------------------------------------------------------------------
// Evaluation engine
// ---------------------------------------------------------------------------

/**
 * Evaluate a `PolicyRuleSet` against a `PolicyContext`.
 *
 * Evaluation is deterministic and synchronous.  Rules are tested in order.
 * The first `"blocked"` violation short-circuits further evaluation.
 *
 * @param ruleSet  The policy rule set to evaluate.
 * @param context  Facts about the asset / creator being evaluated.
 * @returns        A `PolicyDecision` describing compliance status.
 */
export function evaluatePolicy(
  ruleSet: PolicyRuleSet,
  context: PolicyContext,
): PolicyDecision {
  const violations: PolicyViolation[] = [];
  const requiredDisclosures: string[] = [];
  let blocked = false;

  for (const rule of ruleSet.rules) {
    if (!rule.predicate(context)) continue;

    const violation: PolicyViolation = {
      ruleId: rule.id,
      effect: rule.effect,
      message: rule.message,
      remediation: rule.remediation,
    };

    if (rule.effect === "blocked") {
      violations.push(violation);
      blocked = true;
      break; // hard stop on first block
    }

    if (rule.effect === "restricted") {
      violations.push(violation);
      requiredDisclosures.push(rule.message);
    }
  }

  const complianceStatus: ComplianceStatus = blocked
    ? "blocked"
    : violations.some((v) => v.effect === "restricted")
    ? "restricted"
    : "compliant";

  return {
    allowed: !blocked,
    complianceStatus,
    violations,
    requiredDisclosures,
    evaluatedAt: new Date().toISOString(),
    policyId: ruleSet.id,
    policyVersion: ruleSet.version,
  };
}

// ---------------------------------------------------------------------------
// Default rule set
// ---------------------------------------------------------------------------

/**
 * Default StellarVeriphy compliance rule set (v1.0.0).
 *
 * These rules encode the baseline compliance requirements.  Platform
 * operators may extend or override them via a custom `PolicyRuleSet`.
 *
 * Rules are intended for governance review — see `docs/legal` for the
 * full policy documentation.
 */
export const defaultRuleSet: PolicyRuleSet = {
  id: "stellarveriphy-default",
  version: "1.0.0",
  description: "StellarVeriphy baseline compliance rules",
  rules: [
    // -----------------------------------------------------------------------
    // AI labeling disclosures
    // -----------------------------------------------------------------------
    {
      id: "ai-label-disclosure-required",
      description: "Fully AI-generated content must carry a visible disclosure.",
      predicate: (ctx) => ctx.aiLabel === "fully_generated",
      effect: "restricted",
      message: "This asset has been labeled as fully AI-generated. A disclosure must be displayed to all viewers.",
      remediation: "Ensure the AI-generated content label is visible on the certificate and any public-facing display.",
    },
    {
      id: "ai-label-partial-disclosure",
      description: "Partially AI-generated content must carry a disclosure.",
      predicate: (ctx) => ctx.aiLabel === "partially_generated",
      effect: "restricted",
      message: "This asset has been labeled as partially AI-generated. A disclosure is required.",
      remediation: "Add an AI-content disclosure alongside the certificate.",
    },

    // -----------------------------------------------------------------------
    // News media
    // -----------------------------------------------------------------------
    {
      id: "news-media-ai-block",
      description: "Fully AI-generated content may not be certified as news media.",
      predicate: (ctx) => ctx.assetClass === "news_media" && ctx.aiLabel === "fully_generated",
      effect: "blocked",
      message: "Fully AI-generated assets cannot be certified as news media.",
      remediation: "Change the asset class or use an appropriate AI-generated content class.",
    },
    {
      id: "news-media-enterprise-required",
      description: "News media certification is limited to journalists and enterprise creators.",
      predicate: (ctx) =>
        ctx.assetClass === "news_media" &&
        ctx.creatorSegment !== "journalist" &&
        ctx.creatorSegment !== "enterprise" &&
        ctx.creatorSegment !== "government",
      effect: "blocked",
      message: "News media asset class is only available to verified journalists, enterprises, or government accounts.",
      remediation: "Contact StellarVeriphy to upgrade your creator segment before using this asset class.",
    },

    // -----------------------------------------------------------------------
    // Legal documents
    // -----------------------------------------------------------------------
    {
      id: "legal-document-ai-block",
      description: "AI-generated content must not be certified as a legal document.",
      predicate: (ctx) =>
        ctx.assetClass === "legal_document" &&
        (ctx.aiLabel === "fully_generated" || ctx.aiLabel === "partially_generated"),
      effect: "blocked",
      message: "AI-generated or partially AI-generated content cannot be certified as a legal document.",
      remediation: "Remove AI-generated content or choose a different asset class.",
    },

    // -----------------------------------------------------------------------
    // EU jurisdiction — GDPR / AI Act alignment
    // -----------------------------------------------------------------------
    {
      id: "eu-ai-enhanced-disclosure",
      description: "EU jurisdiction requires disclosure for AI-enhanced content.",
      predicate: (ctx) => ctx.jurisdiction === "EU" && ctx.aiLabel === "ai_enhanced",
      effect: "restricted",
      message: "EU regulations require AI-enhancement disclosure for content certified in this jurisdiction.",
      remediation: "Include an AI-enhancement disclosure with this certificate.",
    },

    // -----------------------------------------------------------------------
    // Scientific data
    // -----------------------------------------------------------------------
    {
      id: "scientific-data-ai-restricted",
      description: "AI-generated scientific data requires additional disclosure.",
      predicate: (ctx) =>
        ctx.assetClass === "scientific_data" &&
        (ctx.aiLabel === "fully_generated" || ctx.aiLabel === "partially_generated"),
      effect: "restricted",
      message: "AI-generated or AI-assisted scientific data requires explicit methodology disclosure.",
      remediation: "Add methodology notes to the manifest describing how AI was used in data generation.",
    },
  ],
};
