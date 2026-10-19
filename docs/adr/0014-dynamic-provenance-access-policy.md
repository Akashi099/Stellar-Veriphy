# ADR-0014: Dynamic Policy Engine for Provenance Access Controls

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Security, Feature, Policy

## Context

Provenance certificates may contain sensitive metadata — legal documents,
medical records, government documents, financial records — whose access must
be governed by role, jurisdiction, and trust posture rather than a single
"public / private" flag.

The existing `permissionModel.ts` covers per-action role checks at a flat level
but does not support:

- Content-type-specific rules (e.g. legal documents require identity
  verification to read the full manifest).
- Jurisdiction-aware conditions (e.g. EU consumers see a GDPR notice).
- Trust-posture gating (e.g. only verifiers with a `high` trust score may read
  attestation evidence).
- Regulated content blocks (e.g. government documents are not readable by
  `consumer` role actors at all).

Hard-coding these distinctions as `if/else` blocks creates a maintenance
problem and makes rule changes risky.

Alternatives considered:

- **Attribute-based access control (ABAC) with a general-purpose engine** —
  powerful but heavyweight; introduces a complex query language and dependency.
- **Role-based access control (RBAC) only** — too coarse-grained for
  content-type and jurisdiction sensitivity.
- **Rule-list evaluation engine with predicate functions** — the chosen
  approach: consistent with the existing `policy/index.ts` compliance engine
  and easy to audit.

## Decision

Implement `packages/shared/access-policy/index.ts` — a rule-list evaluation
engine for provenance access-control decisions.

Key properties:

- **Pure evaluation** — `evaluateAccessPolicy` is a pure function; same inputs
  → same `AccessPolicyDecision`. No network calls, no side effects.
- **Ordered rule evaluation** — rules are evaluated in declaration order; the
  first `allow` or `deny` match terminates evaluation. `condition` rules
  accumulate notices without stopping.
- **Composable rule sets** — `AccessPolicyRuleSet` can be extended or replaced
  per deployment (e.g. a healthcare deployment can add additional `deny` rules
  for medical records).
- **Default deny** — if no `allow` rule matches, the decision is `denied` with
  `reason: "action_not_permitted"`, preventing accidental open access.
- **Audit trail** — every `AccessPolicyDecision` records the `appliedRuleId`,
  `policyVersion`, and `decidedAt` timestamp for compliance logging.

The `defaultAccessRuleSet` (v1.0.0) encodes:

- Hard blocks for revoked and locked resources.
- Admin override (bypasses all subsequent rules).
- Owner full access.
- Regulator and auditor read rights.
- Verifier trust-posture gating for attestation reads.
- Legal/medical/financial documents require identity verification for full
  manifest reads.
- EU GDPR access conditions for consumer reads.
- Consumer access restricted by content type (no government documents).
- Enterprise tenant read/export rights.

## Consequences

**Easier:**

- Adding a new jurisdiction, role, or content-type restriction is a one-rule
  addition to the rule list; the engine does not change.
- Rules are independently testable by passing mock `AccessPolicyContext`
  objects to `rule.predicate`.
- The policy version in every decision enables retrospective audit: if a policy
  changed between two events, the version field shows which rules applied when.

**Harder:**

- Callers must supply a fully populated `AccessPolicyContext`; partial contexts
  (missing `actor.identityVerified`, missing `resource.jurisdiction`) may
  bypass rules that check those fields. Callers should ensure all relevant
  fields are populated before calling `evaluateAccessPolicy`.
- The `defaultAccessRuleSet` encodes StellarVeriphy's current policy judgment
  for role/content-type/jurisdiction combinations; it is not a substitute for
  legal advice and should be reviewed by a qualified legal team before
  production use with regulated content.
- Condition accumulation (GDPR notices etc.) must be surfaced to the end user
  by the frontend; the engine only returns the condition strings.

Closes #684.
