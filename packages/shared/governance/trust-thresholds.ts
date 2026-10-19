/**
 * packages/shared/governance/trust-thresholds.ts
 *
 * Trust thresholds governed by the StellarVeriphy governance framework.
 *
 * Every threshold has a hard floor and ceiling.  Floors protect the minimum
 * level of trust the network is willing to operate with; no review path,
 * however urgent, may push a value below its floor.  Lowering a threshold is
 * treated as a higher-impact change than raising one, because it weakens the
 * security guarantees users rely on.
 *
 * @module shared/governance/trust-thresholds
 */

import { maxImpact, type ImpactLevel } from "./impact";

/** Identifier for a governed trust threshold. */
export type TrustThresholdKey =
  | "provider_trust_min"
  | "attestation_confidence_min"
  | "reputation_quorum"
  | "dispute_evidence_min"
  | "oracle_agreement_min";

/** A governed trust threshold and its hard bounds. */
export interface TrustThreshold {
  key: TrustThresholdKey;
  displayName: string;
  /** Current value. */
  value: number;
  /** Hard minimum.  Changes below this are rejected outright. */
  floor: number;
  /** Hard maximum. */
  ceiling: number;
  /**
   * Minimum impact assigned to any change of this threshold, even a
   * strengthening one.
   */
  minimumImpactOnChange: ImpactLevel;
  description: string;
}

/** A proposed change to a trust threshold. */
export interface TrustThresholdChange {
  key: TrustThresholdKey;
  from: number;
  to: number;
}

/**
 * The network's default trust thresholds.  These are the values a proposal
 * is evaluated against unless a proposal explicitly replaces them.
 */
export const DEFAULT_TRUST_THRESHOLDS: Record<TrustThresholdKey, TrustThreshold> = {
  provider_trust_min: {
    key: "provider_trust_min",
    displayName: "Minimum provider trust score",
    value: 0.6,
    floor: 0.5,
    ceiling: 0.95,
    minimumImpactOnChange: "high",
    description: "Lowest provider trust score accepted for oracle attestations.",
  },
  attestation_confidence_min: {
    key: "attestation_confidence_min",
    displayName: "Minimum attestation confidence",
    value: 0.7,
    floor: 0.5,
    ceiling: 0.99,
    minimumImpactOnChange: "moderate",
    description: "Lowest confidence score accepted when minting a provenance certificate.",
  },
  reputation_quorum: {
    key: "reputation_quorum",
    displayName: "Verifier reputation quorum",
    value: 2,
    floor: 1,
    ceiling: 10,
    minimumImpactOnChange: "moderate",
    description: "Number of independent verifiers required to confirm a disputed claim.",
  },
  dispute_evidence_min: {
    key: "dispute_evidence_min",
    displayName: "Minimum dispute evidence",
    value: 0.4,
    floor: 0.3,
    ceiling: 0.9,
    minimumImpactOnChange: "moderate",
    description: "Minimum evidence weight required for a dispute to be admitted.",
  },
  oracle_agreement_min: {
    key: "oracle_agreement_min",
    displayName: "Oracle agreement threshold",
    value: 0.66,
    floor: 0.51,
    ceiling: 1,
    minimumImpactOnChange: "high",
    description: "Fraction of oracle responses that must agree before a result is final.",
  },
};

/** Outcome of evaluating a proposed threshold change. */
export type ThresholdChangeOutcome =
  "no_change" | "allowed" | "requires_elevated_review" | "below_floor" | "above_ceiling";

export interface ThresholdChangeDecision {
  outcome: ThresholdChangeOutcome;
  /** The minimum impact the resulting proposal must carry. */
  minimumImpact: ImpactLevel;
  reason: string;
  change: TrustThresholdChange;
}

/**
 * Evaluate a proposed threshold change against the current threshold and its
 * hard bounds.
 *
 * - A change below the floor or above the ceiling is rejected and can never
 *   be approved.
 * - A change that lowers a threshold requires `critical` review, because it
 *   weakens a security guarantee.
 * - A change that raises a threshold carries at least the threshold's
 *   declared `minimumImpactOnChange`, because it can restrict participation.
 */
export function evaluateThresholdChange(change: TrustThresholdChange): ThresholdChangeDecision {
  const threshold = DEFAULT_TRUST_THRESHOLDS[change.key];

  if (change.to < threshold.floor) {
    return {
      outcome: "below_floor",
      minimumImpact: "critical",
      reason: `Value ${change.to} for "${threshold.displayName}" is below the hard floor of ${threshold.floor}.`,
      change,
    };
  }

  if (change.to > threshold.ceiling) {
    return {
      outcome: "above_ceiling",
      minimumImpact: "critical",
      reason: `Value ${change.to} for "${threshold.displayName}" exceeds the maximum of ${threshold.ceiling}.`,
      change,
    };
  }

  if (change.to === change.from) {
    return {
      outcome: "no_change",
      minimumImpact: threshold.minimumImpactOnChange,
      reason: `Value for "${threshold.displayName}" is unchanged.`,
      change,
    };
  }

  if (change.to < change.from) {
    return {
      outcome: "requires_elevated_review",
      minimumImpact: "critical",
      reason: `Lowering "${threshold.displayName}" from ${change.from} to ${change.to} weakens a security guarantee and requires critical review.`,
      change,
    };
  }

  return {
    outcome: "allowed",
    minimumImpact: threshold.minimumImpactOnChange,
    reason: `Raising "${threshold.displayName}" from ${change.from} to ${change.to} requires at least ${threshold.minimumImpactOnChange} review.`,
    change,
  };
}

/**
 * Return the highest minimum-impact across a set of threshold changes, or
 * `undefined` when there are no changes.  Used to ensure a proposal can never
 * under-declare the risk of the changes it contains.
 */
export function highestThresholdImpact(changes: TrustThresholdChange[]): ImpactLevel | undefined {
  return changes.reduce<ImpactLevel | undefined>((acc, change) => {
    const impact = evaluateThresholdChange(change).minimumImpact;
    return acc === undefined ? impact : maxImpact(acc, impact);
  }, undefined);
}
