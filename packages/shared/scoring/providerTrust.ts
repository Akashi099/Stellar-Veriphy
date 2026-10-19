/**
 * providerTrust.ts (#668)
 *
 * Score-based trust model for oracle / verification providers. Combines
 * historical outcomes, attestation consistency, SLA health, dispute history
 * and economic stake into a single 0–100 score with an explainable factor
 * breakdown, a confidence value, and risk flags.
 *
 * The on-chain counterpart (`get_provider_trust_score` in
 * contracts/oracle) computes a subset of these factors from contract state;
 * this module is the full, tunable model used by the frontend and API.
 *
 * Tuning: every weight and threshold lives in `TrustScoreConfig`. Pass a
 * partial config to `scoreProvider` to experiment; see
 * docs/features/provider-trust-scoring.md for the rationale of each default.
 *
 * @module packages/shared/scoring/providerTrust
 */

// ---------------------------------------------------------------------------
// Inputs & outputs
// ---------------------------------------------------------------------------

export interface ProviderTrustInputs {
  providerId: string;
  label?: string;
  /** Historical verification outcomes. */
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  /** Attestations re-checked (e.g. by a second provider or audit) and how many agreed. */
  attestationsCrossChecked: number;
  attestationsConsistent: number;
  /** SLA actuals (0–100 / seconds). Omit when no SLA is configured. */
  uptimePercent?: number;
  avgResponseTimeSeconds?: number;
  targetResponseTimeSeconds?: number;
  /** Dispute history (from the oracle contract dispute registry). */
  disputesTotal: number;
  disputesProviderFault: number;
  disputesOpen: number;
  disputesDismissed: number;
  /** Stake currently held, in stroops. */
  stakeStroops: number;
  suspended: boolean;
  teeHashNearExpiry?: boolean;
  /** Unix seconds of last activity; 0 = never. */
  lastActivityAt: number;
}

export type TrustFactorKey =
  | "outcomes"
  | "attestationConsistency"
  | "availability"
  | "latency"
  | "disputes"
  | "stake"
  | "recency";

export interface TrustFactor {
  key: TrustFactorKey;
  label: string;
  /** Normalised factor score 0–1 (1 = best). */
  value: number;
  weight: number;
  /** Points this factor contributed to the final score. */
  contribution: number;
  explanation: string;
}

export type TrustTier = "high" | "medium" | "low" | "untrusted";

export type TrustFlag =
  | "suspended"
  | "insufficient_history"
  | "high_failure_rate"
  | "attestation_inconsistency"
  | "provider_fault_disputes"
  | "open_disputes"
  | "under_staked"
  | "inactive"
  | "tee_expiry"
  | "slow_responses";

export interface ProviderTrustScore {
  providerId: string;
  label?: string;
  /** Final score 0–100 after penalties. */
  score: number;
  tier: TrustTier;
  /** 0–1: how much evidence backs the score (driven by sample size). */
  confidence: number;
  factors: TrustFactor[];
  flags: TrustFlag[];
  /** True when the provider should be deprioritised or reviewed. */
  highRisk: boolean;
  computedAt: number;
  modelVersion: string;
}

export interface TrustScoreConfig {
  weights: Record<TrustFactorKey, number>;
  /** Bayesian prior: neutral success rate and its pseudo-count. */
  priorSuccessRate: number;
  priorWeight: number;
  /** Sample size at which confidence reaches ~0.63 (1 - 1/e). */
  confidenceScale: number;
  /** Stake (stroops) that earns full stake credit. */
  fullStakeStroops: number;
  minimumStakeStroops: number;
  /** Seconds of inactivity before recency starts decaying, and until it hits 0. */
  recencyGraceSeconds: number;
  recencyZeroSeconds: number;
  /** Each provider-fault dispute removes this fraction of the dispute factor. */
  providerFaultPenalty: number;
  openDisputePenalty: number;
  /** Multipliers applied after weighting. */
  suspendedMultiplier: number;
  teeExpiryMultiplier: number;
  tiers: { high: number; medium: number; low: number };
  minSampleForTier: number;
}

export const TRUST_MODEL_VERSION = "1.0.0";

export const DEFAULT_TRUST_CONFIG: TrustScoreConfig = {
  weights: {
    outcomes: 0.3,
    attestationConsistency: 0.2,
    disputes: 0.2,
    availability: 0.1,
    latency: 0.05,
    stake: 0.1,
    recency: 0.05,
  },
  priorSuccessRate: 0.8,
  priorWeight: 20,
  confidenceScale: 100,
  fullStakeStroops: 10_000_000_000, // 1,000 XLM
  minimumStakeStroops: 1_000_000_000, // 10 XLM — matches MINIMUM_STAKE in the oracle contract
  recencyGraceSeconds: 7 * 86_400,
  recencyZeroSeconds: 60 * 86_400,
  providerFaultPenalty: 0.25,
  openDisputePenalty: 0.05,
  suspendedMultiplier: 0.4,
  teeExpiryMultiplier: 0.9,
  tiers: { high: 85, medium: 65, low: 40 },
  minSampleForTier: 10,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Beta-prior smoothed rate: small samples are pulled toward the prior. */
function smoothedRate(successes: number, total: number, prior: number, weight: number): number {
  return (successes + prior * weight) / (total + weight);
}

function mergeConfig(partial?: Partial<TrustScoreConfig>): TrustScoreConfig {
  if (!partial) return DEFAULT_TRUST_CONFIG;
  return {
    ...DEFAULT_TRUST_CONFIG,
    ...partial,
    weights: { ...DEFAULT_TRUST_CONFIG.weights, ...partial.weights },
    tiers: { ...DEFAULT_TRUST_CONFIG.tiers, ...partial.tiers },
  };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreProvider(
  input: ProviderTrustInputs,
  configOverride?: Partial<TrustScoreConfig>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): ProviderTrustScore {
  const cfg = mergeConfig(configOverride);
  const flags: TrustFlag[] = [];
  const total = Math.max(0, input.totalVerifications);

  // 1. Historical outcomes (smoothed success rate)
  const outcomes = smoothedRate(input.successfulVerifications, total, cfg.priorSuccessRate, cfg.priorWeight);
  const rawFailureRate = total > 0 ? input.failedVerifications / total : 0;
  if (total >= cfg.minSampleForTier && rawFailureRate > 0.2) flags.push("high_failure_rate");

  // 2. Attestation consistency
  const attestation = smoothedRate(
    input.attestationsConsistent,
    input.attestationsCrossChecked,
    cfg.priorSuccessRate,
    cfg.priorWeight / 2,
  );
  if (input.attestationsCrossChecked > 0 && input.attestationsConsistent / input.attestationsCrossChecked < 0.9) {
    flags.push("attestation_inconsistency");
  }

  // 3. Availability
  const availability = input.uptimePercent === undefined ? cfg.priorSuccessRate : clamp01(input.uptimePercent / 100);

  // 4. Latency — full credit at/below target, linear decay to 0 at 3× target
  let latency = cfg.priorSuccessRate;
  if (input.avgResponseTimeSeconds !== undefined) {
    const target = input.targetResponseTimeSeconds && input.targetResponseTimeSeconds > 0 ? input.targetResponseTimeSeconds : 30;
    latency = clamp01(1 - (input.avgResponseTimeSeconds - target) / (2 * target));
    if (input.avgResponseTimeSeconds > target) flags.push("slow_responses");
  }

  // 5. Disputes — provider-fault outcomes weigh heavily, open ones slightly,
  //    dismissed disputes are ignored (frivolous claims should not hurt).
  const disputes = clamp01(
    1 - input.disputesProviderFault * cfg.providerFaultPenalty - input.disputesOpen * cfg.openDisputePenalty,
  );
  if (input.disputesProviderFault > 0) flags.push("provider_fault_disputes");
  if (input.disputesOpen > 0) flags.push("open_disputes");

  // 6. Stake — log-scaled between minimum and full
  let stake = 0;
  if (input.stakeStroops >= cfg.minimumStakeStroops) {
    stake = clamp01(
      0.5 + 0.5 * (Math.log(input.stakeStroops / cfg.minimumStakeStroops) / Math.log(cfg.fullStakeStroops / cfg.minimumStakeStroops)),
    );
  } else {
    flags.push("under_staked");
  }

  // 7. Recency
  let recency = 0;
  if (input.lastActivityAt > 0) {
    const idle = Math.max(0, nowSeconds - input.lastActivityAt);
    recency = idle <= cfg.recencyGraceSeconds
      ? 1
      : clamp01(1 - (idle - cfg.recencyGraceSeconds) / (cfg.recencyZeroSeconds - cfg.recencyGraceSeconds));
  }
  if (recency < 0.5) flags.push("inactive");

  const raw: Array<[TrustFactorKey, string, number, string]> = [
    ["outcomes", "Historical outcomes", outcomes, `${input.successfulVerifications}/${total} successful (smoothed ${round(outcomes * 100)}%)`],
    ["attestationConsistency", "Attestation consistency", attestation, input.attestationsCrossChecked > 0 ? `${input.attestationsConsistent}/${input.attestationsCrossChecked} cross-checks agreed` : "No cross-checks yet (prior applied)"],
    ["disputes", "Dispute history", disputes, `${input.disputesProviderFault} provider-fault, ${input.disputesOpen} open, ${input.disputesDismissed} dismissed of ${input.disputesTotal}`],
    ["availability", "Availability", availability, input.uptimePercent === undefined ? "No SLA data (prior applied)" : `${round(input.uptimePercent)}% uptime`],
    ["latency", "Latency", latency, input.avgResponseTimeSeconds === undefined ? "No SLA data (prior applied)" : `${round(input.avgResponseTimeSeconds)}s avg response`],
    ["stake", "Economic stake", stake, `${round(input.stakeStroops / 10_000_000, 2)} XLM staked`],
    ["recency", "Recent activity", recency, input.lastActivityAt > 0 ? `Last active ${Math.round((nowSeconds - input.lastActivityAt) / 3600)}h ago` : "Never active"],
  ];

  const weightSum = Object.values(cfg.weights).reduce((s, w) => s + Math.max(0, w), 0) || 1;
  const factors: TrustFactor[] = raw.map(([key, label, value, explanation]) => {
    const weight = Math.max(0, cfg.weights[key]) / weightSum;
    return { key, label, value: round(value, 3), weight: round(weight, 3), contribution: round(value * weight * 100), explanation };
  });

  let score = factors.reduce((s, f) => s + f.value * f.weight * 100, 0);
  if (input.suspended) {
    score *= cfg.suspendedMultiplier;
    flags.unshift("suspended");
  }
  if (input.teeHashNearExpiry) {
    score *= cfg.teeExpiryMultiplier;
    flags.push("tee_expiry");
  }
  score = round(Math.min(100, Math.max(0, score)));

  const confidence = round(1 - Math.exp(-total / cfg.confidenceScale), 2);
  if (total < cfg.minSampleForTier) flags.push("insufficient_history");

  let tier: TrustTier;
  if (input.suspended || score < cfg.tiers.low) tier = "untrusted";
  else if (score < cfg.tiers.medium || total < cfg.minSampleForTier) tier = "low";
  else if (score < cfg.tiers.high) tier = "medium";
  else tier = "high";

  const highRisk =
    tier === "untrusted" ||
    tier === "low" ||
    flags.includes("provider_fault_disputes") ||
    flags.includes("attestation_inconsistency");

  return {
    providerId: input.providerId,
    label: input.label,
    score,
    tier,
    confidence,
    factors,
    flags,
    highRisk,
    computedAt: nowSeconds,
    modelVersion: TRUST_MODEL_VERSION,
  };
}

/** Scores and ranks providers: highest score first, ties broken by confidence. */
export function rankProviders(
  inputs: ProviderTrustInputs[],
  config?: Partial<TrustScoreConfig>,
  nowSeconds?: number,
): ProviderTrustScore[] {
  return inputs
    .map((i) => scoreProvider(i, config, nowSeconds))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

export const TRUST_FLAG_LABELS: Record<TrustFlag, string> = {
  suspended: "Suspended",
  insufficient_history: "Insufficient history",
  high_failure_rate: "High failure rate",
  attestation_inconsistency: "Inconsistent attestations",
  provider_fault_disputes: "Lost disputes",
  open_disputes: "Open disputes",
  under_staked: "Under-staked",
  inactive: "Inactive",
  tee_expiry: "TEE hash expiring",
  slow_responses: "Slow responses",
};
