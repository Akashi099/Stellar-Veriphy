# ADR-0019: Autonomous Governance and Policy Review Framework

- **Status:** Accepted
- **Date:** 2026-09-29
- **Deciders:** Architecture, Security, Governance, Community

## Context

As StellarVeriphy grows from a single-team project into a network of
contributors, operators, verifiers, and community stakeholders, decisions
that change policy or trust thresholds were being reviewed inconsistently.
Some changes went through the multi-tenant registry governance model, some
through code review alone, and some through ad hoc maintainer judgement.

The result was three problems:

- **Unclear authority** — no single document said who could change a policy,
  a trust threshold, or a contract.
- **Inconsistent review depth** — a documentation change and a contract
  upgrade could receive the same (light) treatment.
- **Weak accountability** — approvals were not recorded in a structured,
  auditable way, so decisions could not be reconstructed later.

Existing building blocks covered parts of the problem but not the whole:
`packages/shared/registry-governance` governs _multi-tenant registry
entries_, and `contracts/registry` enforces on-chain admin checks. Neither
defines a general review path for policy decisions, trust thresholds, or
platform upgrades.

Alternatives considered:

- **Rely on maintainer judgement** — no overhead, but no documented
  authority, no risk-proportionate review, and no audit trail. Rejected.
- **On-chain governance for everything** — maximally transparent, but policy
  and platform decisions are off-chain and would incur latency and cost;
  also, most stakeholders are not on-chain actors. Rejected as the primary
  mechanism.
- **Off-chain, role-based, impact-proportionate framework with an on-chain
  fallback** — the chosen approach: pure, testable governance logic in
  `packages/shared/governance`, with established registry governance and
  on-chain enforcement unchanged below it.

## Decision

Implement `packages/shared/governance/index.ts` and
`packages/shared/governance/trust-thresholds.ts` — a framework that defines:

- `STAKEHOLDER_ROLES` — six roles (contributor, verifier, operator,
  maintainer, security council, community council) with documented
  responsibilities and a fixed propose/review mandate.
- `GovernanceDecisionType` and an impact model with per-type floors, so a
  decision cannot under-declare its own risk.
- `ReviewPath` (`fast_track`, `standard`, `extended`, `security_council`)
  with role-based quorums, public-comment windows, and security council veto
  rules; `resolveReviewPath` maps impact to path.
- `DEFAULT_TRUST_THRESHOLDS` with hard floors and ceilings, and
  `evaluateThresholdChange` which classifies changes and always requires
  critical review for a lowering change.
- `createPolicyReviewProposal`, `applyReviewVote`, and
  `evaluatePolicyReview` — pure proposal lifecycle functions.
- `buildPolicyAuditEvent` — a structured audit event for every action, and
  `describeGovernanceModel` — a machine-readable model summary for docs and
  dashboards.

## Consequences

- Every policy, threshold, platform, and contract decision now has an
  explicit authority and an impact-proportionate review path.
- Lowering a trust threshold or shipping a contract upgrade can never bypass
  broad review; contracts are pinned to critical impact.
- Accountability is structural: proposing, reviewing, and executing are
  separate duties, and the security council holds a veto rather than an
  approval monopoly.
- The framework is pure and off-chain. Persistence, notifications, and
  execution (registry governance, on-chain calls, deployments) remain the
  callers' responsibility; only the decision logic lives here.
- Role mandates and review paths are code, so changing them is itself a
  `policy_change` that follows the framework.
- `describeGovernanceModel()` must be kept in sync with published
  documentation; the documentation test suite guards the documented shape.
- The framework assumes proposals and votes are persisted by a durable store
  before evaluation; no persistence layer is provided here.
