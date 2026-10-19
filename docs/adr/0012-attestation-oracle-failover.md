# ADR-0012: Resilient Failover for Attestation and Oracle Services

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Operations, Resilience, Security

## Context

The verification pipeline depends on at least one available oracle/attestation
provider to advance jobs from `processing` to `certified`. If all registered
providers become unresponsive, jobs stall indefinitely and creators receive no
feedback. If some but not all providers fail, the system may silently route
to degraded providers and produce attestations of lower quality or fail at the
contract mint step.

Current gaps identified:

1. There is no formal definition of what "degraded" means — operators cannot
   distinguish "one provider slow" from "all providers down".
2. The oracle router retries within a single window but does not record the
   degradation history for post-incident review.
3. Trust integrity during failover is not explicitly guaranteed — the system
   could theoretically mint a certificate without a valid attestation if error
   handling is inconsistent.

Alternatives considered:

- **Circuit-breaker pattern only** — prevents calls to known-bad providers but
  does not document the recovery path or bounded degraded operation.
- **Queue-and-wait with no degraded mode** — simple but creates invisible
  backlogs and no operator visibility.
- **Formal state machine with documented capabilities** — the chosen approach.

## Decision

Implement a failover state machine (`packages/shared/failover/index.ts`) with
four explicit states (`healthy`, `degraded`, `partial_outage`, `full_outage`)
and a `DegradedOperationWindow` that documents exactly which capabilities are
available in each state.

Key properties:

- **Trust integrity is non-negotiable** — no failover path sets
  `canMintCertificates: true` unless at least one healthy provider is
  reachable. During `full_outage`, minting is blocked regardless of cached
  state.
- **Accepting new jobs is decoupled from dispatching** — during outages the
  system continues to accept and queue verification requests; it simply does
  not dispatch them until a provider recovers.
- **Recovery steps are machine-readable** — the `recoverySteps` array in
  `DegradedOperationWindow` can be surfaced in operator dashboards or PagerDuty
  alerts without further interpretation.
- **State history is preserved** — `FailoverStateRecord.history` records every
  state transition with a timestamp and the affected provider IDs, supporting
  post-incident review.
- **Pure evaluation function** — `evaluateFailoverState` is side-effect-free
  so it can be used in tests, simulations, and monitoring dashboards without
  triggering real state changes.

## Consequences

**Easier:**

- Operators have a single, documented vocabulary for degradation states.
- Monitoring dashboards can display `currentState` and `capabilities` without
  custom logic.
- Post-incident reviews can replay `history` to reconstruct the sequence of
  events.

**Harder:**

- The oracle worker must be updated to call `evaluateFailoverState` on every
  health-check cycle and persist the resulting `FailoverStateRecord`.
- Provider health checks need a reliable mechanism (e.g. a heartbeat endpoint
  on each oracle worker) — designing and deploying that is follow-up work.
- Configuring `partialOutageThreshold` and `unresponsiveThreshold` correctly
  for different deployment sizes requires operational tuning.

**Known limitations:**

- `evaluateFailoverState` takes a snapshot; it does not smooth over transient
  failures. Callers should apply a consecutive-failure counter before
  classifying a provider as `unresponsive` to avoid flapping.
- Cached-attestation fallback (`canFinaliseWithCachedAttestation`) is
  configurable but the mechanism for storing and retrieving cached attestations
  is not yet implemented; it is a future follow-up item.

Closes #686.
