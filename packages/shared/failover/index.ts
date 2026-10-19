/**
 * packages/shared/failover/index.ts
 *
 * Resilient failover model for attestation and oracle services. (#686)
 *
 * This module defines the types, state machine, and evaluation logic that
 * govern how StellarVeriphy behaves when attestation or oracle providers
 * experience degradation, partial outages, or inconsistent network conditions.
 *
 * ## Design goals
 *
 * - **Documented failover path** – every transition in the state machine is
 *   explicit and named so operators and automated tooling share the same
 *   vocabulary.
 * - **Degraded operation is bounded** – the `DegradedOperationWindow` type
 *   captures exactly which capabilities are unavailable and what the operator
 *   should do next.
 * - **Trust integrity preserved** – no failover path allows a certificate to
 *   be minted without a valid attestation.  The module enforces this by
 *   separating "degraded but safe to queue" from "degraded and unsafe to
 *   proceed".
 * - **Recoverable** – the `FailoverState` machine transitions back to
 *   `"healthy"` once recovery conditions are met, and records the full
 *   degradation history for post-incident review.
 *
 * ## Failover states
 *
 * ```
 * healthy ──degradation_detected──▶ degraded
 *                                       │
 *              recovery_completed ◀─────┤─── provider_unresponsive
 *                                       │
 *                                       ▼
 *                                   partial_outage
 *                                       │
 *              recovery_completed ◀─────┤─── all_providers_exhausted
 *                                       │
 *                                       ▼
 *                                   full_outage
 *                                       │
 *              recovery_completed ◀─────┘
 * ```
 *
 * @module shared/failover
 */

// ---------------------------------------------------------------------------
// Service identifiers
// ---------------------------------------------------------------------------

export type FailoverServiceType = "attestation" | "oracle" | "storage";

// ---------------------------------------------------------------------------
// Health check result
// ---------------------------------------------------------------------------

export type ProviderHealthStatus = "healthy" | "degraded" | "unresponsive";

export interface ProviderHealthCheckResult {
  providerId: string;
  serviceType: FailoverServiceType;
  status: ProviderHealthStatus;
  latencyMs?: number;
  /** ISO 8601 timestamp of this health check. */
  checkedAt: string;
  /**
   * Human-readable description of any problem detected.
   * Empty when `status === "healthy"`.
   */
  detail: string;
}

// ---------------------------------------------------------------------------
// Failover state machine
// ---------------------------------------------------------------------------

/**
 * Overall health state of the service cluster.
 *
 * - `healthy` – all providers are responding normally.
 * - `degraded` – at least one provider is slow or returning errors but
 *   failover to another provider is possible.
 * - `partial_outage` – a subset of providers are unresponsive; the system
 *   can continue with reduced capacity.
 * - `full_outage` – no provider is reachable; new verifications are queued
 *   but not processed until recovery.
 */
export type FailoverSystemState = "healthy" | "degraded" | "partial_outage" | "full_outage";

/**
 * What can safely proceed during a degraded or partial-outage window.
 */
export interface DegradedCapabilities {
  /** New verification jobs can be accepted and queued. */
  canAcceptNewJobs: boolean;
  /** Queued jobs can be dispatched to at least one provider. */
  canDispatchJobs: boolean;
  /** Certificates can be minted (requires a valid attestation). */
  canMintCertificates: boolean;
  /**
   * Verifications that have a cached/retry-able attestation can be
   * finalised without a fresh attestation round-trip.
   */
  canFinaliseWithCachedAttestation: boolean;
}

/**
 * A bounded description of what is unavailable and what operators should do.
 */
export interface DegradedOperationWindow {
  state: FailoverSystemState;
  capabilities: DegradedCapabilities;
  /**
   * Provider IDs that are currently unresponsive (empty when `state === "healthy"`).
   */
  affectedProviders: string[];
  /**
   * Ordered list of operator actions to restore full service.
   */
  recoverySteps: string[];
  /** ISO 8601 start of this degradation window. */
  startedAt: string;
  /** ISO 8601 end of this window; `undefined` while still active. */
  resolvedAt?: string;
}

// ---------------------------------------------------------------------------
// Failover transition event
// ---------------------------------------------------------------------------

/**
 * A single recorded transition in the failover state machine.
 * Stored in `FailoverStateRecord.history` for post-incident review.
 */
export interface FailoverTransitionEvent {
  from: FailoverSystemState;
  to: FailoverSystemState;
  trigger: string;
  /** ISO 8601 timestamp of the transition. */
  occurredAt: string;
  /** Provider IDs that triggered the transition (if applicable). */
  affectedProviders: string[];
}

/**
 * Full in-memory record of the failover state machine for a service cluster.
 */
export interface FailoverStateRecord {
  serviceType: FailoverServiceType;
  currentState: FailoverSystemState;
  currentWindow?: DegradedOperationWindow;
  history: FailoverTransitionEvent[];
  /** ISO 8601 of last state evaluation. */
  lastEvaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Failover evaluation
// ---------------------------------------------------------------------------

/**
 * Configuration thresholds that govern state-machine transitions.
 */
export interface FailoverConfig {
  /**
   * Number of consecutive failed health checks before a provider is marked
   * `"unresponsive"`.  Default: 3.
   */
  unresponsiveThreshold: number;
  /**
   * Fraction of providers that must be unresponsive to trigger
   * `"partial_outage"` (0–1).  Default: 0.5.
   */
  partialOutageThreshold: number;
  /**
   * When `true`, jobs can still be dispatched to degraded (but not
   * unresponsive) providers.  Default: `true`.
   */
  allowDegradedDispatch: boolean;
  /**
   * When `true`, finalisation using a cached attestation is permitted during
   * partial outages.  Default: `true`.
   */
  allowCachedAttestationFallback: boolean;
}

export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  unresponsiveThreshold: 3,
  partialOutageThreshold: 0.5,
  allowDegradedDispatch: true,
  allowCachedAttestationFallback: true,
};

/**
 * Determine the `FailoverSystemState` and `DegradedCapabilities` from a
 * snapshot of provider health results.
 *
 * This is a pure function — it does not modify any state; the caller is
 * responsible for persisting the result.
 *
 * @param healthChecks - Latest health check results for all providers in the
 *   cluster.
 * @param cfg - Failover configuration thresholds.
 * @returns A `DegradedOperationWindow` describing the current state.
 */
export function evaluateFailoverState(
  healthChecks: ProviderHealthCheckResult[],
  cfg: FailoverConfig = DEFAULT_FAILOVER_CONFIG
): DegradedOperationWindow {
  const now = new Date().toISOString();

  if (healthChecks.length === 0) {
    return {
      state: "full_outage",
      capabilities: noCapabilities(),
      affectedProviders: [],
      recoverySteps: [
        "No providers are registered. Register at least one oracle/attestation provider.",
        "Check the registry contract for approved TEE code hashes.",
      ],
      startedAt: now,
    };
  }

  const unresponsive = healthChecks.filter((h) => h.status === "unresponsive");
  const degraded = healthChecks.filter((h) => h.status === "degraded");
  const unresponsiveFraction = unresponsive.length / healthChecks.length;

  // Full outage: all providers unresponsive.
  if (unresponsive.length === healthChecks.length) {
    return {
      state: "full_outage",
      capabilities: {
        canAcceptNewJobs: true, // queue for later
        canDispatchJobs: false,
        canMintCertificates: false,
        canFinaliseWithCachedAttestation: false,
      },
      affectedProviders: unresponsive.map((h) => h.providerId),
      recoverySteps: buildRecoverySteps("full_outage", unresponsive),
      startedAt: now,
    };
  }

  // Partial outage: fraction of providers above threshold are unresponsive.
  if (unresponsiveFraction >= cfg.partialOutageThreshold) {
    return {
      state: "partial_outage",
      capabilities: {
        canAcceptNewJobs: true,
        canDispatchJobs: true, // at least one healthy provider exists
        canMintCertificates: true, // can route to healthy provider
        canFinaliseWithCachedAttestation: cfg.allowCachedAttestationFallback,
      },
      affectedProviders: unresponsive.map((h) => h.providerId),
      recoverySteps: buildRecoverySteps("partial_outage", unresponsive),
      startedAt: now,
    };
  }

  // Degraded: some providers are slow / erroring but below the outage threshold.
  if (degraded.length > 0 || unresponsive.length > 0) {
    return {
      state: "degraded",
      capabilities: {
        canAcceptNewJobs: true,
        canDispatchJobs: cfg.allowDegradedDispatch,
        canMintCertificates: true,
        canFinaliseWithCachedAttestation: cfg.allowCachedAttestationFallback,
      },
      affectedProviders: [...unresponsive, ...degraded].map((h) => h.providerId),
      recoverySteps: buildRecoverySteps("degraded", [...unresponsive, ...degraded]),
      startedAt: now,
    };
  }

  // All providers healthy.
  return {
    state: "healthy",
    capabilities: allCapabilities(),
    affectedProviders: [],
    recoverySteps: [],
    startedAt: now,
  };
}

// ---------------------------------------------------------------------------
// State-machine transition helper
// ---------------------------------------------------------------------------

/**
 * Apply a new `DegradedOperationWindow` to a `FailoverStateRecord`, recording
 * the transition in `history` if the state changed.
 *
 * Returns the updated record (immutable — the original is not mutated).
 */
export function applyFailoverWindow(
  record: FailoverStateRecord,
  window: DegradedOperationWindow
): FailoverStateRecord {
  const now = new Date().toISOString();
  const stateChanged = record.currentState !== window.state;

  const history: FailoverTransitionEvent[] = stateChanged
    ? [
        ...record.history,
        {
          from: record.currentState,
          to: window.state,
          trigger: `provider_health_check`,
          occurredAt: now,
          affectedProviders: window.affectedProviders,
        },
      ]
    : record.history;

  // Mark the previous window as resolved if we're recovering to healthy.
  const previousWindow =
    record.currentWindow && stateChanged && window.state === "healthy"
      ? { ...record.currentWindow, resolvedAt: now }
      : record.currentWindow;

  return {
    ...record,
    currentState: window.state,
    currentWindow: window.state === "healthy" ? undefined : window,
    history,
    lastEvaluatedAt: now,
    // Preserve previous-window resolution for post-incident review.
    ...(previousWindow ? { resolvedWindow: previousWindow } : {}),
  };
}

// ---------------------------------------------------------------------------
// Recovery-step builder
// ---------------------------------------------------------------------------

function buildRecoverySteps(
  state: FailoverSystemState,
  affected: ProviderHealthCheckResult[]
): string[] {
  const ids = affected.map((h) => `"${h.providerId}"`).join(", ");

  const shared = [
    `Investigate affected provider(s): ${ids}.`,
    "Check oracle worker logs for connection errors or authentication failures.",
    "Verify the provider's TEE code hash is still approved in the registry contract.",
  ];

  if (state === "full_outage") {
    return [
      ...shared,
      "If all providers are unreachable, verify network connectivity from the worker host.",
      "Consider registering a standby oracle provider in the registry contract.",
      "Once at least one provider responds, queued jobs will resume automatically.",
    ];
  }

  if (state === "partial_outage") {
    return [
      ...shared,
      "Traffic is being routed to the remaining healthy provider(s).",
      "Restore or replace the unresponsive provider(s) and re-register if needed.",
      "Monitor the oracle analytics dashboard for latency and error-rate recovery.",
    ];
  }

  // degraded
  return [
    ...shared,
    "Monitor provider response times — routing will prefer healthy providers.",
    "If degradation persists beyond the SLA window, escalate to provider support.",
  ];
}

// ---------------------------------------------------------------------------
// Capability helpers
// ---------------------------------------------------------------------------

function allCapabilities(): DegradedCapabilities {
  return {
    canAcceptNewJobs: true,
    canDispatchJobs: true,
    canMintCertificates: true,
    canFinaliseWithCachedAttestation: true,
  };
}

function noCapabilities(): DegradedCapabilities {
  return {
    canAcceptNewJobs: false,
    canDispatchJobs: false,
    canMintCertificates: false,
    canFinaliseWithCachedAttestation: false,
  };
}
