# ADR-0006: Rate-limited oracle request router

- **Status:** Accepted
- **Date:** 2026-09-27
- **Deciders:** Core maintainers

## Context

The oracle contract (`contracts/oracle`) already implements weighted round-robin provider selection and SLA-based auto-suspension on-chain. However, the off-chain path — routing an incoming verification request to the right provider, handling retries, enforcing per-provider rate limits, and degrading gracefully under load — has no formal design. Without one, demand spikes can overload individual providers, a single slow provider can block request throughput, and there is no documented way for operators to reason about routing behavior. Closes #656.

Options considered:

- **Route everything to the on-chain contract and let it decide** — simplest, but shifts all load to contract invocation overhead and gives no off-chain retry or rate-limit control. A provider that is temporarily overloaded still consumes a contract call before failing.
- **Static hash-based sharding** — deterministic, but has no awareness of provider health or rate limits and cannot adapt to provider failures without manual reconfiguration.
- **Provider-aware router with per-provider rate limiting and retry** — adds complexity but is the only option that satisfies the availability and trust-preservation requirements at the same time.

## Decision

Implement an off-chain oracle request router (`frontend/lib/oracle/oracleRequestRouter.ts`) that:

1. **Selects a provider** using the same weighted round-robin logic mirrored from the oracle contract, so the off-chain and on-chain selection stay consistent.
2. **Enforces per-provider rate limits** before forwarding a request. Each provider has its own token-bucket window (configurable via environment variables). Requests that would exceed a provider's limit are held or re-routed to the next eligible provider, not dropped.
3. **Retries with exponential backoff** on transient failures (network timeouts, provider-reported `503`). Retries are capped at `ORACLE_MAX_RETRIES` (default: 3). After exhausting retries the request is marked failed and the provider's failure counter is incremented.
4. **Preserves trust semantics under load** — a provider that is rate-limited by the router is never selected for new requests during its cooldown window. If all providers are rate-limited or in cooldown, the router returns `RouterError.NoCapacity` rather than silently degrading to an untrusted fallback.

## Consequences

- Operators can configure per-provider rate limits and retry budgets independently, which matches the reality that different oracle providers may have different throughput contracts.
- The router's provider selection mirrors the on-chain round-robin, reducing the risk of the off-chain path choosing a provider the contract would have skipped.
- Operators can inspect routing decisions via structured logs emitted by the router (provider chosen, rate-limit state, retry count) without needing on-chain queries.
- The router is an in-process module (not a separate service), so it inherits the same process-restart state-reset limitation as the existing rate limiter (`docs/security/verification-service-security.md`). Persistent per-provider rate-limit state requires an external store (Redis or equivalent) in a multi-instance production deployment.
- High-load scenarios where all providers are saturated return a clear `NoCapacity` error rather than routing to an unqualified node, preserving the core trust guarantee.

## Implementation

`frontend/lib/oracle/oracleRequestRouter.ts` — see that file for configuration options, error types, and usage examples.

## Related

- `contracts/oracle/src/lib.rs` — on-chain counterpart (provider selection, SLA, suspension)
- `frontend/lib/security/rateLimiter.ts` — existing per-address limiter pattern
- `docs/security/verification-service-security.md` — rate limiting documentation
- `frontend/services/requestDeduplicator.ts` — request dedup logic used alongside routing
