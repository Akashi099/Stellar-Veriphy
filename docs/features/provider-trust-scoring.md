# Provider Trust Scoring

> Issue #668 · Labels: analytics, oracle, risk

A score-based trust model for oracle / verification providers built from
historical outcomes, attestation consistency, dispute history, SLA health,
stake and recency. It is used to prioritise high-confidence verification
sources and to surface high-risk providers for review.

## Components

| Layer | Location |
|---|---|
| Model (full, tunable) | `packages/shared/scoring/providerTrust.ts` |
| On-chain score (subset) | oracle contract `get_provider_trust_score(provider)` |
| API | `GET /api/oracles/trust`, `POST /api/oracles/trust` (preview tuned config) |
| Dashboard | `/oracles/trust` (`ProviderTrustDashboard`), linked from `/oracles` |

## Factors

Each factor is normalised to 0–1 (1 = best) and weighted. Weights are
normalised to sum to 1, so the final score is 0–100.

| Factor | Default weight | Source | Calculation |
|---|---|---|---|
| Historical outcomes | 30% | `ProviderMetrics` | Beta-prior smoothed success rate: `(successes + 0.8·20) / (total + 20)` |
| Attestation consistency | 20% | cross-checked attestations | smoothed share of re-checks that agreed (prior weight 10) |
| Dispute history | 20% | `DisputesByProvider` + `Dispute` | `1 − 0.25·providerFault − 0.05·open`; dismissed disputes are ignored |
| Availability | 10% | `ProviderSLA.actual_uptime` | uptime % (prior 0.8 when no SLA) |
| Latency | 5% | `ProviderSLA.actual_response_time` | 1 at/below target, linear to 0 at 3× target |
| Economic stake | 10% | `ProviderStake` | 0 below minimum; log-scaled 0.5→1 from 10 XLM to 1,000 XLM |
| Recent activity | 5% | `last_activity` | 1 within 7 days, linear to 0 at 60 days |

Post-weighting multipliers: suspended × 0.4; TEE hash near expiry × 0.9.

### Why smoothing?

A provider with 6/6 successes should not outrank one with 4,741/4,812. The
Beta prior pulls small samples toward 80%, and `confidence = 1 − e^(−n/100)`
tells reviewers how much history backs the score.

## Tiers and risk surfacing

| Tier | Rule |
|---|---|
| `high` | score ≥ 85 and ≥ 10 verifications |
| `medium` | 65 ≤ score < 85 and ≥ 10 verifications |
| `low` | 40 ≤ score < 65, or fewer than 10 verifications |
| `untrusted` | score < 40, or suspended |

`highRisk` is true for `low`/`untrusted` tiers **or** whenever the provider
has lost a dispute or shows attestation inconsistency (< 90% agreement),
regardless of score. High-risk providers are listed first on the dashboard
under a red heading.

Flags explain why: `suspended`, `insufficient_history`, `high_failure_rate`
(> 20% raw failures), `attestation_inconsistency`, `provider_fault_disputes`,
`open_disputes`, `under_staked`, `inactive`, `tee_expiry`, `slow_responses`.

## On-chain score

`get_provider_trust_score(provider) -> ProviderTrustScore` computes a
contract-verifiable subset in basis points (0–10,000):

| Component | Weight |
|---|---|
| Smoothed outcomes (`outcome_bps`) | 35 |
| Disputes (`dispute_bps`: −2,500 per provider-fault, −500 per open; last 100 scanned) | 25 |
| SLA compliance (`sla_bps`, 8,000 when no SLA) | 20 |
| Stake (`stake_bps`: 5,000 at minimum stake → 10,000 at 10×) | 20 |

Suspended providers are multiplied by 40%. `tier` is 0 (untrusted) – 3
(high) using the same thresholds as the off-chain model. The on-chain score
excludes attestation cross-checks, latency and recency, which are not stored
on-chain.

## Tuning and review

- All weights and thresholds live in `DEFAULT_TRUST_CONFIG`. Change them in
  one PR together with this document so the rationale stays reviewable.
- The dashboard's *Tune model weights* panel and
  `POST /api/oracles/trust { "config": { "weights": { … } } }` preview the
  effect of a change on current providers without changing any defaults.
- `modelVersion` (`TRUST_MODEL_VERSION`) is included in every score; bump it
  whenever defaults change so stored scores can be compared like-for-like.
- On-chain constants are `TRUST_*` in `contracts/oracle/src/lib.rs`; changing
  them requires a contract upgrade.

## Data gaps

`/api/oracles` does not yet expose dispute counts or attestation cross-checks,
so live scores use neutral values for those factors until the indexer
provides them. When the oracle contract is not configured, the API returns
representative sample providers and marks `source: "sample"`.
