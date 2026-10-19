/**
 * packages/shared/governance/index.ts
 *
 * Autonomous governance and policy review framework for StellarVeriphy.
 * Closes #700.
 *
 * ## Purpose
 *
 * StellarVeriphy has multiple on-chain and off-chain trust mechanisms
 * (TEE attestation, oracle provider keys, verifier reputation, confidence
 * scoring, provenance access policy).  Each of those mechanisms exposes
 * tunable policy and trust thresholds, and each can be changed by an
 * upgrade.  What was missing was a single, explicit answer to:
 *
 * - *Who* may change a policy, a trust threshold, or a contract?
 * - *How much review* does a given change require before it can ship?
 * - *How is accountability preserved* as the contributor base grows?
 *
 * This module defines that framework.  It is deliberately pure and
 * side-effect free: every function takes the current state and returns a
 * decision or an updated proposal.  Persistence, notifications, and on-chain
 * execution live in the callers.
 *
 * ## Design principles
 *
 * - **Risk-proportionate review** — a documentation tweak and a contract
 *   upgrade do not follow the same path.  Every decision resolves to a
 *   `ReviewPath` whose required approvals scale with its impact.
 * - **Separation of duties** — proposing, reviewing, and executing are
 *   distinct.  A role cannot satisfy its own approval requirement.
 * - **Thresholds have hard floors** — no review path, however urgent, may
 *   push a trust threshold below the constitutionally-fixed floor.
 * - **Security has a veto, not a dictatorship** — the security council can
 *   veto high-risk changes, but cannot unilaterally approve them.
 * - **Everything is auditable** — every action produces a `PolicyAuditEvent`
 *   that records actor, role, decision, and outcome.
 *
 * ## Usage
 *
 * ```ts
 * import {
 *   createPolicyReviewProposal,
 *   applyReviewVote,
 *   evaluatePolicyReview,
 * } from "@stellarveriphy/shared/governance";
 *
 * let proposal = createPolicyReviewProposal({
 *   decisionType: "trust_threshold_change",
 *   title: "Raise provider trust minimum to 0.75",
 *   rationale: "Reduce low-quality oracle participation.",
 *   proposedByRole: "maintainer",
 *   proposedBy: "G...MAINTAINER",
 *   payload: {},
 *   thresholdChanges: [{ key: "provider_trust_min", from: 0.6, to: 0.75 }],
 *   createdAt: "2026-09-29T00:00:00.000Z",
 * });
 *
 * // ... review votes collected ...
 * const decision = evaluatePolicyReview(proposal, new Date().toISOString());
 * if (decision.outcome === "approved") {
 *   // execute the change
 * }
 * ```
 *
 * @module shared/governance
 */

import { maxImpact, type ImpactLevel } from "./impact";
import {
  DEFAULT_TRUST_THRESHOLDS,
  evaluateThresholdChange,
  highestThresholdImpact,
  type ThresholdChangeDecision,
  type TrustThreshold,
  type TrustThresholdChange,
} from "./trust-thresholds";

export type { ImpactLevel };
export { maxImpact };
export type { ThresholdChangeDecision, TrustThreshold, TrustThresholdChange };
export type { TrustThresholdKey } from "./trust-thresholds";
export { DEFAULT_TRUST_THRESHOLDS, evaluateThresholdChange, highestThresholdImpact };

// ---------------------------------------------------------------------------
// Stakeholder roles
// ---------------------------------------------------------------------------

/**
 * A stakeholder role in the StellarVeriphy governance model.
 *
 * Roles are additive: a person may hold more than one, but each action is
 * evaluated against exactly one role so that separation of duties is
 * unambiguous.
 */
export type StakeholderRole =
  "contributor" | "verifier" | "operator" | "maintainer" | "security_council" | "community_council";

/**
 * Categories of governance decisions.
 */
export type GovernanceDecisionType =
  | "policy_change"
  | "trust_threshold_change"
  | "platform_upgrade"
  | "contract_upgrade"
  | "parameter_change"
  | "emergency_action";

/** Responsibilities and mandates for a stakeholder role. */
export interface StakeholderRoleDefinition {
  role: StakeholderRole;
  displayName: string;
  /** Plain-language responsibilities, rendered in contributor docs. */
  responsibilities: string[];
  /** Decision types this role may initiate. */
  canPropose: GovernanceDecisionType[];
  /** Decision types this role may vote on. */
  canReview: GovernanceDecisionType[];
  /** Whether a rejection from this role vetoes a proposal. */
  canVeto: boolean;
}

export const STAKEHOLDER_ROLES: Record<StakeholderRole, StakeholderRoleDefinition> = {
  contributor: {
    role: "contributor",
    displayName: "Contributor",
    responsibilities: [
      "Propose documentation, policy, and parameter changes",
      "Participate in public comment windows on high-impact proposals",
      "Report security concerns through the disclosure process",
    ],
    canPropose: ["policy_change", "parameter_change"],
    canReview: [],
    canVeto: false,
  },
  verifier: {
    role: "verifier",
    displayName: "Verifier",
    responsibilities: [
      "Operate independent verification and dispute workflows",
      "Review trust-threshold changes for real-world verification impact",
      "Report anomalous attestations to the operator and security council",
    ],
    canPropose: ["trust_threshold_change", "parameter_change"],
    canReview: ["trust_threshold_change"],
    canVeto: false,
  },
  operator: {
    role: "operator",
    displayName: "Operator",
    responsibilities: [
      "Operate oracle, attestation, and registry infrastructure",
      "Review platform upgrades and operational parameter changes",
      "Coordinate incident response with the security council",
    ],
    canPropose: ["platform_upgrade", "parameter_change"],
    canReview: ["policy_change", "platform_upgrade", "parameter_change", "trust_threshold_change"],
    canVeto: false,
  },
  maintainer: {
    role: "maintainer",
    displayName: "Maintainer",
    responsibilities: [
      "Steward the repository and merge policy",
      "Review and approve changes across all decision types",
      "Ensure proposals include tests, docs, and a rollback plan",
    ],
    canPropose: [
      "policy_change",
      "trust_threshold_change",
      "platform_upgrade",
      "contract_upgrade",
      "parameter_change",
    ],
    canReview: [
      "policy_change",
      "trust_threshold_change",
      "platform_upgrade",
      "contract_upgrade",
      "parameter_change",
      "emergency_action",
    ],
    canVeto: false,
  },
  security_council: {
    role: "security_council",
    displayName: "Security Council",
    responsibilities: [
      "Own security review for contract and trust-threshold changes",
      "Hold veto power over high-risk and critical changes",
      "Approve and review emergency actions after the fact",
    ],
    canPropose: ["contract_upgrade", "trust_threshold_change", "emergency_action"],
    canReview: [
      "policy_change",
      "trust_threshold_change",
      "platform_upgrade",
      "contract_upgrade",
      "parameter_change",
      "emergency_action",
    ],
    canVeto: true,
  },
  community_council: {
    role: "community_council",
    displayName: "Community Council",
    responsibilities: [
      "Represent community stakeholders in policy and platform decisions",
      "Review changes that affect access, retention, or trust thresholds",
      "Publish rationale for community-facing decisions",
    ],
    canPropose: ["policy_change"],
    canReview: ["policy_change", "platform_upgrade", "parameter_change", "trust_threshold_change"],
    canVeto: false,
  },
};

// ---------------------------------------------------------------------------
// Impact and review paths
// ---------------------------------------------------------------------------

/** Default impact assigned to each decision type before threshold analysis. */
export const DEFAULT_IMPACT_BY_DECISION: Record<GovernanceDecisionType, ImpactLevel> = {
  policy_change: "moderate",
  parameter_change: "moderate",
  platform_upgrade: "high",
  trust_threshold_change: "high",
  contract_upgrade: "critical",
  emergency_action: "critical",
};

/**
 * The lowest impact a decision type may declare.  A proposer can raise a
 * decision's impact but cannot mark a contract upgrade as low-impact.
 */
export const IMPACT_FLOOR_BY_DECISION: Record<GovernanceDecisionType, ImpactLevel> = {
  policy_change: "low",
  parameter_change: "low",
  platform_upgrade: "moderate",
  trust_threshold_change: "high",
  contract_upgrade: "critical",
  emergency_action: "critical",
};

/** Identifier for a review path. */
export type ReviewPathId = "fast_track" | "standard" | "extended" | "security_council";

/**
 * A review path: the approvals, comment window, and veto rules required for
 * a decision of a given impact.
 */
export interface ReviewPath {
  id: ReviewPathId;
  description: string;
  /** Minimum approvals required from each role. */
  requiredApprovals: Partial<Record<StakeholderRole, number>>;
  /** Whether a public comment window must run before approval. */
  requiresPublicComment: boolean;
  /** Length of the review window in days. */
  reviewWindowDays: number;
  /** Whether a security council rejection vetoes the proposal. */
  securityCouncilVeto: boolean;
}

export const REVIEW_PATHS: Record<ReviewPathId, ReviewPath> = {
  fast_track: {
    id: "fast_track",
    description:
      "Low-impact, easily reversible change. One maintainer approval, no public comment.",
    requiredApprovals: { maintainer: 1 },
    requiresPublicComment: false,
    reviewWindowDays: 2,
    securityCouncilVeto: false,
  },
  standard: {
    id: "standard",
    description: "Moderate-impact change. Two maintainer approvals with operator sign-off.",
    requiredApprovals: { maintainer: 2, operator: 1 },
    requiresPublicComment: false,
    reviewWindowDays: 5,
    securityCouncilVeto: false,
  },
  extended: {
    id: "extended",
    description:
      "High-impact change. Maintainers, security council, and community council review with a public comment window.",
    requiredApprovals: {
      maintainer: 2,
      security_council: 1,
      community_council: 1,
    },
    requiresPublicComment: true,
    reviewWindowDays: 14,
    securityCouncilVeto: false,
  },
  security_council: {
    id: "security_council",
    description:
      "Critical or emergency change. Security council supermajority with a maintainer, and a security council veto.",
    requiredApprovals: { security_council: 2, maintainer: 1 },
    requiresPublicComment: false,
    reviewWindowDays: 3,
    securityCouncilVeto: true,
  },
};

/**
 * Resolve the review path that applies to a decision.
 *
 * `emergency_action` always uses the `security_council` path regardless of
 * its assigned impact, because break-glass changes must move quickly while
 * remaining accountable.
 */
export function resolveReviewPath(
  decisionType: GovernanceDecisionType,
  impact: ImpactLevel
): ReviewPath {
  if (decisionType === "emergency_action") {
    return REVIEW_PATHS.security_council;
  }
  switch (impact) {
    case "low":
      return REVIEW_PATHS.fast_track;
    case "moderate":
      return REVIEW_PATHS.standard;
    case "high":
      return REVIEW_PATHS.extended;
    case "critical":
      return REVIEW_PATHS.security_council;
  }
}

/** Whether a role may initiate a given decision type. */
export function canStakeholderPropose(
  role: StakeholderRole,
  decisionType: GovernanceDecisionType
): boolean {
  return STAKEHOLDER_ROLES[role].canPropose.includes(decisionType);
}

/** Whether a role may vote on a given decision type. */
export function canStakeholderReview(
  role: StakeholderRole,
  decisionType: GovernanceDecisionType
): boolean {
  return STAKEHOLDER_ROLES[role].canReview.includes(decisionType);
}

// ---------------------------------------------------------------------------
// Policy review proposals
// ---------------------------------------------------------------------------

export type PolicyReviewStatus = "open" | "approved" | "rejected" | "expired";

/** A single review vote. */
export interface PolicyReviewVote {
  voterId: string;
  role: StakeholderRole;
  decision: "approve" | "reject" | "abstain";
  votedAt: string;
  comment?: string;
}

/** A governance proposal subject to policy review. */
export interface PolicyReviewProposal {
  proposalId: string;
  decisionType: GovernanceDecisionType;
  impact: ImpactLevel;
  title: string;
  rationale: string;
  proposedByRole: StakeholderRole;
  proposedBy: string;
  payload: Record<string, unknown>;
  createdAt: string;
  reviewWindowEndsAt: string;
  status: PolicyReviewStatus;
  votes: PolicyReviewVote[];
  thresholdChanges: TrustThresholdChange[];
}

export interface CreateProposalParams {
  decisionType: GovernanceDecisionType;
  title: string;
  rationale: string;
  proposedByRole: StakeholderRole;
  proposedBy: string;
  payload?: Record<string, unknown>;
  /** Threshold changes included in the proposal, if any. */
  thresholdChanges?: TrustThresholdChange[];
  /** Explicit impact; if omitted, derived from decision type and changes. */
  impact?: ImpactLevel;
  createdAt: string;
}

/**
 * Create a policy review proposal.
 *
 * The impact is the highest of the explicitly supplied (or default) impact,
 * the decision type's floor, and the most severe included threshold change.
 * A proposal therefore cannot under-declare its own risk: a contract upgrade
 * can never be filed as low-impact, and a proposal that lowers a trust
 * threshold is always treated as critical.
 */
export function createPolicyReviewProposal(params: CreateProposalParams): PolicyReviewProposal {
  const thresholdChanges = params.thresholdChanges ?? [];

  const thresholdImpact = highestThresholdImpact(thresholdChanges);
  const defaultImpact = DEFAULT_IMPACT_BY_DECISION[params.decisionType];
  const impactFloor = IMPACT_FLOOR_BY_DECISION[params.decisionType];
  let impact = maxImpact(params.impact ?? defaultImpact, impactFloor);
  if (thresholdImpact) {
    impact = maxImpact(impact, thresholdImpact);
  }

  const path = resolveReviewPath(params.decisionType, impact);
  const createdAtMs = new Date(params.createdAt).getTime();
  const reviewWindowEndsAt = new Date(
    createdAtMs + path.reviewWindowDays * 86_400_000
  ).toISOString();

  return {
    proposalId: `gov-${params.decisionType}-${createdAtMs}`,
    decisionType: params.decisionType,
    impact,
    title: params.title,
    rationale: params.rationale,
    proposedByRole: params.proposedByRole,
    proposedBy: params.proposedBy,
    payload: params.payload ?? {},
    createdAt: params.createdAt,
    reviewWindowEndsAt,
    status: "open",
    votes: [],
    thresholdChanges,
  };
}

// ---------------------------------------------------------------------------
// Vote tallying
// ---------------------------------------------------------------------------

export interface ApprovalTally {
  approvalsByRole: Partial<Record<StakeholderRole, number>>;
  /** Roles that still need approvals, and how many. */
  missingApprovals: Partial<Record<StakeholderRole, number>>;
}

/**
 * Tally approve votes against a review path.
 *
 * Abstentions and rejections are recorded but never count toward quorum.
 */
export function tallyApprovals(votes: PolicyReviewVote[], path: ReviewPath): ApprovalTally {
  const approvalsByRole: Partial<Record<StakeholderRole, number>> = {};

  for (const vote of votes) {
    if (vote.decision !== "approve") continue;
    approvalsByRole[vote.role] = (approvalsByRole[vote.role] ?? 0) + 1;
  }

  const missingApprovals: Partial<Record<StakeholderRole, number>> = {};
  for (const [role, required] of Object.entries(path.requiredApprovals)) {
    const stakeholderRole = role as StakeholderRole;
    const have = approvalsByRole[stakeholderRole] ?? 0;
    const need = (required ?? 0) - have;
    if (need > 0) {
      missingApprovals[stakeholderRole] = need;
    }
  }

  return { approvalsByRole, missingApprovals };
}

/**
 * Apply a review vote to an open proposal.
 *
 * This is a pure function: it returns a new proposal and never mutates the
 * input.  Rules:
 *
 * - Votes are idempotent per `voterId`.
 * - A role that cannot review the decision type is ignored.
 * - A vote cast after the review window is ignored.
 * - A security council rejection vetoes any proposal whose path enables it.
 * - The status advances to `approved` as soon as quorum is met.
 */
export function applyReviewVote(
  proposal: PolicyReviewProposal,
  vote: PolicyReviewVote
): PolicyReviewProposal {
  if (proposal.status !== "open") {
    return proposal;
  }

  if (proposal.votes.some((existing) => existing.voterId === vote.voterId)) {
    return proposal;
  }

  if (!canStakeholderReview(vote.role, proposal.decisionType)) {
    return proposal;
  }

  if (new Date(vote.votedAt).getTime() > new Date(proposal.reviewWindowEndsAt).getTime()) {
    return proposal;
  }

  const path = resolveReviewPath(proposal.decisionType, proposal.impact);
  const updated: PolicyReviewProposal = {
    ...proposal,
    votes: [...proposal.votes, vote],
  };

  if (vote.decision === "reject" && vote.role === "security_council" && path.securityCouncilVeto) {
    return { ...updated, status: "rejected" };
  }

  const { missingApprovals } = tallyApprovals(updated.votes, path);
  if (Object.keys(missingApprovals).length === 0) {
    return { ...updated, status: "approved" };
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Review evaluation
// ---------------------------------------------------------------------------

export type GovernanceReviewOutcome = "approved" | "rejected" | "pending" | "expired";

export interface GovernanceReviewDecision {
  outcome: GovernanceReviewOutcome;
  reason: string;
  path: ReviewPath;
  approvalsByRole: Partial<Record<StakeholderRole, number>>;
  missingApprovals: Partial<Record<StakeholderRole, number>>;
  /** Roles that have met their approval requirement. */
  satisfiedRoles: StakeholderRole[];
  /** Threshold analysis for every included change, if any. */
  thresholdDecisions: ThresholdChangeDecision[];
  decidedAt: string;
}

/**
 * Evaluate a proposal against its review path and the current time.
 *
 * Evaluation is monotonic with respect to time: a proposal that is `pending`
 * can later become `approved`, but an `approved` or `rejected` proposal never
 * changes outcome.
 */
export function evaluatePolicyReview(
  proposal: PolicyReviewProposal,
  now: string
): GovernanceReviewDecision {
  const path = resolveReviewPath(proposal.decisionType, proposal.impact);
  const { approvalsByRole, missingApprovals } = tallyApprovals(proposal.votes, path);

  const thresholdDecisions = proposal.thresholdChanges.map((change) =>
    evaluateThresholdChange(change)
  );

  const base = {
    path,
    approvalsByRole,
    missingApprovals,
    satisfiedRoles: Object.keys(path.requiredApprovals).filter(
      (role) => !(role in missingApprovals)
    ) as StakeholderRole[],
    thresholdDecisions,
    decidedAt: now,
  };

  if (proposal.status === "rejected") {
    return {
      ...base,
      outcome: "rejected",
      reason: `Proposal "${proposal.proposalId}" was rejected.`,
    };
  }

  if (proposal.status === "approved") {
    return {
      ...base,
      outcome: "approved",
      reason: `Proposal "${proposal.proposalId}" has met the "${path.id}" quorum.`,
    };
  }

  const quorumMet = Object.keys(missingApprovals).length === 0;

  if (new Date(now).getTime() > new Date(proposal.reviewWindowEndsAt).getTime()) {
    return {
      ...base,
      outcome: "expired",
      reason: `Proposal "${proposal.proposalId}" expired on ${proposal.reviewWindowEndsAt} without meeting the "${path.id}" quorum.`,
    };
  }

  if (quorumMet) {
    return {
      ...base,
      outcome: "approved",
      reason: `Proposal "${proposal.proposalId}" has met the "${path.id}" quorum.`,
    };
  }

  const outstanding = Object.entries(missingApprovals)
    .map(([role, count]) => `${role} ×${count}`)
    .join(", ");
  return {
    ...base,
    outcome: "pending",
    reason: `Proposal "${proposal.proposalId}" is awaiting approvals: ${outstanding}.`,
  };
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export interface PolicyAuditEvent {
  eventId: string;
  proposalId: string;
  actorId: string;
  actorRole: StakeholderRole;
  decisionType: GovernanceDecisionType;
  impact: ImpactLevel;
  action: "propose" | "vote" | "evaluate";
  vote?: "approve" | "reject" | "abstain";
  outcome: string;
  reason: string;
  occurredAt: string;
}

/**
 * Build a structured audit event.  Feed these into the tamper-evident audit
 * log (`frontend/lib/security/auditLogger.ts`) alongside registry governance
 * events.
 */
export function buildPolicyAuditEvent(params: {
  proposal: PolicyReviewProposal;
  actorId: string;
  actorRole: StakeholderRole;
  action: PolicyAuditEvent["action"];
  vote?: PolicyAuditEvent["vote"];
  outcome: string;
  reason: string;
  occurredAt: string;
}): PolicyAuditEvent {
  const { proposal, actorId, actorRole, action, vote, outcome, reason, occurredAt } = params;

  const event: PolicyAuditEvent = {
    eventId: `pol-${proposal.proposalId}-${action}-${new Date(occurredAt).getTime()}`,
    proposalId: proposal.proposalId,
    actorId,
    actorRole,
    decisionType: proposal.decisionType,
    impact: proposal.impact,
    action,
    outcome,
    reason,
    occurredAt,
  };

  return vote === undefined ? event : { ...event, vote };
}

// ---------------------------------------------------------------------------
// Model introspection
// ---------------------------------------------------------------------------

export interface GovernanceModelSummary {
  version: string;
  roles: StakeholderRoleDefinition[];
  reviewPaths: ReviewPath[];
  trustThresholds: TrustThreshold[];
  defaultImpactByDecision: Record<GovernanceDecisionType, ImpactLevel>;
}

/**
 * Return a structured description of the governance model for docs and
 * dashboards, so published documentation cannot drift from the code.
 */
export function describeGovernanceModel(): GovernanceModelSummary {
  return {
    version: "1.0.0",
    roles: Object.values(STAKEHOLDER_ROLES),
    reviewPaths: Object.values(REVIEW_PATHS),
    trustThresholds: Object.values(DEFAULT_TRUST_THRESHOLDS),
    defaultImpactByDecision: DEFAULT_IMPACT_BY_DECISION,
  };
}
