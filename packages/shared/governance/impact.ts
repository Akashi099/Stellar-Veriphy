/**
 * packages/shared/governance/impact.ts
 *
 * Impact classification shared by the governance framework.
 *
 * @module shared/governance/impact
 */

/** Impact tier of a governance decision.  Determines the review path. */
export type ImpactLevel = "low" | "moderate" | "high" | "critical";

const IMPACT_ORDER: Record<ImpactLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

/** Return the higher of two impact levels. */
export function maxImpact(a: ImpactLevel, b: ImpactLevel): ImpactLevel {
  return IMPACT_ORDER[a] >= IMPACT_ORDER[b] ? a : b;
}
