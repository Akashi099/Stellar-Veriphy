# ADR-0018: Decentralised Verifier Reputation Network

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Architecture, Security, Governance

## Context

External verifiers participate in StellarVeriphy's oracle network by providing secondary attestations, cross-checking primary verifications, and participating in dispute resolution.  Without a reputation model, the system cannot:

- Prefer reliable verifiers for high-stakes jobs.
- Distinguish a verifier making early mistakes from one with a persistent pattern of bad behaviour.
- Provide transparent evidence for governance decisions (suspension, blacklisting).
- Deter collusion, score washing, and griefing through economic and reputational mechanisms.

The existing `packages/shared/scoring/providerTrust.ts` scores oracle *providers* (infrastructure layer).  External *verifiers* (network participants) have different signals: dispute votes, cross-check consistency, and dispute outcomes — not SLA metrics.

Alternatives considered:

- **Extend `providerTrust.ts` to cover verifiers** — would conflate two distinct trust hierarchies; different factors and recovery mechanics make separation cleaner.
- **Simple on-chain reputation counter** — insufficient resolution; cannot express degraded windows, Bayesian priors, or multi-factor scoring with explainable breakdowns.
- **Off-chain multi-factor scoring with typed factor breakdown** — the chosen approach: consistent with the provider trust model's design, pure function, explainable, and misuse-resistant by design.

## Decision

Implement `packages/shared/verifier-reputation/index.ts` — a multi-factor reputation scoring system for external verifiers that:

- Computes a composite 0–100 score from seven weighted factors (success rate, fault dispute rate, exoneration rate, cross-check consistency, response time, stake, recency).
- Applies a Bayesian prior for low-history verifiers to prevent extreme early scores.
- Expresses temporary degradation as a timed window (`degradedUntil`) with automatic expiry, distinct from permanent suspension/blacklisting.
- Integrates dispute outcomes via `applyDisputeOutcome`, which applies degradation windows proportional to fault severity.
- Documents four known misuse risks (`REPUTATION_RISKS`) with mitigations as structured data.
- Provides `summariseReputationNetwork` for governance dashboards.

## Consequences

- Temporary degradation allows good-faith recovery without permanent exclusion; persistent mistrust (suspension, blacklist) requires explicit operator action.
- The Bayesian prior limits score gaming via cheap verifications; the stake factor raises the economic cost.
- All score computations are deterministic and testable (pure functions).
- The reputation model operates off-chain; on-chain enforcement relies on `contracts/oracle` suspension and blacklist mechanisms.  The two layers must be kept consistent.
- Dispute outcome integration assumes dispute records are available off-chain (e.g. indexed from on-chain events); the indexing mechanism is out of scope for this module.
- Weights and thresholds are configurable via `ReputationScoreConfig`; changing defaults requires a governance decision and documentation update.
