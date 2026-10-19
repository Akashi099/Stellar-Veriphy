# ADR-0009: Configurable compliance policy engine

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Core maintainers

## Context

Different content classes, creator types, and jurisdictions face materially
different regulatory requirements:

- EU AI Act mandates disclosure for AI-assisted content in certain categories.
- News media certified by non-journalists raises credibility concerns.
- Legal documents must not contain AI-generated content.
- Scientific data carrying AI assistance requires methodology disclosure.

Hard-coding these rules as `if/else` chains inside upload handlers would make
them invisible to governance review, impossible to version-control as policy
artifacts, and fragile to extend.

Closes #672.

## Options considered

1. **Hard-coded per-route validation** — fast to write, impossible to audit as
   a coherent policy, duplicated logic across routes.  Rejected.

2. **External policy service (e.g. OPA / Open Policy Agent)** — powerful,
   but adds an infrastructure dependency and significant operational overhead
   for a small team.  May be the right long-term direction.

3. **In-process data-driven rule engine** — rules are declared as a
   `PolicyRuleSet` (typed data, not control flow), evaluated by a pure
   `evaluatePolicy()` function, and versioned like any other source artifact.
   No new infrastructure; can be audited as code.  Chosen.

## Decision

1. Add `packages/shared/policy/index.ts` with:
   - `PolicyRule` — `predicate + effect + message + remediation`.
   - `PolicyRuleSet` — named, versioned collection of rules.
   - `evaluatePolicy()` — pure, synchronous evaluation engine.
     First `"blocked"` rule short-circuits; all `"restricted"` rules accumulate.
   - `defaultRuleSet` (v1.0.0) — baseline rules covering AI disclosure,
     news media segment restrictions, legal document AI block, EU AI Act
     alignment, and scientific data methodology disclosure.

2. Add `POST /api/policy/evaluate` — evaluates the default rule set against a
   `PolicyContext` submitted by the caller.  Used by the upload form before
   submitting a job so creators are informed of restrictions before they commit.

3. Governance process: any change to `defaultRuleSet` must:
   - Increment `PolicyRuleSet.version`.
   - Be proposed as a PR.
   - Be signed off by legal/governance reviewers before merging.
   - Have an updated entry in `docs/adr/` or `docs/legal/`.

## Consequences

- Policy logic is auditable as TypeScript source under `packages/shared/policy/`.
- The `evaluatePolicy` function is deterministic and side-effect free, making
  it trivially unit-testable.
- Custom rule sets can be layered on top of the default set by platform
  operators without modifying core code.
- When the team is ready to adopt OPA or a policy-as-code framework, the
  `PolicyRuleSet` schema maps cleanly onto Rego policies.

## Related

- `docs/features/compliance-policy.md` — feature documentation
- `packages/shared/policy/index.ts` — types, engine, default rules
- `frontend/app/api/policy/evaluate/route.ts` — REST endpoint
- `docs/legal/` — legal documentation that governs rule changes
- ADR-0008 — AI labeling that feeds `PolicyContext.aiLabel`
