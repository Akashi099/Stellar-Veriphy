import { describe, expect, it } from "vitest";

import {
  applyReviewVote,
  buildPolicyAuditEvent,
  canStakeholderPropose,
  canStakeholderReview,
  createPolicyReviewProposal,
  describeGovernanceModel,
  evaluatePolicyReview,
  evaluateThresholdChange,
  highestThresholdImpact,
  IMPACT_FLOOR_BY_DECISION,
  maxImpact,
  resolveReviewPath,
  REVIEW_PATHS,
  STAKEHOLDER_ROLES,
  tallyApprovals,
  type PolicyReviewProposal,
  type PolicyReviewVote,
  type StakeholderRole,
  type TrustThresholdChange,
} from "../governance";

const T0 = "2026-09-29T00:00:00.000Z";

function makeProposal(
  overrides: Partial<Parameters<typeof createPolicyReviewProposal>[0]> = {}
): PolicyReviewProposal {
  return createPolicyReviewProposal({
    decisionType: "policy_change",
    title: "Test proposal",
    rationale: "Because tests.",
    proposedByRole: "maintainer",
    proposedBy: "G...PROPOSER",
    createdAt: T0,
    ...overrides,
  });
}

function vote(
  voterId: string,
  role: StakeholderRole,
  decision: PolicyReviewVote["decision"] = "approve",
  votedAt = T0
): PolicyReviewVote {
  return { voterId, role, decision, votedAt };
}

describe("impact", () => {
  it("returns the higher of two impact levels", () => {
    expect(maxImpact("low", "critical")).toBe("critical");
    expect(maxImpact("high", "moderate")).toBe("high");
    expect(maxImpact("moderate", "moderate")).toBe("moderate");
  });
});

describe("stakeholder roles", () => {
  it("documents a responsibility statement for every role", () => {
    for (const role of Object.values(STAKEHOLDER_ROLES)) {
      expect(role.displayName.length).toBeGreaterThan(0);
      expect(role.responsibilities.length).toBeGreaterThan(0);
    }
  });

  it("enforces separation of duties: contributors cannot review", () => {
    expect(canStakeholderPropose("contributor", "policy_change")).toBe(true);
    expect(canStakeholderReview("contributor", "policy_change")).toBe(false);
  });

  it("restricts contract upgrades to maintainers and the security council", () => {
    expect(canStakeholderPropose("operator", "contract_upgrade")).toBe(false);
    expect(canStakeholderPropose("maintainer", "contract_upgrade")).toBe(true);
    expect(canStakeholderPropose("security_council", "contract_upgrade")).toBe(true);
  });

  it("grants veto power only to the security council", () => {
    const vetoRoles = Object.values(STAKEHOLDER_ROLES).filter((role) => role.canVeto);
    expect(vetoRoles).toHaveLength(1);
    expect(vetoRoles[0]?.role).toBe("security_council");
  });
});

describe("resolveReviewPath", () => {
  it("scales the review path with impact", () => {
    expect(resolveReviewPath("policy_change", "low").id).toBe("fast_track");
    expect(resolveReviewPath("policy_change", "moderate").id).toBe("standard");
    expect(resolveReviewPath("policy_change", "high").id).toBe("extended");
    expect(resolveReviewPath("policy_change", "critical").id).toBe("security_council");
  });

  it("always routes emergency actions to the security council path", () => {
    expect(resolveReviewPath("emergency_action", "low").id).toBe("security_council");
    expect(resolveReviewPath("emergency_action", "critical").id).toBe("security_council");
  });

  it("requires public comment only for high-impact changes", () => {
    expect(REVIEW_PATHS.fast_track.requiresPublicComment).toBe(false);
    expect(REVIEW_PATHS.extended.requiresPublicComment).toBe(true);
  });
});

describe("trust thresholds", () => {
  it("rejects a change below the hard floor", () => {
    const decision = evaluateThresholdChange({
      key: "provider_trust_min",
      from: 0.6,
      to: 0.2,
    });
    expect(decision.outcome).toBe("below_floor");
  });

  it("rejects a change above the ceiling", () => {
    const decision = evaluateThresholdChange({
      key: "provider_trust_min",
      from: 0.6,
      to: 1.5,
    });
    expect(decision.outcome).toBe("above_ceiling");
  });

  it("treats lowering a threshold as critical review", () => {
    const decision = evaluateThresholdChange({
      key: "provider_trust_min",
      from: 0.8,
      to: 0.6,
    });
    expect(decision.outcome).toBe("requires_elevated_review");
    expect(decision.minimumImpact).toBe("critical");
  });

  it("allows raising a threshold at or above its declared minimum impact", () => {
    const decision = evaluateThresholdChange({
      key: "reputation_quorum",
      from: 2,
      to: 3,
    });
    expect(decision.outcome).toBe("allowed");
    expect(decision.minimumImpact).toBe("moderate");
  });

  it("reports no_change for an identical value", () => {
    const decision = evaluateThresholdChange({
      key: "reputation_quorum",
      from: 2,
      to: 2,
    });
    expect(decision.outcome).toBe("no_change");
  });

  it("computes the highest impact across multiple changes", () => {
    const changes: TrustThresholdChange[] = [
      { key: "reputation_quorum", from: 2, to: 3 },
      { key: "provider_trust_min", from: 0.8, to: 0.6 },
    ];
    expect(highestThresholdImpact(changes)).toBe("critical");
    expect(highestThresholdImpact([])).toBeUndefined();
  });
});

describe("createPolicyReviewProposal", () => {
  it("defaults impact from the decision type", () => {
    expect(makeProposal({ decisionType: "platform_upgrade" }).impact).toBe("high");
    expect(makeProposal({ decisionType: "contract_upgrade" }).impact).toBe("critical");
  });

  it("prevents a contract upgrade from being filed as low impact", () => {
    const proposal = makeProposal({
      decisionType: "contract_upgrade",
      impact: "low",
    });
    expect(proposal.impact).toBe("critical");
    expect(IMPACT_FLOOR_BY_DECISION.contract_upgrade).toBe("critical");
  });

  it("elevates impact when a threshold is lowered", () => {
    const proposal = makeProposal({
      decisionType: "trust_threshold_change",
      thresholdChanges: [{ key: "attestation_confidence_min", from: 0.8, to: 0.6 }],
    });
    expect(proposal.impact).toBe("critical");
    expect(resolveReviewPath(proposal.decisionType, proposal.impact).id).toBe("security_council");
  });

  it("sets the review window from the resolved path", () => {
    const proposal = makeProposal({ decisionType: "policy_change", impact: "low" });
    expect(proposal.impact).toBe("low");
    const days =
      (new Date(proposal.reviewWindowEndsAt).getTime() - new Date(proposal.createdAt).getTime()) /
      86_400_000;
    expect(days).toBe(REVIEW_PATHS.fast_track.reviewWindowDays);
  });
});

describe("voting and tallying", () => {
  it("counts approvals by role and reports missing approvals", () => {
    const proposal = makeProposal({ decisionType: "policy_change" });
    const path = resolveReviewPath(proposal.decisionType, proposal.impact);
    const tally = tallyApprovals(
      [vote("m1", "maintainer"), vote("o1", "operator", "abstain")],
      path
    );
    expect(tally.approvalsByRole.maintainer).toBe(1);
    expect(tally.missingApprovals.maintainer).toBe(1);
    expect(tally.missingApprovals.operator).toBe(1);
  });

  it("is idempotent per voter", () => {
    const proposal = makeProposal();
    const once = applyReviewVote(proposal, vote("m1", "maintainer"));
    const twice = applyReviewVote(once, vote("m1", "maintainer"));
    expect(twice.votes).toHaveLength(1);
  });

  it("ignores a vote cast after the review window", () => {
    const proposal = makeProposal({ decisionType: "policy_change" });
    const late = new Date(new Date(proposal.reviewWindowEndsAt).getTime() + 1000).toISOString();
    const result = applyReviewVote(proposal, vote("m1", "maintainer", "approve", late));
    expect(result.votes).toHaveLength(0);
    expect(result.status).toBe("open");
  });

  it("ignores a role that cannot review the decision type", () => {
    const proposal = makeProposal();
    const result = applyReviewVote(proposal, vote("c1", "contributor"));
    expect(result.votes).toHaveLength(0);
    expect(result.status).toBe("open");
  });

  it("approves as soon as quorum is met", () => {
    let proposal = makeProposal({ decisionType: "policy_change" });
    proposal = applyReviewVote(proposal, vote("m1", "maintainer"));
    proposal = applyReviewVote(proposal, vote("m2", "maintainer"));
    proposal = applyReviewVote(proposal, vote("o1", "operator"));
    expect(proposal.status).toBe("approved");
  });

  it("does not reject on a non-veto rejection", () => {
    const proposal = makeProposal({ decisionType: "policy_change" });
    const result = applyReviewVote(proposal, vote("o1", "operator", "reject"));
    expect(result.status).toBe("open");
    expect(result.votes).toHaveLength(1);
  });

  it("lets the security council veto a critical proposal", () => {
    const proposal = makeProposal({
      decisionType: "contract_upgrade",
      impact: "critical",
    });
    const result = applyReviewVote(proposal, vote("sc1", "security_council", "reject"));
    expect(result.status).toBe("rejected");
  });
});

describe("evaluatePolicyReview", () => {
  it("reports pending with the outstanding approvals", () => {
    const proposal = makeProposal({ decisionType: "policy_change" });
    const decision = evaluatePolicyReview(proposal, T0);
    expect(decision.outcome).toBe("pending");
    expect(decision.missingApprovals.maintainer).toBe(2);
    expect(decision.reason).toContain("maintainer");
  });

  it("reports approved once quorum is met", () => {
    let proposal = makeProposal({ decisionType: "policy_change" });
    proposal = applyReviewVote(proposal, vote("m1", "maintainer"));
    proposal = applyReviewVote(proposal, vote("m2", "maintainer"));
    proposal = applyReviewVote(proposal, vote("o1", "operator"));
    const decision = evaluatePolicyReview(proposal, T0);
    expect(decision.outcome).toBe("approved");
    expect(decision.missingApprovals).toEqual({});
    expect(decision.satisfiedRoles).toEqual(expect.arrayContaining(["maintainer", "operator"]));
  });

  it("reports expired after the review window with quorum unmet", () => {
    const proposal = makeProposal({ decisionType: "policy_change" });
    const after = new Date(new Date(proposal.reviewWindowEndsAt).getTime() + 1000).toISOString();
    const decision = evaluatePolicyReview(proposal, after);
    expect(decision.outcome).toBe("expired");
  });

  it("reports rejected for a vetoed proposal", () => {
    let proposal = makeProposal({
      decisionType: "contract_upgrade",
      impact: "critical",
    });
    proposal = applyReviewVote(proposal, vote("sc1", "security_council", "reject"));
    const decision = evaluatePolicyReview(proposal, T0);
    expect(decision.outcome).toBe("rejected");
  });

  it("includes threshold analysis for included changes", () => {
    const proposal = makeProposal({
      decisionType: "trust_threshold_change",
      thresholdChanges: [{ key: "provider_trust_min", from: 0.6, to: 0.75 }],
    });
    const decision = evaluatePolicyReview(proposal, T0);
    expect(decision.thresholdDecisions).toHaveLength(1);
    expect(decision.thresholdDecisions[0]?.outcome).toBe("allowed");
  });
});

describe("audit events", () => {
  it("produces a structured, traceable event", () => {
    const proposal = makeProposal();
    const event = buildPolicyAuditEvent({
      proposal,
      actorId: "G...ACTOR",
      actorRole: "maintainer",
      action: "vote",
      vote: "approve",
      outcome: "open",
      reason: "Approved.",
      occurredAt: T0,
    });
    expect(event.proposalId).toBe(proposal.proposalId);
    expect(event.decisionType).toBe(proposal.decisionType);
    expect(event.action).toBe("vote");
    expect(event.vote).toBe("approve");
  });
});

describe("describeGovernanceModel", () => {
  it("exposes the full model for documentation and dashboards", () => {
    const model = describeGovernanceModel();
    expect(model.version).toBe("1.0.0");
    expect(model.roles).toHaveLength(6);
    expect(model.reviewPaths).toHaveLength(4);
    expect(model.trustThresholds.length).toBeGreaterThanOrEqual(5);
  });
});
