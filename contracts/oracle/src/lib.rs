#![no_std]

//! # StellarVeriphy — Oracle Contract
//!
//! Manages **verification request lifecycles** and oracle provider
//! registration for the StellarVeriphy platform.
//!
//! ## Workflow
//!
//! 1. A creator submits a verification request via [`submit_request`],
//!    providing a content hash, manifest hash, storage reference, and an
//!    optional TEE attestation proof.
//! 2. The contract selects the next eligible oracle provider using a
//!    round-robin algorithm that skips suspended or recently failed nodes.
//! 3. The assigned provider fetches the media, runs verification inside a
//!    TEE enclave, and calls [`verify_attestation`] with an Ed25519 signature
//!    over the attestation payload.
//! 4. The oracle contract validates the signature against the provider's
//!    registered key, confirms the TEE code hash is approved in the
//!    [`RegistryContract`], then calls `provenance_client.mint` to issue
//!    an on-chain certificate.
//!
//! ## Provider management
//!
//! Oracle providers must:
//! - Be registered via [`register_provider`].
//! - Stake at least [`MINIMUM_STAKE`] stroops (≈ 10 XLM).
//! - Maintain an SLA compliance rate above [`SLA_SUSPENSION_THRESHOLD`] % or
//!   they are automatically suspended.
//!
//! ## Circuit breaker
//!
//! The contract administrator can pause all new request submissions via the
//! circuit-breaker flag.  In-flight requests are not affected.
//!
//! ## Storage model
//!
//! | Key pattern | Storage type | Lifetime |
//! |---|---|---|
//! | `DataKey::Admin` | `instance` | contract lifetime |
//! | `DataKey::Request(id)` | `persistent` | until archived / TTL |
//! | `DataKey::Provider(addr)` | `persistent` | until removed |
//! | `DataKey::ProviderStake(addr)` | `persistent` | until withdrawn |
//! | `DataKey::ProviderSLA(addr)` | `persistent` | rolling window |
//!
//! ## Example (off-chain SDK call)
//!
//! ```ignore
//! // Submit a new verification request
//! let request_id = oracle_client.submit_request(
//!     &env,
//!     &content_hash,
//!     &manifest_hash,
//!     &storage_ref,
//!     None,              // attestation_proof (supplied by provider later)
//!     &Priority::Normal,
//!     &ContentComplexity::Simple,
//! );
//! ```

#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, vec, Address, Bytes, BytesN, Env, String,
    Symbol, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MINIMUM_STAKE: u128 = 1_000_000_000; // 1 billion stroops (10 XLM)
const WITHDRAWAL_COOLDOWN_LEDGERS: u32 = 7200; // ~1 hour
const ARCHIVAL_THRESHOLD_LEDGERS: u32 = 1000; // archive after 1000 ledgers
const DEFAULT_REQUEST_TTL_LEDGERS: u32 = 100;
const DEFAULT_EXPIRATION_WARNING_LEDGERS: u32 = 20;
// SLA suspension threshold: providers below this compliance % are auto-suspended
const SLA_SUSPENSION_THRESHOLD: u32 = 70;
// Load balancing: max consecutive failures before a provider is skipped
const MAX_RECENT_FAILURES: u32 = 5;
// Load balancing: how many ledgers to consider a provider "recently failed"
const FAILURE_COOLDOWN_LEDGERS: u32 = 500;
// #668 — trust score model (weights sum to 100; prior pulls small samples to 80%)
const TRUST_PRIOR_BPS: u64 = 8_000;
const TRUST_PRIOR_WEIGHT: u64 = 20;
const TRUST_WEIGHT_OUTCOME: u64 = 35;
const TRUST_WEIGHT_DISPUTE: u64 = 25;
const TRUST_WEIGHT_SLA: u64 = 20;
const TRUST_WEIGHT_STAKE: u64 = 20;
const TRUST_FAULT_PENALTY_BPS: u32 = 2_500;
const TRUST_OPEN_PENALTY_BPS: u32 = 500;
const TRUST_SUSPENDED_MULTIPLIER: u32 = 40;
/// Only the most recent disputes are inspected to bound read costs.
const TRUST_MAX_DISPUTES_SCANNED: u32 = 100;
// #671 — cap on anchored evidence packages per dispute
const MAX_EVIDENCE_ANCHORS: u32 = 50;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    /// The contract has not been initialized.
    /// Occurs when calling functions that require contract setup before `init` has been executed.
    NotInitialized = 1,

    /// The attestation or signature was not signed by an authorized provider.
    /// Occurs in `verify_attestation` if the provider public key does not match or is unauthorized.
    UnauthorizedSigner = 2,

    /// The contract has already been initialized.
    /// Occurs when `init` is invoked more than once.
    AlreadyInitialized = 3,

    /// The registry contract is not configured in instance storage.
    /// Occurs during cross-contract calls to the registry if the registry address is missing.
    RegistryNotConfigured = 4,

    /// The TEE (Trusted Execution Environment) measurement/hash is unverified.
    /// Occurs when the provided `tee_hash` is not approved in the registry.
    TeeNotVerified = 5,

    /// The specified oracle provider is not registered in the contract.
    /// Occurs when querying, configuring, or recording metrics for an unregistered provider.
    ProviderNotRegistered = 6,

    /// The batch verification request exceeds the maximum allowed batch size.
    /// Occurs in `submit_batch_request` when submitting more items than permitted.
    BatchSizeExceeded = 7,

    /// The verification request with the specified ID was not found.
    /// Occurs when querying, canceling, or resolving a non-existent or expired request ID.
    RequestNotFound = 8,

    /// The caller is not authorized to perform the operation.
    /// Occurs when an administrative or owner action is called without proper permissions.
    Unauthorized = 9,

    /// The request or entity is in an invalid state for the attempted operation.
    /// Occurs when attempting to cancel, verify, or resolve a request that is not in `Pending` state.
    InvalidState = 10,

    /// The provider stake is insufficient.
    /// Occurs when depositing less than `MINIMUM_STAKE` or attempting to withdraw more than staked.
    InsufficientStake = 11,

    /// No stake found for the specified provider.
    /// Occurs when initiating a withdrawal or slashing stake for a provider without a stake record.
    NoStake = 12,

    /// The withdrawal cooldown period has not elapsed yet.
    /// Occurs when attempting to complete a stake withdrawal before `WITHDRAWAL_COOLDOWN_LEDGERS` passes.
    WithdrawalCooldown = 13,

    /// The oracle contract operations are currently paused by the administrator.
    /// Occurs when attempting to submit requests while the circuit breaker is active.
    ContractPaused = 14,

    /// The oracle provider is currently suspended due to SLA violations.
    /// Occurs when attempting operations with a provider whose compliance fell below `SLA_SUSPENSION_THRESHOLD`.
    ProviderSuspended = 15,

    /// Pricing configuration has not been set for the provider.
    /// Occurs in `estimate_cost` when the provider has no configured `ProviderPricing`.
    PricingNotSet = 16,

    /// No eligible oracle provider is available to process the request.
    /// Occurs in `get_next_available_provider` when all providers are unregistered, failed, or cooldown active.
    NoAvailableProvider = 17,

    /// The dispute with the specified ID was not found.
    /// Occurs when attempting to retrieve, resolve, or dismiss a non-existent dispute ID.
    DisputeNotFound = 18,

    /// The dispute has already been resolved or dismissed.
    /// Occurs when attempting to resolve or dismiss an already-finalized dispute.
    DisputeAlreadyResolved = 19,

    /// The provided TTL configuration values are invalid.
    /// Occurs in `update_ttl_config` if any TTL parameter (default, high, or low priority) is 0.
    InvalidTTL = 20,

    /// The provided expiration warning threshold is invalid.
    /// Occurs in `update_warning_threshold` if the ledger threshold is set to 0.
    InvalidThreshold = 21,

    /// #453 — The caller is not the currently-authorized delegate for the principal.
    /// Occurs in `submit_request_as_delegate` if `delegate` doesn't match the
    /// principal's stored delegate (or none was ever authorized).
    NotAuthorizedDelegate = 22,
}

// ---------------------------------------------------------------------------
// Storage keys
// #439 — deduplicated and compacted: each variant appears exactly once.
// Variants that only ever hold a single scalar use small fixed-size names to
// keep the on-chain serialisation compact.
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    // ── singleton config (instance storage) ──────────────────────────────
    Registry,
    Provenance,
    Admin,
    Paused,
    RoundRobinIndex,
    NextRequestId,
    LastArchivalLedger,
    RequestTTL,
    ExpirationWarningLedgers,
    NextDisputeId,
    // ── per-provider (persistent storage) ────────────────────────────────
    Provider(Address),
    ProviderList,
    ProviderStake(Address),
    ProviderWithdrawalCooldown(Address),
    ProviderMetrics(Address),
    ProviderLastFailureLedger(Address),
    ProviderSLA(Address),
    ProviderSuspended(Address),
    ProviderPricing(Address),
    // ── per-request (temporary storage) ──────────────────────────────────
    Request(u64),
    RequestExpiresAtLedger(u64),
    RequestsByState(RequestState),
    ArchivedRequest(u64),
    // ── dispute tracking ──────────────────────────────────────────────────
    Dispute(u64),
    DisputesByProvider(Address),
    // ── #453 request delegation (persistent storage) ───────────────────────
    /// Principal address → the delegate address currently authorized to
    /// submit verification requests on their behalf.
    Delegate(Address),
    /// Request ids submitted on behalf of a principal via delegation.
    DelegatedRequestsByPrincipal(Address),
    // ── #671 dispute evidence anchoring (persistent storage) ──────────────
    /// Dispute id → ordered list of evidence package hashes anchored for it.
    DisputeEvidence(u64),
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RequestState {
    Pending,
    Verified,
    Rejected,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Priority {
    Low,
    Normal,
    High,
    Urgent,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContentComplexity {
    Simple,
    Moderate,
    Complex,
}

// ---------------------------------------------------------------------------
// Core structs
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeState {
    Open,
    Resolved,
    Dismissed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeResolution {
    ProviderFault,
    RequesterFault,
    Inconclusive,
    NoFault,
    /// Not yet resolved.
    Pending,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct VerificationRequest {
    pub storage_ref: Bytes,
    pub manifest_hash: Bytes,
    pub requester: Address,
    pub state: RequestState,
    pub priority: Priority,
    // #449 — Optional comments/notes for context during verification
    pub comment: Option<String>,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct RequestWithId {
    pub id: u64,
    pub request: VerificationRequest,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PaginatedRequests {
    pub requests: Vec<RequestWithId>,
    pub total_count: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AttestationData {
    pub provider: Address,
    pub tee_hash: BytesN<32>,
    pub signature: BytesN<64>,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderStakeInfo {
    pub amount: u128,
    pub withdrawal_cooldown_until: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ArchivedRequest {
    pub request: VerificationRequest,
    pub archived_at_ledger: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AggregatedRequest {
    pub primary_id: u64,
    pub member_ids: Vec<u64>,
    pub manifest_hash: Bytes,
    pub total_fee: u128,
}

// ---------------------------------------------------------------------------
// SLA structs  (Feature 1)
// ---------------------------------------------------------------------------

/// Target and actual performance metrics for a single provider.
/// All percentage fields are in the range [0, 100].
/// `actual_response_time` is the rolling average in seconds.
/// `actual_uptime` and `actual_success_rate` are percentages (0–100).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderSLA {
    // ── Targets ────────────────────────────────────────────────────────────
    /// Maximum acceptable average response time (seconds).
    pub target_response_time_seconds: u32,
    /// Minimum uptime percentage the provider must maintain.
    pub target_uptime_percentage: u32,
    /// Minimum success rate the provider must maintain.
    pub target_success_rate: u32,

    // ── Actuals ────────────────────────────────────────────────────────────
    /// Rolling average response time (seconds) based on recent verifications.
    pub actual_response_time: u32,
    /// Measured uptime percentage over the tracking window.
    pub actual_uptime: u32,
    /// Measured verification success rate over the tracking window.
    pub actual_success_rate: u32,

    // ── Counters used to compute actuals ───────────────────────────────────
    pub total_requests: u64,
    pub successful: u64,
    pub total_response_sum: u64,
}

/// SLA compliance summary returned to callers.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SLACompliance {
    pub response_time_ok: bool,
    pub uptime_ok: bool,
    pub success_rate_ok: bool,
    /// Overall compliance percentage (0–100): fraction of targets met × 100.
    pub compliance_percent: u32,
    pub suspended: bool,
}

// ---------------------------------------------------------------------------
// Cost estimation structs  (Feature 2)
// ---------------------------------------------------------------------------

/// Per-provider pricing configuration.
/// All amounts are in stroops (1 XLM = 10_000_000 stroops).
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderPricing {
    /// Base cost for a standard verification.
    pub base_fee_stroops: u128,
    /// Extra cost added per KB of content (0 to disable).
    pub per_kb_fee_stroops: u128,
}

/// Detailed cost breakdown returned by `estimate_cost`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CostEstimate {
    pub base_fee: u128,
    pub size_fee: u128,
    pub priority_fee: u128,
    pub complexity_fee: u128,
    pub total: u128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct TTLConfig {
    pub default_ttl: u32,
    pub high_priority_ttl: u32,
    pub low_priority_ttl: u32,
}

/// Tracks verification performance metrics for a provider.
/// Used by the weighted/round-robin selection algorithm.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderMetrics {
    pub total_verifications: u64,
    pub successful_verifications: u64,
    pub failed_verifications: u64,
    /// Ledger sequence of the last recorded activity.
    pub last_activity: u64,
}

/// Dispute record filed against a provider or about a verification result.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Dispute {
    pub id: u64,
    pub request_id: u64,
    pub provider: Address,
    pub requester: Address,
    pub reason: Bytes,
    pub state: DisputeState,
    pub resolution: DisputeResolution,
    pub filed_at_ledger: u32,
    pub resolved_at_ledger: Option<u32>,
    /// Reputation penalty applied (in basis points, e.g. 500 = 5%).
    pub reputation_penalty: u32,
}

/// #671 — An evidence package hash anchored against a dispute. The package
/// itself lives off-chain; anchoring makes later tampering detectable.
#[contracttype]
#[derive(Clone, Debug)]
pub struct EvidenceAnchor {
    /// SHA-256 of the canonical evidence package.
    pub package_hash: BytesN<32>,
    pub submitter: Address,
    pub anchored_at_ledger: u32,
}

/// #668 — On-chain provider trust score. All components are basis points
/// (0–10_000). Mirrors a subset of the off-chain model in
/// `packages/shared/scoring/providerTrust.ts`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderTrustScore {
    pub score_bps: u32,
    /// 0 = untrusted, 1 = low, 2 = medium, 3 = high.
    pub tier: u32,
    pub outcome_bps: u32,
    pub dispute_bps: u32,
    pub sla_bps: u32,
    pub stake_bps: u32,
    pub total_verifications: u64,
    pub provider_fault_disputes: u32,
    pub open_disputes: u32,
    pub suspended: bool,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct OracleContract;

#[contractimpl]
impl OracleContract {
    // -----------------------------------------------------------------------
    // Initialisation
    // -----------------------------------------------------------------------

    pub fn init(
        env: Env,
        registry: Address,
        provenance: Address,
        admin: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage()
            .instance()
            .set(&DataKey::Provenance, &provenance);
        env.storage().instance().set(&DataKey::Admin, &admin);

        let default_config = TTLConfig {
            default_ttl: DEFAULT_REQUEST_TTL_LEDGERS,
            high_priority_ttl: 200,
            low_priority_ttl: 50,
        };
        env.storage()
            .instance()
            .set(&DataKey::RequestTTL, &default_config);
        env.storage().instance().set(
            &DataKey::ExpirationWarningLedgers,
            &DEFAULT_EXPIRATION_WARNING_LEDGERS,
        );
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Pause / unpause
    // -----------------------------------------------------------------------

    pub fn pause(env: Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        env.events().publish((Symbol::new(&env, "pause"),), admin);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().remove(&DataKey::Paused);
        env.events().publish((Symbol::new(&env, "unpause"),), admin);
        Ok(())
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Provider registry
    // -----------------------------------------------------------------------

    pub fn add_provider(env: Env, provider: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Provider(provider.clone()), &true);

        // Maintain a global provider list for round-robin iteration
        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(vec![&env]);
        // Only add if not already present
        let mut found = false;
        for i in 0..list.len() {
            if list.get(i).unwrap() == provider {
                found = true;
                break;
            }
        }
        if !found {
            list.push_back(provider.clone());
            env.storage()
                .persistent()
                .set(&DataKey::ProviderList, &list);
        }
        env.events()
            .publish((Symbol::new(&env, "provider_added"),), provider);
        Ok(())
    }

    pub fn remove_provider(env: Env, provider: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Provider(provider.clone()));

        // Remove from provider list
        let list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(vec![&env]);
        let mut new_list: Vec<Address> = vec![&env];
        for i in 0..list.len() {
            let p = list.get(i).unwrap();
            if p != provider {
                new_list.push_back(p);
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::ProviderList, &new_list);
        env.events()
            .publish((Symbol::new(&env, "provider_removed"),), provider);
        Ok(())
    }

    pub fn is_provider(env: Env, provider: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Provider(provider))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Staking
    // -----------------------------------------------------------------------

    pub fn deposit_stake(env: Env, provider: Address, amount: u128) -> Result<(), Error> {
        provider.require_auth();
        if amount < MINIMUM_STAKE {
            return Err(Error::InsufficientStake);
        }
        let current: ProviderStakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderStake(provider.clone()))
            .unwrap_or(ProviderStakeInfo {
                amount: 0,
                withdrawal_cooldown_until: 0,
            });
        let stake_info = ProviderStakeInfo {
            amount: current.amount.saturating_add(amount),
            withdrawal_cooldown_until: current.withdrawal_cooldown_until,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderStake(provider.clone()), &stake_info);
        env.events()
            .publish((Symbol::new(&env, "stake_deposited"),), (provider, amount));
        Ok(())
    }

    pub fn initiate_withdrawal(env: Env, provider: Address, amount: u128) -> Result<(), Error> {
        provider.require_auth();
        let stake_info: ProviderStakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderStake(provider.clone()))
            .ok_or(Error::NoStake)?;
        if stake_info.amount < amount {
            return Err(Error::InsufficientStake);
        }
        let current_ledger = env.ledger().sequence();
        let cooldown_until = current_ledger + WITHDRAWAL_COOLDOWN_LEDGERS;
        let updated = ProviderStakeInfo {
            amount: stake_info.amount.saturating_sub(amount),
            withdrawal_cooldown_until: cooldown_until,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderStake(provider.clone()), &updated);
        env.storage().persistent().set(
            &DataKey::ProviderWithdrawalCooldown(provider.clone()),
            &(cooldown_until, amount),
        );
        env.events().publish(
            (Symbol::new(&env, "withdrawal_initiated"),),
            (provider, amount),
        );
        Ok(())
    }

    pub fn complete_withdrawal(env: Env, provider: Address) -> Result<u128, Error> {
        provider.require_auth();
        let (cooldown_until, amount): (u32, u128) = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderWithdrawalCooldown(provider.clone()))
            .ok_or(Error::NoStake)?;
        if env.ledger().sequence() < cooldown_until {
            return Err(Error::WithdrawalCooldown);
        }
        env.storage()
            .persistent()
            .remove(&DataKey::ProviderWithdrawalCooldown(provider));
        Ok(amount)
    }

    pub fn get_provider_stake(env: Env, provider: Address) -> u128 {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderStake(provider))
            .map(|s: ProviderStakeInfo| s.amount)
            .unwrap_or(0u128)
    }

    pub fn slash_stake(env: Env, provider: Address, amount: u128) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        let stake_info: ProviderStakeInfo = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderStake(provider.clone()))
            .ok_or(Error::NoStake)?;
        let slashed = if stake_info.amount >= amount {
            amount
        } else {
            stake_info.amount
        };
        let updated = ProviderStakeInfo {
            amount: stake_info.amount.saturating_sub(slashed),
            withdrawal_cooldown_until: stake_info.withdrawal_cooldown_until,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderStake(provider.clone()), &updated);
        env.events()
            .publish((Symbol::new(&env, "stake_slashed"),), (provider, slashed));
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Provider metrics (used by load-balancing algorithm)
    // -----------------------------------------------------------------------

    /// Record a successful verification by a provider.
    pub fn record_verification_success(env: Env, provider: Address) {
        let mut m: ProviderMetrics = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderMetrics(provider.clone()))
            .unwrap_or(ProviderMetrics {
                total_verifications: 0,
                successful_verifications: 0,
                failed_verifications: 0,
                last_activity: 0,
            });
        m.total_verifications = m.total_verifications.saturating_add(1);
        m.successful_verifications = m.successful_verifications.saturating_add(1);
        m.last_activity = env.ledger().timestamp();
        env.storage()
            .persistent()
            .set(&DataKey::ProviderMetrics(provider), &m);
    }

    /// Record a failed verification by a provider.
    pub fn record_verification_failure(env: Env, provider: Address) {
        let mut m: ProviderMetrics = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderMetrics(provider.clone()))
            .unwrap_or(ProviderMetrics {
                total_verifications: 0,
                successful_verifications: 0,
                failed_verifications: 0,
                last_activity: 0,
            });
        m.total_verifications = m.total_verifications.saturating_add(1);
        m.failed_verifications = m.failed_verifications.saturating_add(1);
        m.last_activity = env.ledger().timestamp();
        // Record ledger of last failure for cooldown check
        env.storage().persistent().set(
            &DataKey::ProviderLastFailureLedger(provider.clone()),
            &env.ledger().sequence(),
        );
        env.storage()
            .persistent()
            .set(&DataKey::ProviderMetrics(provider), &m);
    }

    /// Retrieve round-robin/reputation metrics for a provider.  Returns None if never recorded.
    pub fn get_verification_metrics(env: Env, provider: Address) -> Option<ProviderMetrics> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderMetrics(provider))
    }

    /// Compute a reputation score 0-100 for a provider.
    /// Score = (successful / total) * 100, clamped to 100.
    /// Returns 100 if no verifications recorded (new providers start trusted).
    pub fn get_reputation_score(env: Env, provider: Address) -> u32 {
        let m: ProviderMetrics = match env
            .storage()
            .persistent()
            .get(&DataKey::ProviderMetrics(provider))
        {
            Some(m) => m,
            None => return 100,
        };
        if m.total_verifications == 0 {
            return 100;
        }
        ((m.successful_verifications * 100) / m.total_verifications) as u32
    }

    // -----------------------------------------------------------------------
    // Load balancing — weighted round-robin provider selection
    // -----------------------------------------------------------------------

    /// Returns the address of the next available provider using a weighted
    /// round-robin algorithm.
    ///
    /// Selection criteria applied in order:
    ///   1. Provider must be registered (`add_provider` was called).
    ///   2. Provider must not be in a recent-failure cooldown window.
    ///   3. Among eligible providers the one with the highest reputation
    ///      score is preferred (ties broken by round-robin index).
    ///
    /// The round-robin index advances after every call so no single provider
    /// monopolises requests when scores are equal.
    pub fn get_next_available_provider(env: Env) -> Result<Address, Error> {
        let list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(vec![&env]);

        if list.is_empty() {
            return Err(Error::NoAvailableProvider);
        }

        let current_ledger = env.ledger().sequence();

        // Collect eligible providers and their reputation scores
        let mut best_provider: Option<Address> = None;
        let mut best_score: u32 = 0;

        // Start iteration from the saved round-robin index to break ties fairly
        let rr_start: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RoundRobinIndex)
            .unwrap_or(0u32);

        let len = list.len();

        for offset in 0..len {
            let idx = (rr_start + offset) % len;
            let provider = list.get(idx).unwrap();

            // Skip if not registered
            if !env
                .storage()
                .persistent()
                .get(&DataKey::Provider(provider.clone()))
                .unwrap_or(false)
            {
                continue;
            }

            // Skip if inside failure cooldown
            let last_failure: u32 = env
                .storage()
                .persistent()
                .get(&DataKey::ProviderLastFailureLedger(provider.clone()))
                .unwrap_or(0u32);
            if last_failure > 0 && current_ledger < last_failure + FAILURE_COOLDOWN_LEDGERS {
                // Only skip if they have had recent consecutive failures
                let m: ProviderMetrics = env
                    .storage()
                    .persistent()
                    .get(&DataKey::ProviderMetrics(provider.clone()))
                    .unwrap_or(ProviderMetrics {
                        total_verifications: 0,
                        successful_verifications: 0,
                        failed_verifications: 0,
                        last_activity: 0,
                    });
                if m.failed_verifications >= MAX_RECENT_FAILURES as u64 {
                    continue;
                }
            }

            let score = Self::get_reputation_score(env.clone(), provider.clone());
            if best_provider.is_none() || score > best_score {
                best_score = score;
                best_provider = Some(provider);
            }
        }

        let chosen = best_provider.ok_or(Error::NoAvailableProvider)?;

        // Advance round-robin index
        let next_rr = (rr_start + 1) % len;
        env.storage()
            .instance()
            .set(&DataKey::RoundRobinIndex, &next_rr);

        env.events().publish(
            (Symbol::new(&env, "provider_selected"),),
            (chosen.clone(), best_score),
        );
        Ok(chosen)
    }

    /// Return all registered providers with their current capacity info.
    pub fn get_provider_list(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(vec![&env])
    }

    // -----------------------------------------------------------------------
    // Dispute resolution
    // -----------------------------------------------------------------------

    /// File a dispute against a provider for a specific verification request.
    ///
    /// The requester must be the original requester of the request.
    /// Emits a `dispute_filed` event.
    pub fn file_dispute(
        env: Env,
        request_id: u64,
        provider: Address,
        reason: Bytes,
    ) -> Result<u64, Error> {
        // Fetch request — accept both live and archived
        let req: VerificationRequest = env
            .storage()
            .temporary()
            .get(&DataKey::Request(request_id))
            .ok_or(Error::RequestNotFound)?;

        req.requester.require_auth();

        // Assign dispute ID
        let dispute_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextDisputeId)
            .unwrap_or(0u64)
            + 1;
        env.storage()
            .instance()
            .set(&DataKey::NextDisputeId, &dispute_id);

        let dispute = Dispute {
            id: dispute_id,
            request_id,
            provider: provider.clone(),
            requester: req.requester.clone(),
            reason,
            state: DisputeState::Open,
            resolution: DisputeResolution::Pending,
            filed_at_ledger: env.ledger().sequence(),
            resolved_at_ledger: None,
            reputation_penalty: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);

        // Index by provider
        let mut by_provider: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::DisputesByProvider(provider.clone()))
            .unwrap_or(vec![&env]);
        by_provider.push_back(dispute_id);
        env.storage()
            .persistent()
            .set(&DataKey::DisputesByProvider(provider.clone()), &by_provider);

        env.events().publish(
            (Symbol::new(&env, "dispute_filed"),),
            (dispute_id, request_id, provider, req.requester),
        );
        Ok(dispute_id)
    }

    /// Admin resolves an open dispute.
    ///
    /// `resolution`        — outcome of the review.
    /// `reputation_penalty` — basis points to deduct from provider reputation
    ///                        (only applied when resolution == ProviderFault).
    /// `slash_amount`      — amount of stake to slash (0 = no slash).
    pub fn resolve_dispute(
        env: Env,
        dispute_id: u64,
        resolution: DisputeResolution,
        reputation_penalty: u32,
        slash_amount: u128,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)?;

        if dispute.state != DisputeState::Open {
            return Err(Error::DisputeAlreadyResolved);
        }

        dispute.state = DisputeState::Resolved;
        dispute.resolution = resolution.clone();
        dispute.resolved_at_ledger = Some(env.ledger().sequence());
        dispute.reputation_penalty = reputation_penalty;

        // Apply penalties when the provider is at fault
        if resolution == DisputeResolution::ProviderFault {
            // Record the penalty as a synthetic failure in provider metrics
            if reputation_penalty > 0 {
                let mut m: ProviderMetrics = env
                    .storage()
                    .persistent()
                    .get(&DataKey::ProviderMetrics(dispute.provider.clone()))
                    .unwrap_or(ProviderMetrics {
                        total_verifications: 0,
                        successful_verifications: 0,
                        failed_verifications: 0,
                        last_activity: 0,
                    });
                // Add synthetic failures proportional to the penalty
                let penalty_failures = (reputation_penalty / 10) as u64;
                m.failed_verifications = m.failed_verifications.saturating_add(penalty_failures);
                m.total_verifications = m.total_verifications.saturating_add(penalty_failures);
                env.storage()
                    .persistent()
                    .set(&DataKey::ProviderMetrics(dispute.provider.clone()), &m);
            }

            // Slash stake if requested
            if slash_amount > 0 {
                let stake_info: ProviderStakeInfo = env
                    .storage()
                    .persistent()
                    .get(&DataKey::ProviderStake(dispute.provider.clone()))
                    .unwrap_or(ProviderStakeInfo {
                        amount: 0,
                        withdrawal_cooldown_until: 0,
                    });
                let slash = if stake_info.amount >= slash_amount {
                    slash_amount
                } else {
                    stake_info.amount
                };
                let updated = ProviderStakeInfo {
                    amount: stake_info.amount.saturating_sub(slash),
                    withdrawal_cooldown_until: stake_info.withdrawal_cooldown_until,
                };
                env.storage()
                    .persistent()
                    .set(&DataKey::ProviderStake(dispute.provider.clone()), &updated);
                env.events().publish(
                    (Symbol::new(&env, "stake_slashed"),),
                    (dispute.provider.clone(), slash),
                );
            }
        }

        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);

        env.events().publish(
            (Symbol::new(&env, "dispute_resolved"),),
            (dispute_id, dispute.provider, resolution, reputation_penalty),
        );
        Ok(())
    }

    /// Dismiss an open dispute (admin only, e.g. frivolous claim).
    pub fn dismiss_dispute(env: Env, dispute_id: u64) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)?;

        if dispute.state != DisputeState::Open {
            return Err(Error::DisputeAlreadyResolved);
        }

        dispute.state = DisputeState::Dismissed;
        dispute.resolved_at_ledger = Some(env.ledger().sequence());
        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id), &dispute);

        env.events().publish(
            (Symbol::new(&env, "dispute_dismissed"),),
            (dispute_id, dispute.provider, dispute.requester),
        );
        Ok(())
    }

    /// Get a single dispute by ID.
    pub fn get_dispute(env: Env, dispute_id: u64) -> Option<Dispute> {
        env.storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
    }

    /// Get all dispute IDs filed against a provider.
    pub fn get_disputes_by_provider(env: Env, provider: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::DisputesByProvider(provider))
            .unwrap_or(vec![&env])
    }

    // -----------------------------------------------------------------------
    // Request lifecycle
    // -----------------------------------------------------------------------

    pub fn submit_request(
        env: Env,
        storage_ref: Bytes,
        manifest_hash: Bytes,
        requester: Address,
        priority: Priority,
    ) -> Result<u64, Error> {
        requester.require_auth();
        Self::create_pending_request(&env, storage_ref, manifest_hash, requester, priority)
    }

    pub fn get_request(env: Env, id: u64) -> Option<VerificationRequest> {
        env.storage().temporary().get(&DataKey::Request(id))
    }

    // -----------------------------------------------------------------------
    // #453 — Request delegation
    // -----------------------------------------------------------------------

    /// Authorize `delegate` to submit verification requests on behalf of
    /// `principal`. Replaces any previously-authorized delegate.
    pub fn authorize_delegate(
        env: Env,
        principal: Address,
        delegate: Address,
    ) -> Result<(), Error> {
        principal.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Delegate(principal.clone()), &delegate);
        env.events().publish(
            (Symbol::new(&env, "delegate_authorized"),),
            (principal, delegate),
        );
        Ok(())
    }

    /// Revoke `principal`'s currently-authorized delegate, if any.
    pub fn revoke_delegate(env: Env, principal: Address) -> Result<(), Error> {
        principal.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::Delegate(principal.clone()));
        env.events()
            .publish((Symbol::new(&env, "delegate_revoked"),), principal);
        Ok(())
    }

    /// The address currently authorized to submit requests on behalf of
    /// `principal`, if any.
    pub fn get_delegate(env: Env, principal: Address) -> Option<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Delegate(principal))
    }

    /// Submit a verification request on behalf of `principal`. `delegate`
    /// must be the address `principal` currently has authorized via
    /// `authorize_delegate`, and must itself authorize this call. The
    /// resulting request (and any certificate minted from it) is owned by
    /// `principal`, not `delegate`.
    pub fn submit_request_as_delegate(
        env: Env,
        principal: Address,
        delegate: Address,
        storage_ref: Bytes,
        manifest_hash: Bytes,
        priority: Priority,
    ) -> Result<u64, Error> {
        delegate.require_auth();

        let authorized: Option<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Delegate(principal.clone()));
        if authorized != Some(delegate) {
            return Err(Error::NotAuthorizedDelegate);
        }

        let id = Self::create_pending_request(
            &env,
            storage_ref,
            manifest_hash,
            principal.clone(),
            priority,
        )?;

        let idx_key = DataKey::DelegatedRequestsByPrincipal(principal);
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&idx_key)
            .unwrap_or(vec![&env]);
        ids.push_back(id);
        env.storage().persistent().set(&idx_key, &ids);

        Ok(id)
    }

    /// Request ids submitted on behalf of `principal` via delegation,
    /// paginated (most recent first).
    pub fn get_delegated_requests(
        env: Env,
        principal: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<u64> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::DelegatedRequestsByPrincipal(principal))
            .unwrap_or(vec![&env]);

        let mut results: Vec<u64> = vec![&env];
        let mut count = 0u32;
        let mut skipped = 0u32;

        let mut i = ids.len();
        while i > 0 && count < limit {
            i -= 1;
            if skipped < offset {
                skipped += 1;
                continue;
            }
            results.push_back(ids.get(i).unwrap());
            count += 1;
        }

        results
    }

    pub fn get_ttl_config(env: Env) -> TTLConfig {
        env.storage()
            .instance()
            .get(&DataKey::RequestTTL)
            .unwrap_or(TTLConfig {
                default_ttl: DEFAULT_REQUEST_TTL_LEDGERS,
                high_priority_ttl: 200,
                low_priority_ttl: 50,
            })
    }

    pub fn update_ttl_config(
        env: Env,
        default_ttl: u32,
        high_priority_ttl: u32,
        low_priority_ttl: u32,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        if default_ttl == 0 || high_priority_ttl == 0 || low_priority_ttl == 0 {
            return Err(Error::InvalidState);
        }
        env.storage().instance().set(
            &DataKey::RequestTTL,
            &TTLConfig {
                default_ttl,
                high_priority_ttl,
                low_priority_ttl,
            },
        );
        Ok(())
    }

    pub fn get_warning_threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::ExpirationWarningLedgers)
            .unwrap_or(DEFAULT_EXPIRATION_WARNING_LEDGERS)
    }

    pub fn update_warning_threshold(env: Env, ledgers: u32) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        if ledgers == 0 {
            return Err(Error::InvalidState);
        }
        env.storage()
            .instance()
            .set(&DataKey::ExpirationWarningLedgers, &ledgers);
        Ok(())
    }

    pub fn check_expiration_warning(env: Env, id: u64) -> bool {
        let threshold = Self::get_warning_threshold(env.clone());
        let expires_at_ledger: u32 = match env
            .storage()
            .temporary()
            .get(&DataKey::RequestExpiresAtLedger(id))
        {
            Some(l) => l,
            None => return false,
        };
        let remaining = expires_at_ledger.saturating_sub(env.ledger().sequence());
        if remaining <= threshold {
            env.events()
                .publish((Symbol::new(&env, "expiring_soon"),), (id, remaining));
            return true;
        }
        false
    }

    pub fn cancel_request(env: Env, id: u64) -> Result<(), Error> {
        let mut req: VerificationRequest = env
            .storage()
            .temporary()
            .get(&DataKey::Request(id))
            .ok_or(Error::RequestNotFound)?;

        req.requester.require_auth();

        if req.state != RequestState::Pending {
            return Err(Error::InvalidState);
        }

        Self::remove_request_from_state_index(&env, &req.state, id);
        req.state = RequestState::Cancelled;
        Self::add_request_to_state_index(&env, &RequestState::Cancelled, id);
        env.storage().temporary().set(&DataKey::Request(id), &req);
        env.events().publish((Symbol::new(&env, "cancelled"),), id);
        Ok(())
    }

    pub fn submit_batch_request(
        env: Env,
        requests: Vec<(Bytes, Bytes, Address, Priority)>,
    ) -> Result<Vec<u64>, Error> {
        if requests.len() > 10 {
            return Err(Error::BatchSizeExceeded);
        }

        if Self::is_paused(env.clone()) {
            return Err(Error::ContractPaused);
        }

        let ttl_config: TTLConfig = env
            .storage()
            .instance()
            .get(&DataKey::RequestTTL)
            .unwrap_or(TTLConfig {
                default_ttl: DEFAULT_REQUEST_TTL_LEDGERS,
                high_priority_ttl: 200,
                low_priority_ttl: 50,
            });

        let mut ids: Vec<u64> = vec![&env];

        for i in 0..requests.len() {
            let (storage_ref, manifest_hash, requester, priority) = requests.get(i).unwrap();
            requester.require_auth();

            let ttl = match priority {
                Priority::Low => ttl_config.low_priority_ttl,
                Priority::High | Priority::Urgent => ttl_config.high_priority_ttl,
                Priority::Normal => ttl_config.default_ttl,
            };

            let id: u64 = env
                .storage()
                .instance()
                .get(&DataKey::NextRequestId)
                .unwrap_or(0u64)
                + 1;
            env.storage().instance().set(&DataKey::NextRequestId, &id);

            let req = VerificationRequest {
                storage_ref: storage_ref.clone(),
                manifest_hash: manifest_hash.clone(),
                requester: requester.clone(),
                state: RequestState::Pending,
                priority: priority.clone(),
                comment: None,
            };

            env.storage().temporary().set(&DataKey::Request(id), &req);
            env.storage()
                .temporary()
                .extend_ttl(&DataKey::Request(id), ttl, ttl);

            let expires_at_ledger = env.ledger().sequence() + ttl;
            env.storage()
                .temporary()
                .set(&DataKey::RequestExpiresAtLedger(id), &expires_at_ledger);
            env.storage()
                .temporary()
                .extend_ttl(&DataKey::RequestExpiresAtLedger(id), ttl, ttl);

            Self::add_request_to_state_index(&env, &RequestState::Pending, id);
            ids.push_back(id);
        }

        env.events()
            .publish((Symbol::new(&env, "batch_submitted"),), ids.clone());
        Ok(ids)
    }

    // -----------------------------------------------------------------------
    // Pagination / queries
    // -----------------------------------------------------------------------

    pub fn get_requests_by_state(
        env: Env,
        state: RequestState,
        offset: u32,
        limit: u32,
        requester: Option<Address>,
    ) -> PaginatedRequests {
        let all_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RequestsByState(state.clone()))
            .unwrap_or(vec![&env]);

        let mut results: Vec<RequestWithId> = vec![&env];
        let mut count = 0u32;
        let limit_val = if limit == 0 { 100 } else { limit.min(100) };
        let start = offset;

        if start >= all_ids.len() {
            return PaginatedRequests {
                requests: results,
                total_count: all_ids.len(),
            };
        }

        for i in start..all_ids.len() {
            if count >= limit_val {
                break;
            }
            let req_id = all_ids.get(i).unwrap();
            if let Some(req) = env
                .storage()
                .temporary()
                .get::<_, VerificationRequest>(&DataKey::Request(req_id))
            {
                if let Some(ref addr) = requester {
                    if req.requester != *addr {
                        continue;
                    }
                }
                results.push_back(RequestWithId {
                    id: req_id,
                    request: req,
                });
                count += 1;
            }
        }

        PaginatedRequests {
            requests: results,
            total_count: all_ids.len(),
        }
    }

    // -----------------------------------------------------------------------
    // Archival
    // -----------------------------------------------------------------------

    pub fn archive_old_requests(env: Env) -> u32 {
        let current_ledger = env.ledger().sequence();
        let last_archival: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::LastArchivalLedger)
            .unwrap_or(0u32);
        if current_ledger < last_archival + ARCHIVAL_THRESHOLD_LEDGERS {
            return 0;
        }
        let mut archived_count = 0u32;
        let next_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextRequestId)
            .unwrap_or(0u64);
        for i in 1..=next_id {
            if let Some(req) = env
                .storage()
                .temporary()
                .get::<_, VerificationRequest>(&DataKey::Request(i))
            {
                let archived = ArchivedRequest {
                    request: req,
                    archived_at_ledger: current_ledger,
                };
                env.storage()
                    .persistent()
                    .set(&DataKey::ArchivedRequest(i), &archived);
                env.storage().temporary().remove(&DataKey::Request(i));
                env.events().publish((Symbol::new(&env, "archived"),), i);
                archived_count += 1;
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::LastArchivalLedger, &current_ledger);
        archived_count
    }

    pub fn get_archived_request(env: Env, id: u64) -> Option<ArchivedRequest> {
        env.storage()
            .persistent()
            .get(&DataKey::ArchivedRequest(id))
    }

    pub fn get_last_archival_ledger(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::LastArchivalLedger)
            .unwrap_or(0u32)
    }

    pub fn get_provider_metrics(env: Env, provider: Address) -> Option<ProviderSLA> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderSLA(provider))
    }
    // -----------------------------------------------------------------------
    // Attestation
    // -----------------------------------------------------------------------

    pub fn verify_tee_hash(env: Env, tee_hash: BytesN<32>) -> Result<(), Error> {
        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::RegistryNotConfigured)?;
        let approved: bool = env.invoke_contract(
            &registry,
            &Symbol::new(&env, "is_tee_hash_approved"),
            vec![&env, tee_hash.into()],
        );

        if !approved {
            return Err(Error::TeeNotVerified);
        }
        Ok(())
    }

    pub fn verify_attestation(
        env: Env,
        provider: BytesN<32>,
        tee_hash: BytesN<32>,
        payload: Bytes,
        signature: BytesN<64>,
    ) -> Result<(), Error> {
        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .ok_or(Error::RegistryNotConfigured)?;
        let provider_ok: bool = env.invoke_contract(
            &registry,
            &Symbol::new(&env, "is_provider"),
            vec![&env, provider.clone().into()],
        );
        if !provider_ok {
            return Err(Error::UnauthorizedSigner);
        }

        let tee_ok: bool = env.invoke_contract(
            &registry,
            &Symbol::new(&env, "is_tee_hash_approved"),
            vec![&env, tee_hash.into()],
        );
        if !tee_ok {
            return Err(Error::TeeNotVerified);
        }
        env.crypto().ed25519_verify(&provider, &payload, &signature);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // Feature 1 — SLA metrics, compliance, alerts, auto-suspend
    // -----------------------------------------------------------------------

    /// Admin sets or resets SLA targets for a provider.
    pub fn set_provider_sla(
        env: Env,
        provider: Address,
        target_response_time_seconds: u32,
        target_uptime_percentage: u32,
        target_success_rate: u32,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let existing: ProviderSLA = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderSLA(provider.clone()))
            .unwrap_or(ProviderSLA {
                target_response_time_seconds: 0,
                target_uptime_percentage: 0,
                target_success_rate: 0,
                actual_response_time: 0,
                actual_uptime: 100,
                actual_success_rate: 100,
                total_requests: 0,
                successful: 0,
                total_response_sum: 0,
            });

        let updated = ProviderSLA {
            target_response_time_seconds,
            target_uptime_percentage,
            target_success_rate,
            ..existing
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderSLA(provider), &updated);
        Ok(())
    }

    /// Called after each verification to update actual performance metrics.
    /// `response_time_seconds` is how long the provider took to respond.
    /// `uptime_sample` is 100 if the provider was reachable, 0 if it was down.
    pub fn record_verification(
        env: Env,
        provider: Address,
        success: bool,
        response_time_seconds: u32,
        uptime_sample: u32,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut sla: ProviderSLA = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderSLA(provider.clone()))
            .ok_or(Error::ProviderNotRegistered)?;

        sla.total_requests += 1;
        if success {
            sla.successful += 1;
        }
        sla.total_response_sum += response_time_seconds as u64;

        // Rolling averages
        sla.actual_response_time = (sla.total_response_sum / sla.total_requests) as u32;
        sla.actual_success_rate = ((sla.successful * 100) / sla.total_requests) as u32;

        // Uptime: exponential moving average (weight = 1 / total_requests, capped at 0.1)
        // For simplicity use a simple running mean capped to [0, 100].
        let n = sla.total_requests;
        sla.actual_uptime =
            (((sla.actual_uptime as u64).saturating_mul(n - 1) + uptime_sample as u64) / n) as u32;

        env.storage()
            .persistent()
            .set(&DataKey::ProviderSLA(provider.clone()), &sla);

        // Emit violation events for each breached target
        if sla.actual_response_time > sla.target_response_time_seconds
            && sla.target_response_time_seconds > 0
        {
            env.events().publish(
                (Symbol::new(&env, "sla_violation"), provider.clone()),
                (
                    Symbol::new(&env, "response_time"),
                    sla.actual_response_time,
                    sla.target_response_time_seconds,
                ),
            );
        }
        if sla.actual_success_rate < sla.target_success_rate && sla.target_success_rate > 0 {
            env.events().publish(
                (Symbol::new(&env, "sla_violation"), provider.clone()),
                (
                    Symbol::new(&env, "success_rate"),
                    sla.actual_success_rate,
                    sla.target_success_rate,
                ),
            );
        }
        if sla.actual_uptime < sla.target_uptime_percentage && sla.target_uptime_percentage > 0 {
            env.events().publish(
                (Symbol::new(&env, "sla_violation"), provider.clone()),
                (
                    Symbol::new(&env, "uptime"),
                    sla.actual_uptime,
                    sla.target_uptime_percentage,
                ),
            );
        }

        // Auto-suspend check
        let compliance = Self::_compliance_percent(&sla);
        if compliance < SLA_SUSPENSION_THRESHOLD {
            env.storage()
                .persistent()
                .set(&DataKey::ProviderSuspended(provider.clone()), &true);
            env.events().publish(
                (Symbol::new(&env, "provider_auto_suspended"),),
                (provider, compliance),
            );
        }

        Ok(())
    }

    /// Returns SLA compliance summary for a provider.
    pub fn get_sla_compliance(env: Env, provider: Address) -> Result<SLACompliance, Error> {
        let sla: ProviderSLA = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderSLA(provider.clone()))
            .ok_or(Error::ProviderNotRegistered)?;

        let response_time_ok = sla.target_response_time_seconds == 0
            || sla.actual_response_time <= sla.target_response_time_seconds;
        let uptime_ok =
            sla.target_uptime_percentage == 0 || sla.actual_uptime >= sla.target_uptime_percentage;
        let success_rate_ok =
            sla.target_success_rate == 0 || sla.actual_success_rate >= sla.target_success_rate;

        let suspended: bool = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderSuspended(provider))
            .unwrap_or(false);

        Ok(SLACompliance {
            response_time_ok,
            uptime_ok,
            success_rate_ok,
            compliance_percent: Self::_compliance_percent(&sla),
            suspended,
        })
    }

    /// Admin can manually reinstate a suspended provider after remediation.
    pub fn reinstate_provider(env: Env, provider: Address) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::ProviderSuspended(provider));
        Ok(())
    }

    pub fn is_provider_suspended(env: Env, provider: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderSuspended(provider))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Feature 2 — Cost estimation with per-provider pricing
    // -----------------------------------------------------------------------

    /// Admin configures pricing for a provider.
    pub fn set_provider_pricing(
        env: Env,
        provider: Address,
        base_fee_stroops: u128,
        per_kb_fee_stroops: u128,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().persistent().set(
            &DataKey::ProviderPricing(provider),
            &ProviderPricing {
                base_fee_stroops,
                per_kb_fee_stroops,
            },
        );
        Ok(())
    }

    pub fn get_provider_pricing(env: Env, provider: Address) -> Option<ProviderPricing> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderPricing(provider))
    }

    /// Estimate the cost of a verification request.
    ///
    /// - `provider`          — the provider that would fulfil the request
    /// - `content_size_bytes` — byte length of the content to be verified
    /// - `priority`          — priority level of the request
    /// - `complexity`        — content-processing complexity hint
    ///
    /// Returns a `CostEstimate` with a per-component breakdown.
    pub fn estimate_cost(
        env: Env,
        provider: Address,
        content_size_bytes: u64,
        priority: Priority,
        complexity: ContentComplexity,
    ) -> Result<CostEstimate, Error> {
        let pricing: ProviderPricing = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderPricing(provider))
            .ok_or(Error::PricingNotSet)?;

        let base_fee = pricing.base_fee_stroops;

        // Size fee: per-KB charge, rounded up to nearest KB
        let kb = content_size_bytes.saturating_add(1023) / 1024;
        let size_fee: u128 = pricing.per_kb_fee_stroops.saturating_mul(kb as u128);

        // Priority multiplier applied to the base fee
        let priority_fee: u128 = base_fee.saturating_mul(match priority {
            Priority::Low => 0,
            Priority::Normal => 0,
            Priority::High => 50,    // +50 %
            Priority::Urgent => 150, // +150 %
        }) / 100;

        // Complexity surcharge on the base fee
        let complexity_fee: u128 = base_fee.saturating_mul(match complexity {
            ContentComplexity::Simple => 0,
            ContentComplexity::Moderate => 25, // +25 %
            ContentComplexity::Complex => 75,  // +75 %
        }) / 100;

        let total = base_fee
            .saturating_add(size_fee)
            .saturating_add(priority_fee)
            .saturating_add(complexity_fee);

        Ok(CostEstimate {
            base_fee,
            size_fee,
            priority_fee,
            complexity_fee,
            total,
        })
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    fn _compliance_percent(sla: &ProviderSLA) -> u32 {
        let mut met: u32 = 0;
        let mut total: u32 = 0;

        if sla.target_response_time_seconds > 0 {
            total += 1;
            if sla.actual_response_time <= sla.target_response_time_seconds {
                met += 1;
            }
        }
        if sla.target_uptime_percentage > 0 {
            total += 1;
            if sla.actual_uptime >= sla.target_uptime_percentage {
                met += 1;
            }
        }
        if sla.target_success_rate > 0 {
            total += 1;
            if sla.actual_success_rate >= sla.target_success_rate {
                met += 1;
            }
        }

        if total == 0 {
            return 100;
        }
        (met * 100) / total
    }

    // Private helpers
    // -----------------------------------------------------------------------

    /// Shared logic behind `submit_request` and `submit_request_as_delegate`:
    /// allocates an id, stores the pending request, and indexes it. Does
    /// NOT perform auth — callers are responsible for authorizing themselves
    /// (the requester for `submit_request`, the delegate for
    /// `submit_request_as_delegate`) before calling this.
    fn create_pending_request(
        env: &Env,
        storage_ref: Bytes,
        manifest_hash: Bytes,
        requester: Address,
        priority: Priority,
    ) -> Result<u64, Error> {
        if Self::is_paused(env.clone()) {
            return Err(Error::ContractPaused);
        }

        let ttl_config: TTLConfig = env
            .storage()
            .instance()
            .get(&DataKey::RequestTTL)
            .unwrap_or(TTLConfig {
                default_ttl: DEFAULT_REQUEST_TTL_LEDGERS,
                high_priority_ttl: 200,
                low_priority_ttl: 50,
            });
        let ttl = match priority {
            Priority::Low => ttl_config.low_priority_ttl,
            Priority::High | Priority::Urgent => ttl_config.high_priority_ttl,
            Priority::Normal => ttl_config.default_ttl,
        };

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextRequestId)
            .unwrap_or(0u64)
            + 1;
        env.storage().instance().set(&DataKey::NextRequestId, &id);

        let req = VerificationRequest {
            storage_ref,
            manifest_hash,
            requester: requester.clone(),
            state: RequestState::Pending,
            priority,
            comment: None,
        };

        env.storage().temporary().set(&DataKey::Request(id), &req);
        env.storage()
            .temporary()
            .extend_ttl(&DataKey::Request(id), ttl, ttl);

        let expires_at_ledger = env.ledger().sequence() + ttl;
        env.storage()
            .temporary()
            .set(&DataKey::RequestExpiresAtLedger(id), &expires_at_ledger);
        env.storage()
            .temporary()
            .extend_ttl(&DataKey::RequestExpiresAtLedger(id), ttl, ttl);

        Self::add_request_to_state_index(env, &RequestState::Pending, id);

        let fee = Self::calculate_priority_fee(&req.priority);
        env.events()
            .publish((Symbol::new(env, "submitted"),), (id, fee));
        Ok(id)
    }

    fn calculate_priority_fee(priority: &Priority) -> u64 {
        match priority {
            Priority::Low => 100,
            Priority::Normal => 200,
            Priority::High => 400,
            Priority::Urgent => 800,
        }
    }

    fn add_request_to_state_index(env: &Env, state: &RequestState, id: u64) {
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RequestsByState(state.clone()))
            .unwrap_or(vec![env]);
        ids.push_back(id);
        env.storage()
            .persistent()
            .set(&DataKey::RequestsByState(state.clone()), &ids);
    }

    fn remove_request_from_state_index(env: &Env, state: &RequestState, id: u64) {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::RequestsByState(state.clone()))
            .unwrap_or(vec![env]);
        let mut new_ids: Vec<u64> = vec![env];
        for i in 0..ids.len() {
            if ids.get(i).unwrap() != id {
                new_ids.push_back(ids.get(i).unwrap());
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::RequestsByState(state.clone()), &new_ids);
    }

    // -----------------------------------------------------------------------
    // #449 – Request Comments Management
    // -----------------------------------------------------------------------

    /// #449 — Add or update a comment on a verification request.
    /// The requester must authenticate and the request must exist and be in Pending state.
    pub fn add_request_comment(env: Env, request_id: u64, comment: String) -> Result<(), Error> {
        let mut request: VerificationRequest = env
            .storage()
            .temporary()
            .get(&DataKey::Request(request_id))
            .ok_or(Error::RequestNotFound)?;

        request.requester.require_auth();

        if request.state != RequestState::Pending {
            return Err(Error::InvalidState);
        }

        request.comment = Some(comment.clone());
        env.storage()
            .temporary()
            .set(&DataKey::Request(request_id), &request);

        env.events().publish(
            (
                Symbol::new(&env, "request_comment"),
                request_id,
                request.requester.clone(),
            ),
            (comment, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// #449 — Retrieve the comment on a verification request, if any.
    pub fn get_request_comment(env: Env, request_id: u64) -> Result<Option<String>, Error> {
        let request: VerificationRequest = env
            .storage()
            .temporary()
            .get(&DataKey::Request(request_id))
            .ok_or(Error::RequestNotFound)?;

        Ok(request.comment)
    }

    /// #449 — Clear/remove a comment from a verification request.
    /// The requester must authenticate.
    pub fn remove_request_comment(env: Env, request_id: u64) -> Result<(), Error> {
        let mut request: VerificationRequest = env
            .storage()
            .temporary()
            .get(&DataKey::Request(request_id))
            .ok_or(Error::RequestNotFound)?;

        request.requester.require_auth();

        request.comment = None;
        env.storage()
            .temporary()
            .set(&DataKey::Request(request_id), &request);

        env.events()
            .publish((Symbol::new(&env, "comment_removed"),), request_id);

        Ok(())
    }

    // -----------------------------------------------------------------------
    // #671 — Dispute evidence anchoring
    // -----------------------------------------------------------------------

    /// Anchor the hash of an off-chain evidence package against a dispute.
    ///
    /// Callable by the admin, the dispute's requester, or the disputed
    /// provider. Packages are append-only; re-packaging after new evidence
    /// adds a new anchor so the full history is preserved.
    pub fn anchor_dispute_evidence(
        env: Env,
        dispute_id: u64,
        package_hash: BytesN<32>,
        submitter: Address,
    ) -> Result<u32, Error> {
        submitter.require_auth();

        let dispute: Dispute = env
            .storage()
            .persistent()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)?;

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;

        if submitter != admin && submitter != dispute.requester && submitter != dispute.provider {
            return Err(Error::Unauthorized);
        }

        let mut anchors: Vec<EvidenceAnchor> = env
            .storage()
            .persistent()
            .get(&DataKey::DisputeEvidence(dispute_id))
            .unwrap_or(Vec::new(&env));

        if anchors.len() >= MAX_EVIDENCE_ANCHORS {
            return Err(Error::InvalidState);
        }
        for i in 0..anchors.len() {
            if anchors.get_unchecked(i).package_hash == package_hash {
                // Idempotent: the same package was already anchored.
                return Ok(i);
            }
        }

        anchors.push_back(EvidenceAnchor {
            package_hash: package_hash.clone(),
            submitter: submitter.clone(),
            anchored_at_ledger: env.ledger().sequence(),
        });
        let index = anchors.len() - 1;
        env.storage()
            .persistent()
            .set(&DataKey::DisputeEvidence(dispute_id), &anchors);

        env.events().publish(
            (Symbol::new(&env, "dispute_evidence_anchored"),),
            (dispute_id, package_hash, submitter),
        );
        Ok(index)
    }

    /// All evidence package anchors for a dispute, oldest first.
    pub fn get_dispute_evidence(env: Env, dispute_id: u64) -> Vec<EvidenceAnchor> {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeEvidence(dispute_id))
            .unwrap_or(Vec::new(&env))
    }

    // -----------------------------------------------------------------------
    // #668 — Provider trust score
    // -----------------------------------------------------------------------

    /// Computes a trust score for a provider from on-chain state: smoothed
    /// verification outcomes, dispute history, SLA compliance and stake.
    /// Suspended providers are heavily penalised.
    pub fn get_provider_trust_score(
        env: Env,
        provider: Address,
    ) -> Result<ProviderTrustScore, Error> {
        if !Self::is_provider(env.clone(), provider.clone()) {
            return Err(Error::ProviderNotRegistered);
        }

        // Outcomes — Beta-prior smoothed success rate.
        let metrics: ProviderMetrics = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderMetrics(provider.clone()))
            .unwrap_or(ProviderMetrics {
                total_verifications: 0,
                successful_verifications: 0,
                failed_verifications: 0,
                last_activity: 0,
            });
        let outcome_bps = ((metrics.successful_verifications.saturating_mul(10_000)
            + TRUST_PRIOR_BPS * TRUST_PRIOR_WEIGHT)
            / (metrics.total_verifications + TRUST_PRIOR_WEIGHT)) as u32;
        let outcome_bps = outcome_bps.min(10_000);

        // Disputes — only provider-fault resolutions and open disputes count.
        let dispute_ids = Self::get_disputes_by_provider(env.clone(), provider.clone());
        let mut provider_fault_disputes: u32 = 0;
        let mut open_disputes: u32 = 0;
        let len = dispute_ids.len();
        let start = len.saturating_sub(TRUST_MAX_DISPUTES_SCANNED);
        for i in start..len {
            let id = dispute_ids.get_unchecked(i);
            if let Some(d) = env
                .storage()
                .persistent()
                .get::<DataKey, Dispute>(&DataKey::Dispute(id))
            {
                if d.state == DisputeState::Open {
                    open_disputes += 1;
                } else if d.resolution == DisputeResolution::ProviderFault {
                    provider_fault_disputes += 1;
                }
            }
        }
        let dispute_penalty = provider_fault_disputes
            .saturating_mul(TRUST_FAULT_PENALTY_BPS)
            .saturating_add(open_disputes.saturating_mul(TRUST_OPEN_PENALTY_BPS));
        let dispute_bps = 10_000u32.saturating_sub(dispute_penalty);

        // SLA — compliance percentage, or the neutral prior when no SLA is set.
        let sla_bps = match env
            .storage()
            .persistent()
            .get::<DataKey, ProviderSLA>(&DataKey::ProviderSLA(provider.clone()))
        {
            Some(sla) => Self::_compliance_percent(&sla).min(100) * 100,
            None => TRUST_PRIOR_BPS as u32,
        };

        // Stake — 50% credit at MINIMUM_STAKE rising linearly to 100% at 10×.
        let stake = Self::get_provider_stake(env.clone(), provider.clone());
        let stake_bps: u32 = if stake < MINIMUM_STAKE {
            0
        } else {
            let extra = (stake - MINIMUM_STAKE).min(MINIMUM_STAKE * 9);
            5_000 + ((extra * 5_000) / (MINIMUM_STAKE * 9)) as u32
        };

        let weighted = (outcome_bps as u64 * TRUST_WEIGHT_OUTCOME
            + dispute_bps as u64 * TRUST_WEIGHT_DISPUTE
            + sla_bps as u64 * TRUST_WEIGHT_SLA
            + stake_bps as u64 * TRUST_WEIGHT_STAKE)
            / 100;
        let suspended = Self::is_provider_suspended(env.clone(), provider.clone());
        let mut score_bps = weighted as u32;
        if suspended {
            score_bps = score_bps * TRUST_SUSPENDED_MULTIPLIER / 100;
        }

        let tier = if suspended || score_bps < 4_000 {
            0
        } else if score_bps < 6_500 || metrics.total_verifications < 10 {
            1
        } else if score_bps < 8_500 {
            2
        } else {
            3
        };

        Ok(ProviderTrustScore {
            score_bps,
            tier,
            outcome_bps,
            dispute_bps,
            sla_bps,
            stake_bps,
            total_verifications: metrics.total_verifications,
            provider_fault_disputes,
            open_disputes,
            suspended,
        })
    }

    /// #449 — Query all pending requests that have comments (supports discovery).
    pub fn get_requests_with_comments(env: Env, offset: u32, limit: u32) -> Vec<RequestWithId> {
        let all_requests: Vec<RequestWithId> = env
            .storage()
            .temporary()
            .get(&DataKey::RequestsByState(RequestState::Pending))
            .unwrap_or(Vec::new(&env));

        let mut results: Vec<RequestWithId> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        for i in 0..all_requests.len() {
            if count >= limit {
                break;
            }
            let req_with_id = all_requests.get_unchecked(i);
            if req_with_id.request.comment.is_some() {
                if skipped >= offset {
                    results.push_back(req_with_id);
                    count += 1;
                } else {
                    skipped += 1;
                }
            }
        }

        results
    }
}

mod test;

// #654 — integration tests covering multi-step workflows, storage mutations,
// event emission, and error paths across the oracle contract.
#[cfg(test)]
mod integration_tests;

// #807 — repeatable cost benchmark for the most-used calls. Run via scripts/benchmark-contracts.mjs.
#[cfg(test)]
mod benchmark;
