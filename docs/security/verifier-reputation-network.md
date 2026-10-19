# Decentralised Verifier Reputation Network

> **Related issue:** Closes #676  
> **See also:** `packages/shared/verifier-reputation/index.ts`, `packages/shared/scoring/providerTrust.ts`, `contracts/oracle/src/lib.rs`

---

## Overview

This document describes the reputational scoring model for external verifiers — the oracle actors who participate in content verification and secondary attestation tasks within StellarVeriphy.

The model is implemented in `packages/shared/verifier-reputation/index.ts` and is designed to be:

- **Evidence-based** — driven by on-chain outcomes, dispute records, and cross-check consistency.
- **Differentiating** — distinguishes temporary degradation (recoverable) from persistent mistrust (exclusion).
- **Transparent** — every score includes an explainable factor breakdown.
- **Misuse-resistant** — documented risks and guardrails (see below).

---

## Relationship to `providerTrust.ts`

| Aspect | `providerTrust.ts` | `verifierReputation/index.ts` |
|---|---|---|
| Who is scored | Oracle *providers* (infrastructure) | External *verifiers* (network participants) |
| SLA metrics | Yes (`uptimePercent`, `avgResponseTimeSeconds`) | No |
| Dispute votes | No | Yes (`disputesFault`, `disputesExonerated`) |
| Recovery mechanism | Suspension / unsuspension events | `degradedUntil` window with automatic expiry |
| Cross-check signal | No | `crossCheckAgreements` / `crossCheckTotal` |

Both models feed into the overall trust posture of the network.

---

## Reputation factors

`scoreVerifier` computes a composite score (0–100) from seven factors:

| Factor | Key | Weight (default) | Description |
|---|---|---|---|
| Success Rate | `success_rate` | 30 | Ratio of verifications reaching `minted` with no subsequent dispute |
| Fault Dispute Rate | `fault_dispute_rate` | 25 | Inverted fault rate; lower faults → higher score |
| Exoneration Rate | `exoneration_rate` | 10 | Disputes where the verifier was found not at fault |
| Cross-Check Consistency | `cross_check_consistency` | 15 | Agreement rate in secondary verification reviews |
| Response Time | `response_time` | 5 | Median response time vs. target |
| Stake | `stake` | 10 | Economic commitment; graduated up to 5× the minimum stake |
| Recency | `recency` | 5 | Penalises inactivity over 30 days |

Weights are configurable via `ReputationScoreConfig`; the defaults are declared in `DEFAULT_REPUTATION_CONFIG`.

### Bayesian prior

For verifiers with fewer than `minHistoryForFullWeight` verifications (default: 20), a Bayesian prior (`priorSuccessRate = 0.75`) is blended in proportionally.  This prevents new verifiers from receiving artificially extreme scores from a small sample.

---

## Reputation tiers

| Tier | Score range | Interpretation |
|---|---|---|
| `elite` | 85–100 | Top-tier; preferred for high-stakes jobs |
| `trusted` | 65–84 | Reliable; normal selection priority |
| `neutral` | 45–64 | Acceptable; used when better verifiers unavailable |
| `degraded` | 25–44 | Temporary penalty window active |
| `untrusted` | 0–24 | Avoid; suspend if persistent |

Verifiers with `score < exclusionThreshold` (default: 25) have `excluded = true` and are not selected for new verification tasks.

---

## Risk flags

| Flag | Condition |
|---|---|
| `blacklisted` | `VerifierRecord.status === "blacklisted"` |
| `suspended` | `VerifierRecord.status === "suspended"` |
| `no_history` | Zero verifications on record |
| `high_fault_rate` | Fault rate > `highFaultRateThreshold` (default: 10%) |
| `open_disputes` | One or more unresolved disputes |
| `under_staked` | Stake below `minStakeStroops` (default: 10 XLM) |
| `inactive` | No activity in the last `inactivityDays` (default: 30) |
| `degraded_window_active` | Currently inside a degraded window |
| `cross_check_inconsistency` | Cross-check agreement below 70% with ≥5 samples |

---

## Temporary degradation vs. persistent mistrust

### Temporary degradation

A verifier enters a degraded window when a `DegradationEvent` is applied via `applyDegradation`.  During the window:

- The composite score is multiplied by 0.65 (35% penalty).
- The `degraded_window_active` flag is set.
- The verifier may still be selected for tasks but at lower priority.

The window expires automatically: `expireDegradationIfDue` resets `status` to `"active"` once `degradedUntil` has passed.  This allows verifiers to recover from early mistakes without permanent exclusion.

### Degradation triggers

| Reason code | Condition |
|---|---|
| `dispute_fault` | Found at fault in a resolved dispute |
| `attestation_inconsistency` | Cross-check disagreement above threshold |
| `sla_breach` | Response time or availability below target |
| `suspicious_pattern` | Anomaly detection flagged activity |
| `manual_override` | Platform admin decision |

### Persistent mistrust (suspension / blacklist)

Suspension and blacklisting are applied by the oracle contract admin or governance system and result in `excluded = true` immediately:

- **Suspended** — temporary; operator must explicitly unsuspend.  Used for investigation windows.
- **Blacklisted** — permanent; historical verifications remain on-chain but no new tasks are assigned.

These states are not reversible by score recovery alone; they require explicit operator action.

---

## Dispute outcome integration

`applyDisputeOutcome` accepts a resolved `DisputeOutcome` and:

1. If `outcome === "verifier_fault"`, applies a degradation window of `degradationWindowDays` via `applyDegradation`.
2. Returns the updated `VerifierRecord` and a `DegradationEvent` for the audit log.
3. For all other outcomes (`challenger_fault`, `no_fault`, `dismissed`), the record is unchanged.

This ensures dispute signals flow directly into the reputation model without requiring manual intervention.

---

## Network-level summary

`summariseReputationNetwork` computes aggregate statistics for operator dashboards:

- Total verifiers by tier.
- Number of excluded verifiers.
- Average score across non-excluded verifiers.

Use this for governance reporting and to identify when the network's overall trust posture is degrading.

---

## Known risks and guardrails

The following risks are documented as structured `ReputationRisk` records in `REPUTATION_RISKS`:

| Risk | Key mitigations |
|---|---|
| **Score washing** (cheap verifications inflating score) | Bayesian prior limits early score; stake factor raises cost; cross-check consistency is hard to game |
| **Dispute griefing** (spurious disputes against good verifiers) | Challenger stake required; exoneration rate rewards good verifiers; admin override escalation path |
| **Verifier collusion** (coordinated incorrect results) | Randomised cross-check selection; all attestation pairs are on-chain auditable; anomaly detection |
| **Stake threshold gaming** (staking just above minimum) | Graduated stake factor (5× maximum); governance can raise minimum |

Full descriptions and mitigations are in `packages/shared/verifier-reputation/index.ts — REPUTATION_RISKS`.

---

## References

- `packages/shared/verifier-reputation/index.ts` — implementation
- `packages/shared/scoring/providerTrust.ts` — oracle provider trust model
- `contracts/oracle/src/lib.rs` — on-chain provider registration and dispute registry
- `docs/security/verifier-network-threat-model.md` — adversarial network model
- `docs/features/provider-trust-scoring.md` — provider trust scoring rationale
- `docs/adr/0013-oracle-anomaly-detection.md` — anomaly detection integration
