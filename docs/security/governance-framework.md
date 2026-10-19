# Autonomous Governance and Policy Review Framework

> **Related issue:** Closes #700  
> **See also:** `packages/shared/governance/index.ts`, `packages/shared/governance/trust-thresholds.ts`, `packages/shared/registry-governance/index.ts`, `docs/adr/0019-autonomous-governance-framework.md`

---

## Overview

StellarVeriphy has several trust mechanisms that can be tuned or upgraded:
TEE attestation, oracle provider keys, verifier reputation, confidence
scoring, and provenance access policy. Each exposes parameters that change
how the platform behaves, and each has historically been changed through ad
hoc review.

This document defines the **autonomous governance and policy review
framework**: a single, explicit process that answers three questions for
every policy decision, trust threshold change, and platform upgrade:

1. **Who** may propose, review, and approve the change?
2. **How much review** does the change require before it can ship?
3. **How is accountability preserved** as contributors, operators, and the
   community grow?

The framework is implemented as pure, testable logic in
`packages/shared/governance/index.ts`. It does not replace the multi-tenant
registry governance model (see
[`registry-governance.md`](./registry-governance.md)); it sits above it and
decides _whether and how_ a change is reviewed before registry governance or
on-chain execution ever runs.

---

## Design goals

| Goal                                             | How achieved                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Policy review exists for major decisions         | Every change maps to a `GovernanceDecisionType` and a `ReviewPath` with a defined quorum                             |
| Roles and responsibilities are documented        | `STAKEHOLDER_ROLES` declares each role's responsibilities, what it may propose, and what it may review               |
| Trust thresholds have a review path              | Threshold changes resolve to an impact level, and lowering a threshold always requires critical review               |
| Platform decisions are reviewable                | Platform and contract upgrades carry an impact floor that cannot be under-declared                                   |
| Sustainable growth without losing accountability | Review requirements are role-based and scale with impact; every action emits a `PolicyAuditEvent`                    |
| No single party can act alone                    | Proposing, reviewing, and executing are separate duties; the security council holds a veto, not an approval monopoly |

---

## Stakeholder roles and responsibilities

The model defines six roles. A person may hold more than one role, but each
action is evaluated against exactly one role so that separation of duties is
unambiguous. The permission matrix is declared in `STAKEHOLDER_ROLES`.

| Role                  | Responsibilities                                                                                                         | May propose                                  | May review                                           | Veto    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------- | ------- |
| **Contributor**       | Propose documentation, policy, and parameter changes; participate in public comment; report security concerns            | Policy, parameter                            | —                                                    | No      |
| **Verifier**          | Operate independent verification and dispute workflows; review trust-threshold changes; report anomalies                 | Trust threshold, parameter                   | Trust threshold                                      | No      |
| **Operator**          | Operate oracle, attestation, and registry infrastructure; review platform upgrades; coordinate incidents                 | Platform upgrade, parameter                  | Policy, platform upgrade, parameter, trust threshold | No      |
| **Maintainer**        | Steward the repository and merge policy; review and approve changes across decision types                                | All except emergency                         | All decision types                                   | No      |
| **Security Council**  | Own security review for contract and trust-threshold changes; hold veto over high-risk changes; review emergency actions | Contract upgrade, trust threshold, emergency | All decision types                                   | **Yes** |
| **Community Council** | Represent community stakeholders; review changes affecting access, retention, or trust                                   | Policy                                       | Policy, platform upgrade, parameter, trust threshold | No      |

### Separation of duties

- A role cannot satisfy the approval requirement of the same proposal it
  authored where the review path requires an independent approver — review
  quorums are defined per role, and the `tallyApprovals` function counts
  approvals by the approver's role.
- The proposer's role is recorded (`proposedByRole`) and auditable.
- The security council can **veto** critical changes but cannot approve them
  alone; the security council path still requires a maintainer.

---

## Decision types and impact

Every proposal declares a `GovernanceDecisionType`. Each type has a default
impact and a **floor** — the lowest impact it may declare. A proposer can
raise the impact of a decision but cannot under-declare it.

| Decision type            | Default impact | Impact floor | Examples                                      |
| ------------------------ | -------------- | ------------ | --------------------------------------------- |
| `policy_change`          | Moderate       | Low          | Compliance, retention, or access policy       |
| `parameter_change`       | Moderate       | Low          | Operational tuning that does not affect trust |
| `platform_upgrade`       | High           | Moderate     | Frontend or backend release                   |
| `trust_threshold_change` | High           | High         | Provider trust, confidence, or quorum changes |
| `contract_upgrade`       | Critical       | Critical     | Soroban contract redeploy / ID rotation       |
| `emergency_action`       | Critical       | Critical     | Break-glass response to an active incident    |

A proposal's final impact is the highest of: the impact supplied by the
proposer (or the type default), the type's floor, and the impact implied by
any included trust-threshold changes. This guarantees that a contract
upgrade can never be filed as low-impact and that a proposal lowering a
trust threshold is always treated as critical.

---

## Review paths

A `ReviewPath` defines the quorum, comment window, and veto behaviour for an
impact level. `resolveReviewPath` maps `(decisionType, impact)` to a path;
`emergency_action` always uses the security council path regardless of
declared impact.

| Path               | Applicable impact    | Required approvals                                     | Public comment | Window  | Security council veto |
| ------------------ | -------------------- | ------------------------------------------------------ | -------------- | ------- | --------------------- |
| `fast_track`       | Low                  | 1 maintainer                                           | No             | 2 days  | No                    |
| `standard`         | Moderate             | 2 maintainers, 1 operator                              | No             | 5 days  | No                    |
| `extended`         | High                 | 2 maintainers, 1 security council, 1 community council | Yes            | 14 days | No                    |
| `security_council` | Critical / emergency | 2 security council, 1 maintainer                       | No             | 3 days  | Yes                   |

### Lifecycle

```
proposal created (impact resolved)
        ↓
      open ──────────────────────────────┐
        │                                │
   review votes collected                │
        │                                │
   quorum met → approved            window elapses → expired
        │
   (execute: registry governance / on-chain / deploy)
        │
     executed

   security council reject on a veto-enabled path → rejected
```

`evaluatePolicyReview` is a pure function of the proposal and the current
time. It reports `approved`, `pending`, `expired`, or `rejected`, and lists
the outstanding approvals per role.

---

## Trust thresholds

Trust thresholds are the tunable numbers that define how much trust the
network requires. Each threshold has a **hard floor** and **ceiling**; no
review path — however urgent — can push a value outside those bounds.
`evaluateThresholdChange` classifies every proposed change.

| Threshold                    | Current | Floor | Ceiling | Minimum review on change |
| ---------------------------- | ------- | ----- | ------- | ------------------------ |
| `provider_trust_min`         | 0.60    | 0.50  | 0.95    | High                     |
| `attestation_confidence_min` | 0.70    | 0.50  | 0.99    | Moderate                 |
| `reputation_quorum`          | 2       | 1     | 10      | Moderate                 |
| `dispute_evidence_min`       | 0.40    | 0.30  | 0.90    | Moderate                 |
| `oracle_agreement_min`       | 0.66    | 0.51  | 1.00    | High                     |

### Threshold change rules

- **Below floor / above ceiling** → rejected outright; cannot be approved
  under any path.
- **Lowering a threshold** → `requires_elevated_review`; always critical,
  because it weakens a security guarantee.
- **Raising a threshold** → allowed at or above the threshold's declared
  minimum impact, because it can restrict participation.
- **No change** → no review required.

A proposal containing one or more threshold changes cannot declare an impact
lower than the highest change's required impact.

---

## Emergency actions

Emergency actions (`emergency_action`) bypass the normal proposal lead time
but remain accountable:

- They always use the `security_council` review path (2 security council +
  1 maintainer, 3-day window).
- The security council holds a veto, and its own two approvals are required.
- Every emergency action produces a `PolicyAuditEvent` for retrospective
  review, mirroring the emergency revocation model in
  [`registry-governance.md`](./registry-governance.md#emergency-operations).

---

## Accountability and audit trail

Every governance action — proposing, voting, or evaluating — produces a
`PolicyAuditEvent` via `buildPolicyAuditEvent`. Each event records:

- the proposal ID, decision type, and impact;
- the actor and their role;
- the action and (for votes) the vote cast;
- the outcome and a human-readable reason;
- an ISO-8601 timestamp.

Feed these events into the tamper-evident audit log
(`frontend/lib/security/auditLogger.ts`) alongside registry governance events
so that a reviewer can reconstruct any decision from proposal to execution.

---

## Sustainable growth

The framework is designed to absorb growth without weakening guarantees:

- **Additive roles** — adding a new stakeholder role or widening a role's
  mandate is a `policy_change` reviewed through the normal path.
- **Impact-proportionate cost** — trivial changes use `fast_track`; only
  high and critical changes demand broad review, so review capacity is spent
  where risk is highest.
- **Documented mandate** — a role's powers come from `STAKEHOLDER_ROLES`, and
  `describeGovernanceModel()` exposes the full model as structured data so
  published docs and dashboards cannot drift from the code.
- **No accountability removal** — even the fastest path requires an approval
  by a role distinct from the proposer, and every action is audited.

---

## Operational guide

### Raising a policy or parameter change

1. Pick the `decisionType` and write a rationale.
2. Call `createPolicyReviewProposal({ decisionType, title, rationale, proposedByRole, proposedBy, ... })`.
3. Collect review votes with `applyReviewVote` until quorum is met.
4. Call `evaluatePolicyReview` and only execute when the outcome is
   `approved`.

### Changing a trust threshold

1. Include the change(s) in `thresholdChanges` when creating the proposal.
2. The framework automatically raises the proposal's impact to at least the
   highest threshold's required review level.
3. A change below the floor or above the ceiling is rejected by
   `evaluateThresholdChange` and must not be executed.

### Handling an emergency

1. Create an `emergency_action` proposal; it routes to the security council
   path automatically.
2. Obtain two security council approvals and one maintainer approval.
3. Record the audit event and publish a retrospective.

### Adding a new trust threshold

1. Add the key, value, floor, ceiling, and `minimumImpactOnChange` to
   `DEFAULT_TRUST_THRESHOLDS`.
2. Add a test covering floor, ceiling, raising, and lowering behaviour.
3. Document it in the table above — `describeGovernanceModel()` will include
   it automatically.

---

## References

- `packages/shared/governance/index.ts` — roles, review paths, proposals, evaluation, audit events
- `packages/shared/governance/trust-thresholds.ts` — threshold registry and change evaluation
- `packages/shared/governance/impact.ts` — impact levels and comparison
- `packages/shared/tests/governance.test.ts` — test suite
- `packages/shared/registry-governance/index.ts` — multi-tenant registry governance
- `packages/shared/key-lifecycle/index.ts` — key rotation and emergency revocation
- `docs/security/registry-governance.md` — registry governance model
- `docs/adr/0019-autonomous-governance-framework.md` — decision record
- `CONTRIBUTING.md` — contribution and review process
