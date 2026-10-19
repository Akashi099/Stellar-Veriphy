/**
 * packages/shared/verifier-reputation/index.ts
 *
 * Decentralised verifier reputation network model for StellarVeriphy.
 * Closes #676.
 *
 * ## Purpose
 *
 * This module implements a reputational scoring system for external verifiers
 * (oracle actors) in the StellarVeriphy network.  It computes a
 * composite trust/reputation score from quality signals, historical
 * reliability, and dispute outcomes — producing a score that is:
 *
 * - **Meaningful** — driven by on-chain evidence (verification outcomes,
 *   dispute results, stake), not self-reported claims.
 * - **Differentiated** — distinguishes temporary degradation from persistent
 *   mistrust, so a new provider is not permanently excluded for early errors.
 * - **Transparent** — every score comes with an explainable factor
 *   breakdown and a list of active risk flags.
 * - **Misuse-resistant** — the decay model prevents score manipulation by
 *   stacking cheap verifications; the dispute system penalises bad actors
 *   proportionally to fault severity.
 *
 * ## Relationship to `packages/shared/scoring/providerTrust.ts`
 *
 * `providerTrust.ts` computes a trust score for oracle *providers* (the
 * infrastructure layer).  This module scores external *verifiers* (the
 * network participants who vote on disputed verifications and provide
 * secondary attestations).  The two models share similar factors but
 * differ in:
 * - Input signals (verifiers have dispute votes; providers have SLA metrics).
 * - Decay / recovery mechanics (verifiers have an explicit `degradedUntil`
 *   window; providers use suspension/unsuspension events).
 *
 * @module shared/verifier-reputation
 */

// ---------------------------------------------------------------------------
// Verifier identity
// ---------------------------------------------------------------------------

/**
 * Status of a verifier's participation in the network.
 *
 * - `active` – fully participating; can be selected for verification tasks.
 * - `degraded` – temporarily reduced score due to recent poor behaviour;
 *   can still participate but at lower priority.
 * - `probation` – low-quality history; accepted but flagged; monitored.
 * - `suspended` – temporarily excluded from new verification tasks.
 * - `blacklisted` – permanently excluded; historical verifications remain
 *   on-chain but no new tasks are assigned.
 */
export type VerifierStatus =
  | "active"
  | "degraded"
  | "probation"
  | "suspended"
  | "blacklisted";

/**
 * A registered external verifier.
 */
export interface VerifierRecord {
  /** Unique identifier; typically the Stellar public key (G…). */
  verifierId: string;
  /** Human-readable display label. */
  label?: string;
  status: VerifierStatus;
  /** ISO-8601 registration date. */
  registeredAt: string;
  /**
   * ISO-8601 end of the degraded window.  The verifier's score is penalised
   * during this period.  Null when not in a degraded window.
   */
  degradedUntil: string | null;
  /**
   * Stake held by the verifier in stroops.
   * Stake acts as a quality signal: a higher stake indicates a credible
   * commitment to honest behaviour.
   */
  stakeStroops: number;
  /** Unix timestamp of the most recent verification activity. */
  lastActiveAt: number;
}

// ---------------------------------------------------------------------------
// Quality signals
// ---------------------------------------------------------------------------

/**
 * Verification quality signals for a verifier.
 * Collected from on-chain events and the oracle dispute registry.
 */
export interface VerifierQualitySignals {
  verifierId: string;
  /**
   * Total number of verification tasks the verifier participated in.
   * Each task is a submitted or co-signed attestation.
   */
  totalVerifications: number;
  /**
   * Verifications that reached `minted` status with no subsequent dispute.
   */
  successfulVerifications: number;
  /**
   * Verifications that were successfully challenged and found to be incorrect.
   */
  failedVerifications: number;
  /** Disputes where the verifier was found at fault. */
  disputesFault: number;
  /** Disputes where the verifier was exonerated (challenger was wrong). */
  disputesExonerated: number;
  /** Disputes still open (unresolved). */
  disputesOpen: number;
  /**
   * Cross-check consistency: verifications reviewed by a second verifier that
   * agreed with this verifier's result.
   */
  crossCheckAgreements: number;
  /** Total cross-checks performed. */
  crossCheckTotal: number;
  /**
   * Historical response time in milliseconds (median over last N tasks).
   * Lower is better.
   */
  medianResponseMs: number;
}

// ---------------------------------------------------------------------------
// Score output
// ---------------------------------------------------------------------------

export type ReputationFactorKey =
  | "success_rate"
  | "fault_dispute_rate"
  | "exoneration_rate"
  | "cross_check_consistency"
  | "response_time"
  | "stake"
  | "recency";

export interface ReputationFactor {
  key: ReputationFactorKey;
  label: string;
  /** Normalised factor value in [0, 1] (1 = best). */
  value: number;
  weight: number;
  /** Points this factor contributed to the final score (0–100). */
  contribution: number;
  explanation: string;
}

export type ReputationTier =
  | "elite" // 85–100: top-tier, preferred for high-stakes jobs
  | "trusted" // 65–84: reliable, normal selection priority
  | "neutral" // 45–64: acceptable; used when better verifiers unavailable
  | "degraded" // 25–44: temporary penalty window active
  | "untrusted"; // 0–24: avoid; suspend if persistent

export type ReputationFlag =
  | "blacklisted"
  | "suspended"
  | "no_history"
  | "high_fault_rate"
  | "open_disputes"
  | "under_staked"
  | "inactive"
  | "degraded_window_active"
  | "cross_check_inconsistency";

export interface VerifierReputationScore {
  verifierId: string;
  /** Composite reputation score 0–100. */
  score: number;
  tier: ReputationTier;
  /** Explainable factor breakdown. */
  factors: ReputationFactor[];
  /** Active risk flags. */
  flags: ReputationFlag[];
  /** Whether this verifier should be excluded from new task selection. */
  excluded: boolean;
  /** ISO-8601 timestamp of score computation. */
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Score configuration
// ---------------------------------------------------------------------------

export interface ReputationScoreConfig {
  weights: Record<ReputationFactorKey, number>;
  /**
   * Minimum number of verifications before historical factors carry full
   * weight.  Below this threshold a Bayesian prior is applied.
   */
  minHistoryForFullWeight: number;
  /**
   * Prior success rate used when a verifier has fewer verifications than
   * `minHistoryForFullWeight` (0–1).
   */
  priorSuccessRate: number;
  /** Minimum stake in stroops to avoid the `under_staked` flag. */
  minStakeStroops: number;
  /** Fault dispute rate above which the `high_fault_rate` flag is set (0–1). */
  highFaultRateThreshold: number;
  /**
   * Response time target in milliseconds.  Verifiers above this are penalised
   * on the `response_time` factor.
   */
  targetResponseMs: number;
  /**
   * Score threshold below which the verifier is flagged as `excluded`.
   * Default: 25 (maps to `untrusted` tier).
   */
  exclusionThreshold: number;
  /** Days of inactivity after which the `inactive` flag is set. */
  inactivityDays: number;
}

export const DEFAULT_REPUTATION_CONFIG: ReputationScoreConfig = {
  weights: {
    success_rate: 30,
    fault_dispute_rate: 25,
    exoneration_rate: 10,
    cross_check_consistency: 15,
    response_time: 5,
    stake: 10,
    recency: 5,
  },
  minHistoryForFullWeight: 20,
  priorSuccessRate: 0.75,
  minStakeStroops: 1_000_000_000, // 10 XLM
  highFaultRateThreshold: 0.1, // 10%
  targetResponseMs: 30_000, // 30 seconds
  exclusionThreshold: 25,
  inactivityDays: 30,
};

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/**
 * Compute a reputation score for a verifier from their quality signals.
 *
 * This is a pure function.  Pass a custom `config` to tune weights and
 * thresholds for your deployment.
 */
export function scoreVerifier(
  record: VerifierRecord,
  signals: VerifierQualitySignals,
  now: string,
  config: ReputationScoreConfig = DEFAULT_REPUTATION_CONFIG
): VerifierReputationScore {
  const nowMs = new Date(now).getTime();
  const flags: ReputationFlag[] = [];
  const factors: ReputationFactor[] = [];

  // Immediate exclusion conditions
  if (record.status === "blacklisted") {
    flags.push("blacklisted");
    return buildZeroScore(record.verifierId, flags, now);
  }
  if (record.status === "suspended") {
    flags.push("suspended");
    return buildZeroScore(record.verifierId, flags, now);
  }

  const total = signals.totalVerifications;
  const priorWeight =
    total < config.minHistoryForFullWeight
      ? (config.minHistoryForFullWeight - total) / config.minHistoryForFullWeight
      : 0;

  if (total === 0) {
    flags.push("no_history");
  }

  // 1. Success rate factor
  {
    const rawRate =
      total > 0
        ? signals.successfulVerifications / total
        : config.priorSuccessRate;
    const blended =
      priorWeight * config.priorSuccessRate + (1 - priorWeight) * rawRate;
    const contribution = blended * config.weights.success_rate;

    factors.push({
      key: "success_rate",
      label: "Success Rate",
      value: blended,
      weight: config.weights.success_rate,
      contribution,
      explanation: `${(blended * 100).toFixed(1)}% success rate (${signals.successfulVerifications}/${total}${priorWeight > 0 ? "; prior applied" : ""}).`,
    });
  }

  // 2. Fault dispute rate factor
  {
    const faultRate =
      total > 0 ? signals.disputesFault / total : 0;
    const blended = priorWeight * 0.02 + (1 - priorWeight) * faultRate;
    const factor = Math.max(0, 1 - blended * 10); // invert: lower fault = higher factor
    const contribution = factor * config.weights.fault_dispute_rate;

    if (faultRate > config.highFaultRateThreshold) {
      flags.push("high_fault_rate");
    }
    if (signals.disputesOpen > 0) {
      flags.push("open_disputes");
    }

    factors.push({
      key: "fault_dispute_rate",
      label: "Fault Dispute Rate",
      value: factor,
      weight: config.weights.fault_dispute_rate,
      contribution,
      explanation: `${(faultRate * 100).toFixed(1)}% fault rate (${signals.disputesFault} fault dispute(s) in ${total} verifications).`,
    });
  }

  // 3. Exoneration rate factor
  {
    const totalDisputes =
      signals.disputesFault + signals.disputesExonerated + signals.disputesOpen;
    const exonerationRate =
      totalDisputes > 0 ? signals.disputesExonerated / totalDisputes : 0.5;
    const contribution = exonerationRate * config.weights.exoneration_rate;

    factors.push({
      key: "exoneration_rate",
      label: "Dispute Exoneration Rate",
      value: exonerationRate,
      weight: config.weights.exoneration_rate,
      contribution,
      explanation: `${(exonerationRate * 100).toFixed(1)}% exoneration rate (${signals.disputesExonerated} exonerated / ${totalDisputes} disputes).`,
    });
  }

  // 4. Cross-check consistency factor
  {
    const ccRate =
      signals.crossCheckTotal > 0
        ? signals.crossCheckAgreements / signals.crossCheckTotal
        : 0.8; // prior
    const contribution = ccRate * config.weights.cross_check_consistency;

    if (signals.crossCheckTotal >= 5 && ccRate < 0.7) {
      flags.push("cross_check_inconsistency");
    }

    factors.push({
      key: "cross_check_consistency",
      label: "Cross-Check Consistency",
      value: ccRate,
      weight: config.weights.cross_check_consistency,
      contribution,
      explanation: `${(ccRate * 100).toFixed(1)}% agreement in cross-check reviews (${signals.crossCheckAgreements}/${signals.crossCheckTotal}).`,
    });
  }

  // 5. Response time factor
  {
    const targetMs = config.targetResponseMs;
    const responseMs = signals.medianResponseMs || targetMs;
    const factor = Math.min(1, targetMs / Math.max(responseMs, 1));
    const contribution = factor * config.weights.response_time;

    factors.push({
      key: "response_time",
      label: "Response Time",
      value: factor,
      weight: config.weights.response_time,
      contribution,
      explanation: `Median response ${responseMs}ms (target: ${targetMs}ms).`,
    });
  }

  // 6. Stake factor
  {
    const minStake = config.minStakeStroops;
    const stakeRatio = Math.min(1, record.stakeStroops / (minStake * 5));
    const contribution = stakeRatio * config.weights.stake;

    if (record.stakeStroops < minStake) {
      flags.push("under_staked");
    }

    factors.push({
      key: "stake",
      label: "Stake",
      value: stakeRatio,
      weight: config.weights.stake,
      contribution,
      explanation: `${record.stakeStroops.toLocaleString()} stroops staked (min: ${minStake.toLocaleString()}).`,
    });
  }

  // 7. Recency factor
  {
    const lastActiveMs = record.lastActiveAt * 1_000;
    const daysSinceActive = Math.floor((nowMs - lastActiveMs) / 86_400_000);
    const recencyFactor = Math.max(0, 1 - daysSinceActive / 90);
    const contribution = recencyFactor * config.weights.recency;

    if (daysSinceActive > config.inactivityDays) {
      flags.push("inactive");
    }

    factors.push({
      key: "recency",
      label: "Recency",
      value: recencyFactor,
      weight: config.weights.recency,
      contribution,
      explanation: `Last active ${daysSinceActive} day(s) ago.`,
    });
  }

  // Degraded window check
  let degradedMultiplier = 1.0;
  if (record.degradedUntil) {
    const degradedUntilMs = new Date(record.degradedUntil).getTime();
    if (nowMs < degradedUntilMs) {
      flags.push("degraded_window_active");
      degradedMultiplier = 0.65; // 35% penalty during degraded window
    }
  }

  // Compute composite score
  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const score = Math.min(100, Math.max(0, Math.round(rawScore * degradedMultiplier)));

  const tier = scoreToTier(score);
  const excluded = score < config.exclusionThreshold;

  return {
    verifierId: record.verifierId,
    score,
    tier,
    factors,
    flags,
    excluded,
    computedAt: now,
  };
}

function buildZeroScore(
  verifierId: string,
  flags: ReputationFlag[],
  computedAt: string
): VerifierReputationScore {
  return {
    verifierId,
    score: 0,
    tier: "untrusted",
    factors: [],
    flags,
    excluded: true,
    computedAt,
  };
}

function scoreToTier(score: number): ReputationTier {
  if (score >= 85) return "elite";
  if (score >= 65) return "trusted";
  if (score >= 45) return "neutral";
  if (score >= 25) return "degraded";
  return "untrusted";
}

// ---------------------------------------------------------------------------
// Degraded window management
// ---------------------------------------------------------------------------

/**
 * Reason a verifier's score is temporarily degraded.
 */
export type DegradationReason =
  | "dispute_fault" // Found at fault in a dispute
  | "attestation_inconsistency" // Cross-check disagreement above threshold
  | "sla_breach" // SLA compliance below target
  | "suspicious_pattern" // Anomaly detector flagged activity
  | "manual_override"; // Platform admin manually triggered degradation

/**
 * Event that triggers a degraded window for a verifier.
 */
export interface DegradationEvent {
  eventId: string;
  verifierId: string;
  reason: DegradationReason;
  /** ISO-8601 start of the degraded window. */
  startedAt: string;
  /** ISO-8601 end of the degraded window.  Null = indefinite (use suspend). */
  endsAt: string;
  /** Who triggered this event (system or admin ID). */
  triggeredBy: string;
  note: string;
}

/**
 * Apply a degradation event to a verifier record.
 *
 * Returns an updated `VerifierRecord` (immutable update pattern).
 * The caller is responsible for persisting the result and emitting the event
 * to the audit log.
 */
export function applyDegradation(
  record: VerifierRecord,
  event: DegradationEvent
): VerifierRecord {
  // If already in a worse state, do not downgrade the status further
  if (record.status === "blacklisted" || record.status === "suspended") {
    return record;
  }

  return {
    ...record,
    status: "degraded",
    degradedUntil: event.endsAt,
  };
}

/**
 * Expire a degradation window if the current time is past `degradedUntil`.
 *
 * Returns an updated `VerifierRecord` with `status` reset to `active` and
 * `degradedUntil` cleared.  If the window has not expired, returns the
 * record unchanged.
 */
export function expireDegradationIfDue(
  record: VerifierRecord,
  now: string
): VerifierRecord {
  if (record.status !== "degraded" || !record.degradedUntil) {
    return record;
  }

  const nowMs = new Date(now).getTime();
  const endsAtMs = new Date(record.degradedUntil).getTime();

  if (nowMs >= endsAtMs) {
    return {
      ...record,
      status: "active",
      degradedUntil: null,
    };
  }

  return record;
}

// ---------------------------------------------------------------------------
// Dispute outcome integration
// ---------------------------------------------------------------------------

/**
 * The outcome of a dispute resolution for a verifier.
 */
export interface DisputeOutcome {
  disputeId: string;
  verifierId: string;
  outcome: "verifier_fault" | "challenger_fault" | "no_fault" | "dismissed";
  /** ISO-8601 resolution timestamp. */
  resolvedAt: string;
  /** The degradation window to apply if the verifier was at fault. */
  degradationWindowDays: number;
}

/**
 * Apply a dispute outcome to a verifier record, optionally triggering a
 * degradation window.
 *
 * Returns an updated `VerifierRecord` and an optional `DegradationEvent`
 * if a degraded window was started.
 */
export function applyDisputeOutcome(
  record: VerifierRecord,
  outcome: DisputeOutcome,
  triggeredBy: string
): { record: VerifierRecord; degradationEvent: DegradationEvent | null } {
  if (outcome.outcome !== "verifier_fault") {
    return { record, degradationEvent: null };
  }

  const endsAt = new Date(
    new Date(outcome.resolvedAt).getTime() +
      outcome.degradationWindowDays * 86_400_000
  ).toISOString();

  const event: DegradationEvent = {
    eventId: `deg-${record.verifierId}-${outcome.disputeId}`,
    verifierId: record.verifierId,
    reason: "dispute_fault",
    startedAt: outcome.resolvedAt,
    endsAt,
    triggeredBy,
    note: `Dispute ${outcome.disputeId} resolved: verifier at fault. Degraded for ${outcome.degradationWindowDays} day(s).`,
  };

  const updatedRecord = applyDegradation(record, event);
  return { record: updatedRecord, degradationEvent: event };
}

// ---------------------------------------------------------------------------
// Network-level reputation summary
// ---------------------------------------------------------------------------

/**
 * Summary statistics for a set of verifiers.
 * Useful for network health dashboards and governance reporting.
 */
export interface ReputationNetworkSummary {
  totalVerifiers: number;
  eliteCount: number;
  trustedCount: number;
  neutralCount: number;
  degradedCount: number;
  untrustedCount: number;
  excludedCount: number;
  /** Average score across all non-excluded verifiers. */
  averageScore: number;
  generatedAt: string;
}

/**
 * Compute a network-level reputation summary from a set of scored verifiers.
 */
export function summariseReputationNetwork(
  scores: VerifierReputationScore[],
  now: string
): ReputationNetworkSummary {
  let eliteCount = 0;
  let trustedCount = 0;
  let neutralCount = 0;
  let degradedCount = 0;
  let untrustedCount = 0;
  let excludedCount = 0;
  let scoreSum = 0;
  let includedCount = 0;

  for (const s of scores) {
    if (s.excluded) excludedCount++;
    else {
      scoreSum += s.score;
      includedCount++;
    }

    switch (s.tier) {
      case "elite":
        eliteCount++;
        break;
      case "trusted":
        trustedCount++;
        break;
      case "neutral":
        neutralCount++;
        break;
      case "degraded":
        degradedCount++;
        break;
      case "untrusted":
        untrustedCount++;
        break;
    }
  }

  return {
    totalVerifiers: scores.length,
    eliteCount,
    trustedCount,
    neutralCount,
    degradedCount,
    untrustedCount,
    excludedCount,
    averageScore: includedCount > 0 ? Math.round(scoreSum / includedCount) : 0,
    generatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Risk and misuse guardrails
// ---------------------------------------------------------------------------

/**
 * A documented risk and its associated guardrail for the reputation system.
 * Exposed as structured data so it can be rendered in governance documentation
 * without requiring prose updates to the code.
 */
export interface ReputationRisk {
  riskId: string;
  title: string;
  description: string;
  mitigations: string[];
}

/**
 * Known risks and guardrails for the verifier reputation model.
 * Fulfils the "documented with the risks and guardrails for misuse" acceptance
 * criterion of issue #676.
 */
export const REPUTATION_RISKS: ReputationRisk[] = [
  {
    riskId: "score-wash",
    title: "Score Washing via Cheap Verifications",
    description:
      "A verifier could inflate their score by submitting large numbers of trivial, low-value verifications that are unlikely to be disputed.",
    mitigations: [
      "The Bayesian prior limits the score benefit of early verifications until a minimum history threshold is reached.",
      "The `stake` factor requires a credible economic commitment, raising the cost of wash strategies.",
      "The `cross_check_consistency` factor is harder to game without access to a second colluding verifier.",
      "Anomaly detection (see packages/shared/anomaly) can flag unusual volume spikes for operator review.",
    ],
  },
  {
    riskId: "dispute-abuse",
    title: "Dispute Griefing",
    description:
      "An adversary could file spurious disputes against a good verifier to reduce their score.",
    mitigations: [
      "Disputes require stake from the challenger; a dismissed or no-fault outcome penalises the challenger instead.",
      "The `exoneration_rate` factor rewards verifiers who are consistently found not at fault in disputes.",
      "Platform admins can apply `manual_override` degradation events with an explicit justification, providing an escalation path.",
    ],
  },
  {
    riskId: "collusion",
    title: "Verifier Collusion",
    description:
      "Multiple colluding verifiers could agree on incorrect results to pass cross-checks.",
    mitigations: [
      "Cross-check selection is randomised by the oracle contract; colluding verifiers cannot control which verifier is assigned to cross-check their work.",
      "The on-chain dispute registry makes all attestation pairs auditable.",
      "Anomaly detection monitors for correlated failure patterns across verifiers.",
    ],
  },
  {
    riskId: "stake-threshold-gaming",
    title: "Minimum Stake Gaming",
    description:
      "Verifiers could stake just above the minimum threshold to satisfy the `under_staked` flag without genuine commitment.",
    mitigations: [
      "The `stake` factor is graduated (not binary); stake contributions scale up to 5× the minimum before reaching the maximum contribution.",
      "The governance model allows the approval threshold for the minimum stake parameter to be raised by the platform admin tenant.",
    ],
  },
];
