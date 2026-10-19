#![no_std]

//! # StellarVeriphy — Registry Contract
//!
//! Maintains the on-chain registry of:
//! - **Approved TEE code hashes** — SHA-256 digests of trusted enclave
//!   binaries accepted by the oracle contract during attestation.
//! - **Authorised oracle provider public keys** — Ed25519 keys whose
//!   attestation signatures are considered trustworthy.
//!
//! ## Architecture
//!
//! The registry acts as the *root of trust* for the whole StellarVeriphy
//! system.  Before any oracle provider can submit an attestation, the
//! [`OracleContract`] calls back into this registry to confirm that:
//!
//! 1. The TEE binary hash supplied in the attestation is listed here.
//! 2. The provider public key is registered and not blacklisted.
//!
//! ## Storage model
//!
//! | Key pattern | Storage type | Lifetime |
//! |---|---|---|
//! | `DataKey::Admin` | `instance` | contract lifetime |
//! | `DataKey::TeeHash(hash)` | `persistent` | until explicitly removed |
//! | `DataKey::Provider(key)` | `persistent` | until removed / blacklisted |
//! | `DataKey::Application(id)` | `persistent` | until reviewed |
//! | `DataKey::Proposal(id)` | `persistent` | until executed or expired |
//!
//! ## Multi-sig governance
//!
//! Administrative operations (adding / removing TEE hashes and providers)
//! can optionally be gated behind a multi-sig `threshold` so that no single
//! admin can unilaterally change the trust anchor set.
//!
//! ## Example (off-chain SDK call)
//!
//! ```ignore
//! // Check if a TEE hash is approved before submitting an attestation
//! let approved = registry_client.is_tee_hash_approved(&env, &tee_hash);
//! assert!(approved);
//! ```

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
    String, Symbol, Vec,
};

// ---------------------------------------------------------------------------
// #24 – provenance cross-contract client
// ---------------------------------------------------------------------------

mod provenance {
    use soroban_sdk::{contractclient, contracttype, Address, Bytes, Env, String, Vec};

    #[contracttype]
    pub struct ProvenanceCert {
        pub storage_ref: Bytes,
        pub manifest_hash: Bytes,
        pub attestation_hash: Bytes,
        pub creator: Address,
        pub timestamp: u64,
    }

    #[contracttype]
    pub struct CertificateMetadata {
        pub display_name: String,
        pub description: String,
        pub version: u32,
    }

    // Only the generated `ProvenanceClient` is used; the trait itself is never named.
    #[allow(dead_code)]
    #[contractclient(name = "ProvenanceClient")]
    pub trait ProvenanceContract {
        fn mint(
            env: Env,
            storage_ref: Bytes,
            manifest_hash: Bytes,
            attestation_hash: Bytes,
            to: Address,
        ) -> u64;

        // #172 - Certificate Transfer
        fn transfer_certificate(env: Env, certificate_id: u64, new_owner: Address);

        // #173 - Metadata Updates
        fn update_metadata(
            env: Env,
            certificate_id: u64,
            display_name: String,
            description: String,
        );

        fn get_metadata(env: Env, certificate_id: u64) -> CertificateMetadata;

        // #174 - Query by Time Range
        fn get_certificates_by_time_range(
            env: Env,
            start_time: u64,
            end_time: u64,
            offset: u32,
            limit: u32,
        ) -> Vec<(u64, ProvenanceCert)>;

        // #175 - Batch Minting
        fn mint_batch(
            env: Env,
            storage_refs: Vec<Bytes>,
            manifest_hashes: Vec<Bytes>,
            attestation_hashes: Vec<Bytes>,
            to: Address,
        ) -> Vec<u64>;
    }
}

// ---------------------------------------------------------------------------
// Time constants
// ---------------------------------------------------------------------------

const SECONDS_PER_DAY: u64 = 86_400;
const TEE_HASH_VALIDITY: u64 = 180 * SECONDS_PER_DAY; // #191
const TEE_WARNING_PERIOD: u64 = 14 * SECONDS_PER_DAY; // #191
const PROVIDER_GRACE_PERIOD: u64 = 30 * SECONDS_PER_DAY; // #190
                                                         // Errors
                                                         // ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    NotInitialized = 1,
    Unauthorized = 2,
    InvalidThreshold = 3,
    ProposalNotFound = 4,
    ProposalExpired = 5,
    InsufficientApprovals = 6,
    TeeHashNotFound = 7,
    ProviderNotFound = 8,
    CertificateExpired = 9,
    ProviderBlacklisted = 10,
    NotBlacklisted = 11,
    CapacityExceeded = 12,
    InvalidCapacity = 13,
    GroupNotFound = 14,
}

// ---------------------------------------------------------------------------
// Storage keys  (#21 Provider variant, #23 typed BytesN<32> keys)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Storage keys  (#21 Provider variant, #23 typed BytesN<32> keys)
// #439 — deduplicated and compacted: each variant appears exactly once.
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    // ── singleton config (instance storage) ──────────────────────────────
    Admin,
    Provenance,
    MultisigThreshold,
    MultisigAdmins,
    NextProposalId,
    TeeHashVersionHistory, // #187
    ApplicationCount,      // #189
    GroupCount,            // #454
    // ── per-TEE-hash (persistent storage) ────────────────────────────────
    TeeHash(BytesN<32>),            // #23 — approved flag
    TeeHashInfo(BytesN<32>),        // #191 — expiry / warning metadata
    TeeHashMigration(BytesN<32>),   // #191 — migration state
    TeeHashVersionInfo(BytesN<32>), // #187 — versioning
    TeeHashesByVersion(u32),        // #187 — index by version number
    TeeHashCertRef(BytesN<32>),     // certificate reference on a TEE hash
    // ── per-provider (persistent storage) ────────────────────────────────
    Provider(BytesN<32>),                // #21 — approved flag
    ProviderInfo(BytesN<32>),            // #188 / #190 — extended info
    ProviderList,                        // #186 / #188 — full list
    ProviderReputation(BytesN<32>),      // #186
    ProviderRegions(BytesN<32>),         // #192
    ProviderCapacity(BytesN<32>),        // #193
    ProviderSpecializations(BytesN<32>), // #194
    ProviderBlacklist(BytesN<32>),       // #195
    ProviderGroups(BytesN<32>),          // #454 — reverse index: provider -> group ids
    // ── multisig governance ───────────────────────────────────────────────
    Proposal(u64),
    ProposalApprovals(u64),
    // ── provider applications ─────────────────────────────────────────────
    Application(u64), // #189
    // ── provider groups ────────────────────────────────────────────────────
    ProviderGroup(u64), // #454
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalOperation {
    AddProvider(BytesN<32>),
    RemoveProvider(BytesN<32>),
    AddTeeHash(BytesN<32>),
    UpdateThreshold(u32),
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u64,
    pub operation: ProposalOperation,
    pub proposer: Address,
    pub created_ledger: u32,
    pub execution_ledger: u32,
    pub executed: bool,
}

// ---------------------------------------------------------------------------
// #187 – TEE hash versioning
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct TeeHashVersionInfo {
    pub code_hash: BytesN<32>,
    pub version: u32,
    pub added_at: u64,
    pub deprecated: bool,
    pub deprecated_at: Option<u64>,
}

// ---------------------------------------------------------------------------
// #186 – Provider reputation system
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderReputation {
    pub score: u32,
    pub total_verifications: u64,
    pub successful_count: u64,
    pub failed_count: u64,
    pub last_updated: u64,
}

const REPUTATION_MAX_SCORE: u32 = 1000;
const REPUTATION_DECAY_PERIOD_SECS: u64 = 2_592_000; // 30 days
const REPUTATION_DECAY_AMOUNT: u32 = 50;

// ---------------------------------------------------------------------------
// #192 – Provider geographic distribution
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Region {
    NorthAmerica,
    Europe,
    Asia,
    SouthAmerica,
    Africa,
    Oceania,
}

// ---------------------------------------------------------------------------
// #193 – Provider capacity management
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderCapacity {
    pub max_concurrent: u32,
    pub active_requests: u32,
}

// ---------------------------------------------------------------------------
// #194 – Provider specialization tags
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Specialization {
    ImageVerification,
    VideoVerification,
    DocumentVerification,
    AiDetection,
    AudioVerification,
}

// ---------------------------------------------------------------------------
// #195 – Provider blacklist / whitelist
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct BlacklistEntry {
    pub reason_code: u32,
    pub blacklisted_at: u64,
}

// ---------------------------------------------------------------------------
// #24 – VerificationResult
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct VerificationResult {
    pub success: bool,
    pub content_hash: BytesN<32>,
    pub certificate_id: u64,
    pub state: String,
}

// ---------------------------------------------------------------------------
// #188 – provider service tiers
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum ServiceTier {
    Basic,
    Standard,
    Premium,
}

// ---------------------------------------------------------------------------
// #190 – provider lifecycle status
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum ProviderStatus {
    Active,
    Deactivating(u64), // grace-period end timestamp
    Removed,
}

#[contracttype]
#[derive(Clone)]
pub struct ProviderInfo {
    pub tier: ServiceTier,
    pub status: ProviderStatus,
    // #451 — Provider metadata for discovery and contact
    pub name: String,
    pub website: Option<String>,
    pub description: String,
}

// ---------------------------------------------------------------------------
// #189 – provider onboarding
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub enum ApplicationStatus {
    Pending,
    Approved,
    Rejected,
}

#[contracttype]
#[derive(Clone)]
pub struct ProviderApplication {
    pub applicant: Address,
    pub provider_key: BytesN<32>,
    pub metadata: String,
    pub status: ApplicationStatus,
    pub submitted_at: u64,
}

// ---------------------------------------------------------------------------
// #191 – TEE hash rotation
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct TeeHashRecord {
    pub added_at: u64,
    pub expires_at: u64,
    pub rotated: bool,
}

// ---------------------------------------------------------------------------
// Feature 3 – Attestation certificate references on TEE hash entries
// ---------------------------------------------------------------------------

/// A DER/PEM certificate reference attached to an approved TEE code hash.
/// Stores enough metadata to validate freshness without holding the full cert.
#[contracttype]
#[derive(Clone, Debug)]
pub struct TeeHashCertRef {
    /// Human-readable identifier or fingerprint of the certificate issuer.
    pub issuer: String,
    /// Unix timestamp (seconds) from which the certificate is valid.
    pub valid_from: u64,
    /// Unix timestamp (seconds) at which the certificate expires.
    pub valid_until: u64,
    /// Optional external URI or IPFS reference to the full DER/PEM certificate.
    pub cert_uri: Option<String>,
    /// The TEE code hash this certificate covers.
    pub code_hash: BytesN<32>,
}

// ---------------------------------------------------------------------------
// #454 – Provider groups (organizational grouping of registered providers)
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProviderGroup {
    pub name: String,
    pub description: String,
    pub created_at: u64,
    pub members: Vec<BytesN<32>>,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    /// Register an approved TEE code hash.
    pub fn register(env: Env, admin: soroban_sdk::Address, code_hash: Bytes) {
        admin.require_auth();
        env.storage().persistent().set(&code_hash, &true);
        env.events()
            .publish((Symbol::new(&env, "registered"),), code_hash);
    }

    /// Check if a TEE code hash is approved.
    pub fn is_approved(env: Env, code_hash: Bytes) -> bool {
        env.storage().persistent().get(&code_hash).unwrap_or(false)
    }

    /// One-time initialisation.
    pub fn init(env: Env, admin: Address, provenance: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Provenance, &provenance);

        let mut admins: Vec<Address> = Vec::new(&env);
        admins.push_back(admin);
        env.storage()
            .instance()
            .set(&DataKey::MultisigAdmins, &admins);
        env.storage()
            .instance()
            .set(&DataKey::MultisigThreshold, &1u32);
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &1u64);
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    fn require_admin(env: &Env) -> Address {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
        admin
    }

    fn provider_info_or_default(env: &Env, provider: &BytesN<32>) -> ProviderInfo {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderInfo(provider.clone()))
            .unwrap_or(ProviderInfo {
                tier: ServiceTier::Basic,
                status: ProviderStatus::Active,
                name: String::from_str(env, ""),
                website: None,
                description: String::from_str(env, ""),
            })
    }

    // -----------------------------------------------------------------------
    // #22 / #23 / #191 – TEE hash registry with rotation policy
    // -----------------------------------------------------------------------

    /// Register an approved TEE code hash with a 180-day validity window.  #22 #23 #191
    pub fn add_tee_hash(env: Env, code_hash: BytesN<32>) {
        Self::require_admin(&env);
        Self::add_tee_hash_internal(&env, code_hash.clone());
        env.events()
            .publish((Symbol::new(&env, "tee_hash_added"),), code_hash);
    }

    // Shared storage-writing logic for `add_tee_hash`, factored out so
    // `rotate_tee_hash` can register the replacement hash without asking the
    // already-authorized admin to authorize a second time in the same call.
    fn add_tee_hash_internal(env: &Env, code_hash: BytesN<32>) {
        env.storage()
            .persistent()
            .set(&DataKey::TeeHash(code_hash.clone()), &true);
        let now = env.ledger().timestamp();
        let record = TeeHashRecord {
            added_at: now,
            expires_at: now + TEE_HASH_VALIDITY,
            rotated: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashInfo(code_hash.clone()), &record);
        env.events()
            .publish((Symbol::new(env, "tee_hash_added"),), code_hash);
    }

    /// Check whether a TEE code hash is approved, not rotated and not expired.  #22 #23 #191
    pub fn is_tee_hash_approved(env: Env, code_hash: BytesN<32>) -> bool {
        let registered = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHash(code_hash.clone()))
            .unwrap_or(false);
        if !registered {
            return false;
        }
        let record: Option<TeeHashRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashInfo(code_hash));
        match record {
            Some(record) => !record.rotated && env.ledger().timestamp() < record.expires_at,
            None => true,
        }
    }

    /// True once a hash has entered its pre-expiry warning window.  #191
    pub fn is_tee_hash_near_expiry(env: Env, code_hash: BytesN<32>) -> bool {
        let record: Option<TeeHashRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashInfo(code_hash));
        match record {
            Some(record) => {
                let now = env.ledger().timestamp();
                !record.rotated
                    && now < record.expires_at
                    && now + TEE_WARNING_PERIOD >= record.expires_at
            }
            None => false,
        }
    }

    /// Force-rotate an old TEE hash to a new one. The old hash is immediately
    /// invalidated and a migration pointer is stored so in-flight
    /// verifications can be redirected to the replacement hash.  #191
    pub fn rotate_tee_hash(env: Env, old_hash: BytesN<32>, new_hash: BytesN<32>) {
        Self::require_admin(&env);

        let mut old_record: TeeHashRecord = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashInfo(old_hash.clone()))
            .expect("Unknown TEE hash");
        old_record.rotated = true;
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashInfo(old_hash.clone()), &old_record);
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashMigration(old_hash.clone()), &new_hash);

        Self::add_tee_hash_internal(&env, new_hash.clone());
        env.events()
            .publish((symbol_short!("tee_rot"),), (old_hash, new_hash));
    }

    /// Look up the replacement hash for a rotated TEE hash, if any.  #191
    pub fn get_tee_hash_migration(env: Env, old_hash: BytesN<32>) -> Option<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::TeeHashMigration(old_hash))
    }

    // -----------------------------------------------------------------------
    // #21 / #188 / #190 – provider registry, service tiers & lifecycle
    // #187 – TEE hash versioning
    // -----------------------------------------------------------------------

    /// Register an approved TEE code hash with an explicit version (admin-gated).
    /// Multiple versions may be active simultaneously, and multiple hashes may
    /// share the same version.
    pub fn add_tee_hash_version(env: Env, code_hash: BytesN<32>, version: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::TeeHash(code_hash.clone()), &true);

        let info = TeeHashVersionInfo {
            code_hash: code_hash.clone(),
            version,
            added_at: env.ledger().timestamp(),
            deprecated: false,
            deprecated_at: None,
        };
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashVersionInfo(code_hash.clone()), &info);

        let version_key = DataKey::TeeHashesByVersion(version);
        let mut hashes: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&version_key)
            .unwrap_or(Vec::new(&env));
        if !hashes.contains(&code_hash) {
            hashes.push_back(code_hash);
            env.storage().persistent().set(&version_key, &hashes);
        }

        let mut history: Vec<TeeHashVersionInfo> = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashVersionHistory)
            .unwrap_or(Vec::new(&env));
        history.push_back(info);
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashVersionHistory, &history);
    }

    /// Deprecate a previously registered TEE code hash (admin-gated). The
    /// hash remains queryable but is flagged as deprecated; other active
    /// versions are unaffected.
    pub fn deprecate_tee_hash(env: Env, code_hash: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut info: TeeHashVersionInfo = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashVersionInfo(code_hash.clone()))
            .ok_or(Error::TeeHashNotFound)?;

        info.deprecated = true;
        info.deprecated_at = Some(env.ledger().timestamp());
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashVersionInfo(code_hash), &info);

        let mut history: Vec<TeeHashVersionInfo> = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashVersionHistory)
            .unwrap_or(Vec::new(&env));
        history.push_back(info);
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashVersionHistory, &history);

        Ok(())
    }

    /// Fetch version metadata for a TEE code hash.
    pub fn get_tee_hash_version(
        env: Env,
        code_hash: BytesN<32>,
    ) -> Result<TeeHashVersionInfo, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::TeeHashVersionInfo(code_hash))
            .ok_or(Error::TeeHashNotFound)
    }

    /// Query all TEE code hashes registered under a given version.
    pub fn get_tee_hashes_by_version(env: Env, version: u32) -> Vec<BytesN<32>> {
        env.storage()
            .persistent()
            .get(&DataKey::TeeHashesByVersion(version))
            .unwrap_or(Vec::new(&env))
    }

    /// Full chronological history of TEE hash version registrations and
    /// deprecations.
    pub fn get_tee_hash_version_history(env: Env) -> Vec<TeeHashVersionInfo> {
        env.storage()
            .persistent()
            .get(&DataKey::TeeHashVersionHistory)
            .unwrap_or(Vec::new(&env))
    }

    // -----------------------------------------------------------------------
    // #21 – add_provider / is_provider (BytesN<32> keys)
    // -----------------------------------------------------------------------

    /// Register a trusted oracle provider public key (admin-gated).  #21
    pub fn add_provider(env: Env, provider: BytesN<32>) {
        Self::require_admin(&env);
        Self::add_provider_internal(&env, provider);
    }

    // Shared storage-writing logic for `add_provider`, factored out so
    // `review_application` can register the applicant as a provider without
    // asking the already-authorized admin to authorize a second time.
    fn add_provider_internal(env: &Env, provider: BytesN<32>) {
        env.storage()
            .persistent()
            .set(&DataKey::Provider(provider.clone()), &true);

        let has_info = env
            .storage()
            .persistent()
            .has(&DataKey::ProviderInfo(provider.clone()));
        if !has_info {
            env.storage().persistent().set(
                &DataKey::ProviderInfo(provider.clone()),
                &ProviderInfo {
                    tier: ServiceTier::Basic,
                    status: ProviderStatus::Active,
                    name: String::from_str(env, ""),
                    website: None,
                    description: String::from_str(env, ""),
                },
            );
            let mut list: Vec<BytesN<32>> = env
                .storage()
                .persistent()
                .get(&DataKey::ProviderList)
                .unwrap_or(Vec::new(env));
            list.push_back(provider.clone());
            env.storage()
                .persistent()
                .set(&DataKey::ProviderList, &list);
        }

        // #186 — seed reputation tracking for newly registered providers
        if !env
            .storage()
            .persistent()
            .has(&DataKey::ProviderReputation(provider.clone()))
        {
            let reputation = ProviderReputation {
                score: REPUTATION_MAX_SCORE / 2,
                total_verifications: 0,
                successful_count: 0,
                failed_count: 0,
                last_updated: env.ledger().timestamp(),
            };
            env.storage()
                .persistent()
                .set(&DataKey::ProviderReputation(provider), &reputation);
        }
    }

    /// Check whether a provider public key is registered and not removed.  #21 #190
    pub fn is_provider(env: Env, provider: BytesN<32>) -> bool {
        let registered = env
            .storage()
            .persistent()
            .get(&DataKey::Provider(provider.clone()))
            .unwrap_or(false);
        if !registered {
            return false;
        }
        // A blacklisted provider is never considered valid until whitelisted again.
        if env
            .storage()
            .persistent()
            .has(&DataKey::ProviderBlacklist(provider.clone()))
        {
            return false;
        }
        let info: Option<ProviderInfo> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderInfo(provider));
        match info {
            Some(info) => info.status != ProviderStatus::Removed,
            None => true,
        }
    }

    /// Assign a service tier to a provider (admin-gated).  #188
    pub fn set_provider_tier(env: Env, provider: BytesN<32>, tier: ServiceTier) {
        Self::require_admin(&env);
        let mut info = Self::provider_info_or_default(&env, &provider);
        info.tier = tier;
        env.storage()
            .persistent()
            .set(&DataKey::ProviderInfo(provider), &info);
    }

    /// Fetch a provider's tier and lifecycle status.  #188 #190
    pub fn get_provider_info(env: Env, provider: BytesN<32>) -> Option<ProviderInfo> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderInfo(provider))
    }

    /// List every registered provider whose tier matches.  #188
    pub fn get_providers_by_tier(env: Env, tier: ServiceTier) -> Vec<BytesN<32>> {
        let list: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(Vec::new(&env));
        let mut result = Vec::new(&env);
        for provider in list.iter() {
            let info: Option<ProviderInfo> = env
                .storage()
                .persistent()
                .get(&DataKey::ProviderInfo(provider.clone()));
            if let Some(info) = info {
                if info.tier == tier {
                    result.push_back(provider);
                }
            }
        }
        result
    }

    /// Begin graceful removal of a provider: new request assignments are
    /// blocked immediately, but requests already in flight may still
    /// complete during the 30-day grace period.  #190
    pub fn deactivate_provider(env: Env, provider: BytesN<32>) {
        Self::require_admin(&env);
        let mut info = Self::provider_info_or_default(&env, &provider);
        let grace_end = env.ledger().timestamp() + PROVIDER_GRACE_PERIOD;
        info.status = ProviderStatus::Deactivating(grace_end);
        env.storage()
            .persistent()
            .set(&DataKey::ProviderInfo(provider.clone()), &info);
        env.events()
            .publish((symbol_short!("deactiv"),), (provider, grace_end));
    }

    /// Whether a provider may be assigned new requests right now.  #190
    pub fn can_accept_new_requests(env: Env, provider: BytesN<32>) -> bool {
        let info: Option<ProviderInfo> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderInfo(provider));
        match info {
            Some(info) => info.status == ProviderStatus::Active,
            None => false,
        }
    }

    /// Finalize removal once the grace period has elapsed (admin-gated).  #190
    pub fn finalize_removal(env: Env, provider: BytesN<32>) {
        Self::require_admin(&env);
        let mut info = Self::provider_info_or_default(&env, &provider);
        match info.status {
            ProviderStatus::Deactivating(grace_end) if env.ledger().timestamp() >= grace_end => {
                info.status = ProviderStatus::Removed;
                env.storage()
                    .persistent()
                    .set(&DataKey::ProviderInfo(provider.clone()), &info);
                env.events().publish((symbol_short!("removed"),), provider);
            }
            _ => panic!("Grace period not elapsed"),
        }
    }

    // -----------------------------------------------------------------------
    // #189 – provider onboarding workflow
    // -----------------------------------------------------------------------

    /// Submit a new provider application. The applicant must authenticate.  #189
    pub fn submit_provider_application(
        env: Env,
        applicant: Address,
        provider_key: BytesN<32>,
        metadata: String,
    ) -> u64 {
        applicant.require_auth();
        let id: u64 = env
            .storage()
            .persistent()
            .get(&DataKey::ApplicationCount)
            .unwrap_or(0);
        let application = ProviderApplication {
            applicant,
            provider_key,
            metadata,
            status: ApplicationStatus::Pending,
            submitted_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Application(id), &application);
        env.storage()
            .persistent()
            .set(&DataKey::ApplicationCount, &(id + 1));
        env.events().publish((symbol_short!("app_sub"),), id);
        id
    }

    /// Fetch a stored application by id.  #189
    pub fn get_application(env: Env, application_id: u64) -> Option<ProviderApplication> {
        env.storage()
            .persistent()
            .get(&DataKey::Application(application_id))
    }

    /// Admin reviews an application. Approval registers the applicant's key
    /// as an active Basic-tier provider.  #189
    pub fn review_application(env: Env, application_id: u64, approve: bool) {
        Self::require_admin(&env);
        let mut application: ProviderApplication = env
            .storage()
            .persistent()
            .get(&DataKey::Application(application_id))
            .expect("Application not found");
        application.status = if approve {
            ApplicationStatus::Approved
        } else {
            ApplicationStatus::Rejected
        };
        env.storage()
            .persistent()
            .set(&DataKey::Application(application_id), &application);
        env.events()
            .publish((symbol_short!("app_rev"), application_id), approve);

        if approve {
            Self::add_provider_internal(&env, application.provider_key);
        }
    }

    // -----------------------------------------------------------------------
    // #186 – provider reputation system
    // -----------------------------------------------------------------------

    /// Record the outcome of a provider verification and recompute its
    /// reputation score (admin-gated).
    pub fn record_verification_result(
        env: Env,
        provider: BytesN<32>,
        success: bool,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut reputation: ProviderReputation = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderReputation(provider.clone()))
            .ok_or(Error::ProviderNotFound)?;

        reputation.total_verifications += 1;
        if success {
            reputation.successful_count += 1;
        } else {
            reputation.failed_count += 1;
        }

        reputation.score = ((reputation.successful_count as u128 * REPUTATION_MAX_SCORE as u128)
            / reputation.total_verifications as u128) as u32;
        reputation.last_updated = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::ProviderReputation(provider), &reputation);

        Ok(())
    }

    /// Apply time-based decay to a provider's score if it has been inactive
    /// for one or more decay periods. Callable by anyone; decay is a
    /// deterministic function of elapsed time, not an admin action.
    pub fn apply_reputation_decay(env: Env, provider: BytesN<32>) -> Result<(), Error> {
        let mut reputation: ProviderReputation = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderReputation(provider.clone()))
            .ok_or(Error::ProviderNotFound)?;

        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(reputation.last_updated);
        let periods = elapsed / REPUTATION_DECAY_PERIOD_SECS;

        if periods > 0 {
            let decay = REPUTATION_DECAY_AMOUNT.saturating_mul(periods as u32);
            reputation.score = reputation.score.saturating_sub(decay);
            reputation.last_updated = now;
            env.storage()
                .persistent()
                .set(&DataKey::ProviderReputation(provider), &reputation);
        }

        Ok(())
    }

    /// Fetch a provider's current reputation.
    pub fn get_provider_reputation(
        env: Env,
        provider: BytesN<32>,
    ) -> Result<ProviderReputation, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderReputation(provider))
            .ok_or(Error::ProviderNotFound)
    }

    /// Query all registered providers whose score meets or exceeds a
    /// threshold.
    pub fn get_providers_by_min_reputation(env: Env, min_score: u32) -> Vec<BytesN<32>> {
        let providers: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(Vec::new(&env));

        let mut result: Vec<BytesN<32>> = Vec::new(&env);
        for provider in providers.iter() {
            if let Some(reputation) = env
                .storage()
                .persistent()
                .get::<DataKey, ProviderReputation>(&DataKey::ProviderReputation(provider.clone()))
            {
                if reputation.score >= min_score {
                    result.push_back(provider);
                }
            }
        }
        result
    }

    // -----------------------------------------------------------------------
    // #192 – Provider geographic distribution tracking
    // -----------------------------------------------------------------------

    /// Replace the set of regions a provider operates in (admin-gated).
    /// Supports multi-region providers via the `regions` vector.
    pub fn set_provider_regions(
        env: Env,
        provider: BytesN<32>,
        regions: Vec<Region>,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Provider(provider.clone()))
        {
            return Err(Error::ProviderNotFound);
        }

        env.storage()
            .persistent()
            .set(&DataKey::ProviderRegions(provider), &regions);
        Ok(())
    }

    /// Add a single region to a provider's existing set of regions
    /// (admin-gated). No-op if the region is already present.
    pub fn add_provider_region(
        env: Env,
        provider: BytesN<32>,
        region: Region,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Provider(provider.clone()))
        {
            return Err(Error::ProviderNotFound);
        }

        let mut regions: Vec<Region> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderRegions(provider.clone()))
            .unwrap_or(Vec::new(&env));
        if !regions.contains(&region) {
            regions.push_back(region);
            env.storage()
                .persistent()
                .set(&DataKey::ProviderRegions(provider), &regions);
        }
        Ok(())
    }

    /// Fetch the regions a provider is registered under.
    pub fn get_provider_regions(env: Env, provider: BytesN<32>) -> Vec<Region> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderRegions(provider))
            .unwrap_or(Vec::new(&env))
    }

    /// Query all registered providers that operate in a given region.
    pub fn get_providers_by_region(env: Env, region: Region) -> Vec<BytesN<32>> {
        let providers: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(Vec::new(&env));

        let mut result: Vec<BytesN<32>> = Vec::new(&env);
        for provider in providers.iter() {
            let regions: Vec<Region> = env
                .storage()
                .persistent()
                .get(&DataKey::ProviderRegions(provider.clone()))
                .unwrap_or(Vec::new(&env));
            if regions.contains(&region) {
                result.push_back(provider);
            }
        }
        result
    }

    // -----------------------------------------------------------------------
    // #193 – Provider capacity management
    // -----------------------------------------------------------------------

    /// Set (or update) a provider's max concurrent request capacity
    /// (admin-gated). Preserves the current active-request count when
    /// updating an existing entry.
    pub fn set_provider_capacity(
        env: Env,
        provider: BytesN<32>,
        max_concurrent: u32,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if max_concurrent == 0 {
            return Err(Error::InvalidCapacity);
        }
        if !env
            .storage()
            .persistent()
            .has(&DataKey::Provider(provider.clone()))
        {
            return Err(Error::ProviderNotFound);
        }

        let active_requests = env
            .storage()
            .persistent()
            .get::<DataKey, ProviderCapacity>(&DataKey::ProviderCapacity(provider.clone()))
            .map(|c| c.active_requests)
            .unwrap_or(0);

        let capacity = ProviderCapacity {
            max_concurrent,
            active_requests,
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderCapacity(provider), &capacity);
        Ok(())
    }

    /// Fetch a provider's capacity record.
    pub fn get_provider_capacity(
        env: Env,
        provider: BytesN<32>,
    ) -> Result<ProviderCapacity, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderCapacity(provider))
            .ok_or(Error::ProviderNotFound)
    }

    /// Returns true if the provider has room for another concurrent request.
    pub fn has_capacity(env: Env, provider: BytesN<32>) -> bool {
        match env
            .storage()
            .persistent()
            .get::<DataKey, ProviderCapacity>(&DataKey::ProviderCapacity(provider))
        {
            Some(c) => c.active_requests < c.max_concurrent,
            None => true, // no capacity limit configured
        }
    }

    /// Reserve a capacity slot for a provider ahead of dispatching a
    /// request. Emits a `capacity_exceeded` event and errors if the
    /// provider is already at its configured limit.
    pub fn increment_active_requests(env: Env, provider: BytesN<32>) -> Result<(), Error> {
        let mut capacity: ProviderCapacity = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderCapacity(provider.clone()))
            .ok_or(Error::ProviderNotFound)?;

        if capacity.active_requests >= capacity.max_concurrent {
            env.events()
                .publish((Symbol::new(&env, "capacity_exceeded"),), provider);
            return Err(Error::CapacityExceeded);
        }

        capacity.active_requests += 1;
        env.storage()
            .persistent()
            .set(&DataKey::ProviderCapacity(provider), &capacity);
        Ok(())
    }

    /// Release a previously reserved capacity slot for a provider.
    pub fn decrement_active_requests(env: Env, provider: BytesN<32>) -> Result<(), Error> {
        let mut capacity: ProviderCapacity = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderCapacity(provider.clone()))
            .ok_or(Error::ProviderNotFound)?;

        capacity.active_requests = capacity.active_requests.saturating_sub(1);
        env.storage()
            .persistent()
            .set(&DataKey::ProviderCapacity(provider), &capacity);
        Ok(())
    }

    // -----------------------------------------------------------------------
    // #194 – Provider specialization tags
    // -----------------------------------------------------------------------

    /// Add a specialization tag to a provider (admin-gated). No-op if
    /// already present.
    pub fn add_provider_specialization(
        env: Env,
        provider: BytesN<32>,
        specialization: Specialization,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Provider(provider.clone()))
        {
            return Err(Error::ProviderNotFound);
        }

        let mut specs: Vec<Specialization> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderSpecializations(provider.clone()))
            .unwrap_or(Vec::new(&env));
        if !specs.contains(&specialization) {
            specs.push_back(specialization);
            env.storage()
                .persistent()
                .set(&DataKey::ProviderSpecializations(provider), &specs);
        }
        Ok(())
    }

    /// Remove a specialization tag from a provider (admin-gated). No-op if
    /// not present.
    pub fn remove_provider_specialization(
        env: Env,
        provider: BytesN<32>,
        specialization: Specialization,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let specs: Vec<Specialization> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderSpecializations(provider.clone()))
            .unwrap_or(Vec::new(&env));

        let mut result: Vec<Specialization> = Vec::new(&env);
        for s in specs.iter() {
            if s != specialization {
                result.push_back(s);
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::ProviderSpecializations(provider), &result);
        Ok(())
    }

    /// Fetch a provider's specialization tags.
    pub fn get_provider_specializations(env: Env, provider: BytesN<32>) -> Vec<Specialization> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderSpecializations(provider))
            .unwrap_or(Vec::new(&env))
    }

    /// Query all registered providers tagged with a given specialization.
    pub fn get_providers_by_specialization(
        env: Env,
        specialization: Specialization,
    ) -> Vec<BytesN<32>> {
        let providers: Vec<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderList)
            .unwrap_or(Vec::new(&env));

        let mut result: Vec<BytesN<32>> = Vec::new(&env);
        for provider in providers.iter() {
            let specs: Vec<Specialization> = env
                .storage()
                .persistent()
                .get(&DataKey::ProviderSpecializations(provider.clone()))
                .unwrap_or(Vec::new(&env));
            if specs.contains(&specialization) {
                result.push_back(provider);
            }
        }
        result
    }

    // -----------------------------------------------------------------------
    // #195 – Provider blacklist / whitelist
    // -----------------------------------------------------------------------

    /// Blacklist a provider with a reason code (admin-gated). Blacklisted
    /// providers fail authorization checks until whitelisted again.
    pub fn blacklist_provider(
        env: Env,
        provider: BytesN<32>,
        reason_code: u32,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let entry = BlacklistEntry {
            reason_code,
            blacklisted_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderBlacklist(provider.clone()), &entry);

        env.events().publish(
            (Symbol::new(&env, "provider_blacklisted"),),
            (provider, reason_code),
        );
        Ok(())
    }

    /// Remove a provider from the blacklist (admin-gated).
    pub fn whitelist_provider(env: Env, provider: BytesN<32>) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&DataKey::ProviderBlacklist(provider.clone()))
        {
            return Err(Error::NotBlacklisted);
        }

        env.storage()
            .persistent()
            .remove(&DataKey::ProviderBlacklist(provider.clone()));

        env.events()
            .publish((Symbol::new(&env, "provider_whitelisted"),), provider);
        Ok(())
    }

    /// Returns true if the provider is currently blacklisted.
    pub fn is_blacklisted(env: Env, provider: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::ProviderBlacklist(provider))
    }

    /// Fetch the blacklist entry (reason code + timestamp) for a provider,
    /// if any.
    pub fn get_blacklist_entry(env: Env, provider: BytesN<32>) -> Result<BlacklistEntry, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderBlacklist(provider))
            .ok_or(Error::NotBlacklisted)
    }

    /// Authorization check combining registration and blacklist status.
    /// Registered-but-blacklisted providers are not authorized.
    pub fn is_provider_authorized(env: Env, provider: BytesN<32>) -> Result<bool, Error> {
        let registered = env
            .storage()
            .persistent()
            .get(&DataKey::Provider(provider.clone()))
            .unwrap_or(false);

        if !registered {
            return Ok(false);
        }

        if env
            .storage()
            .persistent()
            .has(&DataKey::ProviderBlacklist(provider))
        {
            return Err(Error::ProviderBlacklisted);
        }

        Ok(true)
    }

    // -----------------------------------------------------------------------
    // #24 – verify_and_mint
    // -----------------------------------------------------------------------

    /// Hash `content`, verify it matches `expected_hash`, then cross-call
    /// the provenance contract to mint a certificate.  #24
    pub fn verify_and_mint(
        env: Env,
        content: Bytes,
        expected_hash: BytesN<32>,
        owner: Address,
    ) -> VerificationResult {
        let computed: BytesN<32> = env.crypto().sha256(&content).into();

        if computed != expected_hash {
            return VerificationResult {
                success: false,
                content_hash: computed,
                certificate_id: 0,
                state: String::from_str(&env, "hash_mismatch"),
            };
        }

        let provenance_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::Provenance)
            .expect("Not initialized");

        let client = provenance::ProvenanceClient::new(&env, &provenance_id);
        let empty = Bytes::from_slice(&env, &[]);
        let cert_id = client.mint(&content, &empty, &empty, &owner);

        VerificationResult {
            success: true,
            content_hash: computed,
            certificate_id: cert_id,
            state: String::from_str(&env, "minted"),
        }
    }

    // -----------------------------------------------------------------------
    // #163 – Multi-Signature Support
    // -----------------------------------------------------------------------

    pub fn get_multisig_threshold(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::MultisigThreshold)
            .unwrap_or(1)
    }

    pub fn update_multisig_threshold(env: Env, threshold: u32) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if threshold == 0 {
            return Err(Error::InvalidThreshold);
        }

        env.storage()
            .instance()
            .set(&DataKey::MultisigThreshold, &threshold);
        Ok(())
    }

    pub fn propose_operation(
        env: Env,
        operation: ProposalOperation,
        timelock_ledgers: u32,
    ) -> Result<u64, Error> {
        let proposer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        proposer.require_auth();

        let proposal_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextProposalId)
            .unwrap_or(1u64);
        env.storage()
            .instance()
            .set(&DataKey::NextProposalId, &(proposal_id + 1));

        let current_ledger = env.ledger().sequence();
        let proposal = Proposal {
            id: proposal_id,
            operation,
            proposer,
            created_ledger: current_ledger,
            execution_ledger: current_ledger + timelock_ledgers,
            executed: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);
        let approvals: Vec<Address> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&DataKey::ProposalApprovals(proposal_id), &approvals);

        Ok(proposal_id)
    }

    pub fn approve_proposal(env: Env, proposal_id: u64) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(Error::ProposalNotFound)?;

        if proposal.executed {
            return Err(Error::ProposalNotFound);
        }

        let mut approvals: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::ProposalApprovals(proposal_id))
            .unwrap_or(Vec::new(&env));

        for approval in approvals.iter() {
            if approval == admin {
                return Ok(());
            }
        }

        approvals.push_back(admin);
        env.storage()
            .persistent()
            .set(&DataKey::ProposalApprovals(proposal_id), &approvals);
        Ok(())
    }

    pub fn execute_proposal(env: Env, proposal_id: u64) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut proposal: Proposal = env
            .storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
            .ok_or(Error::ProposalNotFound)?;

        if proposal.executed {
            return Err(Error::ProposalNotFound);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < proposal.execution_ledger {
            return Err(Error::InvalidThreshold);
        }

        let threshold = Self::get_multisig_threshold(env.clone());
        let approvals: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::ProposalApprovals(proposal_id))
            .unwrap_or(Vec::new(&env));

        if approvals.len() < threshold {
            return Err(Error::InsufficientApprovals);
        }

        proposal.executed = true;
        env.storage()
            .persistent()
            .set(&DataKey::Proposal(proposal_id), &proposal);

        Ok(())
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Option<Proposal> {
        env.storage()
            .persistent()
            .get(&DataKey::Proposal(proposal_id))
    }

    pub fn get_proposal_approvals(env: Env, proposal_id: u64) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::ProposalApprovals(proposal_id))
            .unwrap_or(Vec::new(&env))
    }

    // -----------------------------------------------------------------------
    // #451 – Provider metadata management
    // -----------------------------------------------------------------------

    /// Update provider metadata (name, website, description). Only the admin may call this.
    pub fn set_provider_metadata(
        env: Env,
        provider: BytesN<32>,
        name: String,
        website: Option<String>,
        description: String,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Provider(provider.clone()))
        {
            return Err(Error::ProviderNotFound);
        }

        let mut info = Self::provider_info_or_default(&env, &provider);
        info.name = name;
        info.website = website;
        info.description = description;
        env.storage()
            .persistent()
            .set(&DataKey::ProviderInfo(provider.clone()), &info);

        env.events().publish((symbol_short!("metadata"),), provider);
        Ok(())
    }

    /// Get provider metadata (name, website, description).
    pub fn get_provider_metadata(
        env: Env,
        provider: BytesN<32>,
    ) -> Result<(String, Option<String>, String), Error> {
        let info: ProviderInfo = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderInfo(provider))
            .ok_or(Error::ProviderNotFound)?;
        Ok((info.name, info.website, info.description))
    }

    /// Get the display name of a provider.
    pub fn get_provider_name(env: Env, provider: BytesN<32>) -> Result<String, Error> {
        env.storage()
            .persistent()
            .get::<DataKey, ProviderInfo>(&DataKey::ProviderInfo(provider))
            .map(|info| info.name)
            .ok_or(Error::ProviderNotFound)
    }

    /// Get the website URL of a provider.
    pub fn get_provider_website(env: Env, provider: BytesN<32>) -> Result<Option<String>, Error> {
        env.storage()
            .persistent()
            .get::<DataKey, ProviderInfo>(&DataKey::ProviderInfo(provider))
            .map(|info| info.website)
            .ok_or(Error::ProviderNotFound)
    }

    /// Get the description of a provider.
    pub fn get_provider_description(env: Env, provider: BytesN<32>) -> Result<String, Error> {
        env.storage()
            .persistent()
            .get::<DataKey, ProviderInfo>(&DataKey::ProviderInfo(provider))
            .map(|info| info.description)
            .ok_or(Error::ProviderNotFound)
    }

    // -----------------------------------------------------------------------
    // Feature 3 – Attestation certificate references on TEE hash entries
    // -----------------------------------------------------------------------

    /// Attach an attestation certificate reference to an approved TEE code hash.
    /// Only the admin may call this. The TEE hash must already be registered.
    /// `valid_until` must be strictly after `valid_from`.
    pub fn attach_cert_ref(
        env: Env,
        code_hash: BytesN<32>,
        issuer: String,
        valid_from: u64,
        valid_until: u64,
        cert_uri: Option<String>,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        // The TEE hash must already be registered.
        if !env
            .storage()
            .persistent()
            .has(&DataKey::TeeHash(code_hash.clone()))
        {
            return Err(Error::TeeHashNotFound);
        }

        // Basic sanity: expiry must be after issuance.
        if valid_until <= valid_from {
            return Err(Error::InvalidThreshold);
        }

        let cert_ref = TeeHashCertRef {
            issuer,
            valid_from,
            valid_until,
            cert_uri,
            code_hash: code_hash.clone(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::TeeHashCertRef(code_hash), &cert_ref);
        Ok(())
    }

    /// Retrieve the certificate reference for a TEE hash, if one has been attached.
    pub fn get_cert_ref(env: Env, code_hash: BytesN<32>) -> Result<TeeHashCertRef, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::TeeHashCertRef(code_hash))
            .ok_or(Error::TeeHashNotFound)
    }

    /// Query a TEE hash together with its certificate reference in one call.
    /// Returns `(is_approved, Option<TeeHashCertRef>)`.
    pub fn get_tee_hash_with_cert(
        env: Env,
        code_hash: BytesN<32>,
    ) -> (bool, Option<TeeHashCertRef>) {
        let approved = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHash(code_hash.clone()))
            .unwrap_or(false);
        let cert_ref = env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashCertRef(code_hash));
        (approved, cert_ref)
    }

    /// Check whether the certificate attached to a TEE hash has expired.
    /// Returns `Ok(false)` if no cert is attached (treat as unexpired).
    /// Returns `Err(CertificateExpired)` if the cert has expired.
    pub fn validate_cert_expiration(env: Env, code_hash: BytesN<32>) -> Result<bool, Error> {
        let cert_ref: TeeHashCertRef = match env
            .storage()
            .persistent()
            .get(&DataKey::TeeHashCertRef(code_hash))
        {
            Some(c) => c,
            None => return Ok(false), // no cert attached → pass
        };

        let now = env.ledger().timestamp();
        if now > cert_ref.valid_until {
            return Err(Error::CertificateExpired);
        }
        Ok(true)
    }

    // -----------------------------------------------------------------------
    // #454 – Provider groups
    // -----------------------------------------------------------------------

    /// Create a new provider group for organizational purposes (admin-gated).
    pub fn create_provider_group(
        env: Env,
        name: String,
        description: String,
    ) -> Result<u64, Error> {
        Self::require_admin(&env);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::GroupCount)
            .unwrap_or(0u64)
            + 1;
        env.storage().instance().set(&DataKey::GroupCount, &id);

        let group = ProviderGroup {
            name,
            description,
            created_at: env.ledger().timestamp(),
            members: Vec::new(&env),
        };
        env.storage()
            .persistent()
            .set(&DataKey::ProviderGroup(id), &group);

        env.events()
            .publish((Symbol::new(&env, "group_created"),), id);
        Ok(id)
    }

    /// Update a provider group's name and description (admin-gated). Members
    /// and `created_at` are preserved.
    pub fn update_provider_group(
        env: Env,
        group_id: u64,
        name: String,
        description: String,
    ) -> Result<(), Error> {
        Self::require_admin(&env);

        let mut group: ProviderGroup = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderGroup(group_id))
            .ok_or(Error::GroupNotFound)?;

        group.name = name;
        group.description = description;
        env.storage()
            .persistent()
            .set(&DataKey::ProviderGroup(group_id), &group);

        Ok(())
    }

    /// Add a registered provider to a group (admin-gated). No-op if the
    /// provider is already a member.
    pub fn add_provider_to_group(
        env: Env,
        group_id: u64,
        provider: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_admin(&env);

        let mut group: ProviderGroup = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderGroup(group_id))
            .ok_or(Error::GroupNotFound)?;

        if !env
            .storage()
            .persistent()
            .has(&DataKey::Provider(provider.clone()))
        {
            return Err(Error::ProviderNotFound);
        }

        if !group.members.contains(&provider) {
            group.members.push_back(provider.clone());
            env.storage()
                .persistent()
                .set(&DataKey::ProviderGroup(group_id), &group);

            let mut groups: Vec<u64> = env
                .storage()
                .persistent()
                .get(&DataKey::ProviderGroups(provider.clone()))
                .unwrap_or(Vec::new(&env));
            if !groups.contains(group_id) {
                groups.push_back(group_id);
                env.storage()
                    .persistent()
                    .set(&DataKey::ProviderGroups(provider), &groups);
            }
        }

        Ok(())
    }

    /// Remove a provider from a group (admin-gated). No-op if the provider
    /// is not a member.
    pub fn remove_provider_from_group(
        env: Env,
        group_id: u64,
        provider: BytesN<32>,
    ) -> Result<(), Error> {
        Self::require_admin(&env);

        let mut group: ProviderGroup = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderGroup(group_id))
            .ok_or(Error::GroupNotFound)?;

        let mut new_members: Vec<BytesN<32>> = Vec::new(&env);
        for member in group.members.iter() {
            if member != provider {
                new_members.push_back(member);
            }
        }
        group.members = new_members;
        env.storage()
            .persistent()
            .set(&DataKey::ProviderGroup(group_id), &group);

        let groups: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderGroups(provider.clone()))
            .unwrap_or(Vec::new(&env));
        let mut new_groups: Vec<u64> = Vec::new(&env);
        for g in groups.iter() {
            if g != group_id {
                new_groups.push_back(g);
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::ProviderGroups(provider), &new_groups);

        Ok(())
    }

    /// Fetch a provider group's full metadata (name, description, members).
    pub fn get_provider_group(env: Env, group_id: u64) -> Result<ProviderGroup, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderGroup(group_id))
            .ok_or(Error::GroupNotFound)
    }

    /// Query the provider keys belonging to a group.
    pub fn get_group_members(env: Env, group_id: u64) -> Result<Vec<BytesN<32>>, Error> {
        let group: ProviderGroup = env
            .storage()
            .persistent()
            .get(&DataKey::ProviderGroup(group_id))
            .ok_or(Error::GroupNotFound)?;
        Ok(group.members)
    }

    /// Query all group ids a provider belongs to.
    pub fn get_groups_for_provider(env: Env, provider: BytesN<32>) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::ProviderGroups(provider))
            .unwrap_or(Vec::new(&env))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Env,
    };

    fn setup() -> (Env, Address, RegistryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let provenance = Address::generate(&env);
        client.init(&admin, &provenance);
        (env, admin, client)
    }

    fn hash32(env: &Env) -> BytesN<32> {
        BytesN::from_array(env, &[1u8; 32])
    }

    fn hash32_with_value(env: &Env, value: u8) -> BytesN<32> {
        BytesN::from_array(env, &[value; 32])
    }

    #[cfg(test)]
    mod property_tests {
        extern crate std;
        use super::*;
        use quickcheck::quickcheck;

        fn hash_from_values(env: &Env, values: &[u8]) -> BytesN<32> {
            let mut out = [0u8; 32];
            for (idx, value) in values.iter().take(32).enumerate() {
                out[idx] = *value;
            }
            BytesN::from_array(env, &out)
        }

        quickcheck! {
            fn prop_duplicate_tee_hash_registration_is_idempotent(values: std::vec::Vec<u8>) -> bool {
                let (env, _admin, client) = setup();
                let tee_hash = hash_from_values(&env, &values);

                client.add_tee_hash(&tee_hash);
                client.add_tee_hash(&tee_hash);

                client.is_tee_hash_approved(&tee_hash)
            }

            fn prop_duplicate_provider_registration_keeps_single_entry(values: std::vec::Vec<u8>) -> bool {
                let (env, _admin, client) = setup();
                let provider = hash_from_values(&env, &values);

                client.add_provider(&provider);
                client.add_provider(&provider);

                client.is_provider(&provider)
                    && client.get_providers_by_min_reputation(&0).len() == 1
            }

            fn prop_provider_list_is_monotonic_for_unique_additions(values: std::vec::Vec<u8>) -> bool {
                let (env, _admin, client) = setup();
                let mut seen = 0u32;

                for (index, value) in values.iter().take(12).enumerate() {
                    let provider = hash_from_values(&env, &[*value, (index as u8), 0u8]);
                    client.add_provider(&provider);
                    let list = client.get_providers_by_min_reputation(&0);
                    if list.len() < seen + 1 {
                        return false;
                    }
                    seen = list.len();
                }

                true
            }
        }
    }

    // --- #22 / #23 tests ---

    #[test]
    fn test_add_tee_hash_stores_hash() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        assert!(client.is_tee_hash_approved(&h));
    }

    #[test]
    fn test_add_tee_hash_multiple_hashes() {
        let (env, _admin, client) = setup();
        let h1 = hash32_with_value(&env, 1);
        let h2 = hash32_with_value(&env, 2);
        let h3 = hash32_with_value(&env, 3);
        client.add_tee_hash(&h1);
        client.add_tee_hash(&h2);
        client.add_tee_hash(&h3);
        assert!(client.is_tee_hash_approved(&h1));
        assert!(client.is_tee_hash_approved(&h2));
        assert!(client.is_tee_hash_approved(&h3));
    }

    #[test]
    fn test_add_tee_hash_no_admin_returns_unauthorized() {
        let env = Env::default();
        let cid = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let provenance = Address::generate(&env);
        client.init(&admin, &provenance);

        let result = client.try_add_tee_hash(&BytesN::from_array(&env, &[0u8; 32]));
        assert!(result.is_err());
    }

    #[test]
    #[should_panic]
    fn test_add_tee_hash_non_admin_panics() {
        let env = Env::default();
        let cid = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let provenance = Address::generate(&env);
        client.init(&admin, &provenance);

        client.add_tee_hash(&BytesN::from_array(&env, &[0u8; 32]));
    }

    // --- #21 tests ---

    #[test]
    fn test_add_provider() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[9u8; 32]);
        client.add_provider(&p);
        assert!(client.is_provider(&p));
    }

    #[test]
    fn test_unauthorized_provider() {
        let env = Env::default();
        env.mock_all_auths();
        let cid = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &cid);
        // Not initialized — expect panic
        let result = client.try_add_provider(&BytesN::from_array(&env, &[0u8; 32]));
        assert!(result.is_err());
    }

    // --- #188 tests ---

    #[test]
    fn test_set_and_get_provider_tier() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[3u8; 32]);
        client.add_provider(&p);
        client.set_provider_tier(&p, &ServiceTier::Premium);
        assert_eq!(
            client.get_provider_info(&p).unwrap().tier,
            ServiceTier::Premium
        );
    }

    #[test]
    fn test_get_providers_by_tier() {
        let (env, _admin, client) = setup();
        let p1 = BytesN::from_array(&env, &[4u8; 32]);
        let p2 = BytesN::from_array(&env, &[5u8; 32]);
        client.add_provider(&p1);
        client.add_provider(&p2);
        client.set_provider_tier(&p1, &ServiceTier::Premium);
        let premium = client.get_providers_by_tier(&ServiceTier::Premium);
        assert_eq!(premium.len(), 1);
    }

    // --- #189 tests ---

    #[test]
    fn test_submit_and_approve_application() {
        let (env, _admin, client) = setup();
        let applicant = Address::generate(&env);
        let provider_key = BytesN::from_array(&env, &[6u8; 32]);
        let id = client.submit_provider_application(
            &applicant,
            &provider_key,
            &String::from_str(&env, "metadata"),
        );
        assert_eq!(
            client.get_application(&id).unwrap().status,
            ApplicationStatus::Pending
        );
        client.review_application(&id, &true);
        assert_eq!(
            client.get_application(&id).unwrap().status,
            ApplicationStatus::Approved
        );
        assert!(client.is_provider(&provider_key));
    }

    // --- #190 tests ---

    #[test]
    fn test_deactivate_provider_blocks_new_requests() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[7u8; 32]);
        client.add_provider(&p);
        client.deactivate_provider(&p);
        assert!(!client.can_accept_new_requests(&p));
        assert!(client.is_provider(&p));
    }

    #[test]
    fn test_finalize_removal_after_grace_period() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[8u8; 32]);
        client.add_provider(&p);
        client.deactivate_provider(&p);
        env.ledger()
            .with_mut(|l| l.timestamp += PROVIDER_GRACE_PERIOD + 1);
        client.finalize_removal(&p);
        assert!(!client.is_provider(&p));
    }

    // --- #191 tests ---

    #[test]
    fn test_tee_hash_expires_after_validity_window() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        env.ledger()
            .with_mut(|l| l.timestamp += TEE_HASH_VALIDITY + 1);
        assert!(!client.is_tee_hash_approved(&h));
    }

    #[test]
    fn test_rotate_tee_hash_provides_migration_path() {
        let (env, _admin, client) = setup();
        let old = BytesN::from_array(&env, &[10u8; 32]);
        let new = BytesN::from_array(&env, &[11u8; 32]);
        client.add_tee_hash(&old);
        client.rotate_tee_hash(&old, &new);
        assert!(!client.is_tee_hash_approved(&old));
        assert!(client.is_tee_hash_approved(&new));
        assert_eq!(client.get_tee_hash_migration(&old).unwrap(), new);
    }

    // --- #163 tests ---

    #[test]
    fn test_get_multisig_threshold_returns_default() {
        let (env, _admin, client) = setup();
        let threshold = client.get_multisig_threshold();
        assert_eq!(threshold, 1);
    }

    #[test]
    fn test_update_multisig_threshold() {
        let (env, _admin, client) = setup();
        client.try_update_multisig_threshold(&2).unwrap().unwrap();
        let threshold = client.get_multisig_threshold();
        assert_eq!(threshold, 2);
    }

    #[test]
    fn test_update_multisig_threshold_invalid() {
        let (env, _admin, client) = setup();
        let result = client.try_update_multisig_threshold(&0);
        assert!(result.is_err());
    }

    #[test]
    fn test_propose_operation() {
        let (env, _admin, client) = setup();
        let h = BytesN::from_array(&env, &[1u8; 32]);
        let operation = ProposalOperation::AddTeeHash(h);
        let proposal_id = client
            .try_propose_operation(&operation, &10u32)
            .unwrap()
            .unwrap();
        assert_eq!(proposal_id, 1);

        let proposal = client.get_proposal(&proposal_id).unwrap();
        assert_eq!(proposal.id, 1);
    }

    #[test]
    fn test_approve_proposal() {
        let (env, admin, client) = setup();
        let h = BytesN::from_array(&env, &[1u8; 32]);
        let operation = ProposalOperation::AddTeeHash(h);
        let proposal_id = client
            .try_propose_operation(&operation, &10u32)
            .unwrap()
            .unwrap();

        client.try_approve_proposal(&proposal_id).unwrap().unwrap();
        let approvals = client.get_proposal_approvals(&proposal_id);
        assert_eq!(approvals.len(), 1);
    }

    #[test]
    fn test_execute_proposal() {
        let (env, _admin, client) = setup();
        let h = BytesN::from_array(&env, &[1u8; 32]);
        let operation = ProposalOperation::AddTeeHash(h);
        let proposal_id = client
            .try_propose_operation(&operation, &0u32)
            .unwrap()
            .unwrap();

        client.try_approve_proposal(&proposal_id).unwrap().unwrap();

        let result = client.try_execute_proposal(&proposal_id).unwrap();
        assert!(result.is_ok());

        let proposal = client.get_proposal(&proposal_id).unwrap();
        assert!(proposal.executed);
    }

    // -----------------------------------------------------------------------
    // Feature 3 – Attestation certificate references on TEE hash entries
    // -----------------------------------------------------------------------

    #[test]
    fn test_attach_and_get_cert_ref() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);

        let issuer = String::from_str(&env, "ACME CA");
        let valid_from = 1_000_000u64;
        let valid_until = 9_999_999u64;
        client.attach_cert_ref(&h, &issuer, &valid_from, &valid_until, &None);

        let cert_ref = client.get_cert_ref(&h);
        assert_eq!(cert_ref.issuer, String::from_str(&env, "ACME CA"));
        assert_eq!(cert_ref.valid_from, valid_from);
        assert_eq!(cert_ref.valid_until, valid_until);
        assert!(cert_ref.cert_uri.is_none());
    }

    #[test]
    fn test_attach_cert_ref_with_uri() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);

        let uri = Some(String::from_str(&env, "ipfs://Qm1234567890"));
        client.attach_cert_ref(
            &h,
            &String::from_str(&env, "TEE Lab"),
            &1000u64,
            &5000u64,
            &uri,
        );

        let cert_ref = client.get_cert_ref(&h);
        assert!(cert_ref.cert_uri.is_some());
    }

    #[test]
    fn test_attach_cert_ref_tee_not_registered() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 99);
        let err = client
            .try_attach_cert_ref(&h, &String::from_str(&env, "CA"), &1000u64, &5000u64, &None)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::TeeHashNotFound);
    }

    #[test]
    fn test_attach_cert_ref_invalid_validity_period() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        // valid_until == valid_from → InvalidThreshold
        let err = client
            .try_attach_cert_ref(&h, &String::from_str(&env, "CA"), &5000u64, &5000u64, &None)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::InvalidThreshold);
    }

    #[test]
    fn test_get_tee_hash_with_cert_both_present() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        client.attach_cert_ref(&h, &String::from_str(&env, "CA"), &1000u64, &9999u64, &None);
        let (approved, cert_ref) = client.get_tee_hash_with_cert(&h);
        assert!(approved);
        assert!(cert_ref.is_some());
    }

    #[test]
    fn test_get_tee_hash_with_cert_no_cert() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        let (approved, cert_ref) = client.get_tee_hash_with_cert(&h);
        assert!(approved);
        assert!(cert_ref.is_none());
    }

    #[test]
    fn test_validate_cert_expiration_valid() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        // Ledger timestamp defaults to 0 in tests; expiry far in the future.
        client.attach_cert_ref(
            &h,
            &String::from_str(&env, "CA"),
            &0u64,
            &99_999_999u64,
            &None,
        );
        let result = client.validate_cert_expiration(&h);
        assert!(result);
    }

    #[test]
    fn test_validate_cert_expiration_no_cert_passes() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        // No cert attached → Ok(false)
        let result = client.validate_cert_expiration(&h);
        assert!(!result);
    }

    // -----------------------------------------------------------------------
    // #191 – TEE hash near-expiry warning
    // -----------------------------------------------------------------------

    #[test]
    fn test_is_tee_hash_near_expiry_false_when_far_from_expiry() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        // Ledger timestamp = 0; expiry = TEE_HASH_VALIDITY (180 days in secs)
        // Warning window = 14 days — not near yet
        assert!(!client.is_tee_hash_near_expiry(&h));
    }

    #[test]
    fn test_is_tee_hash_near_expiry_true_within_warning_window() {
        let (env, _admin, client) = setup();
        let h = hash32(&env);
        client.add_tee_hash(&h);
        // Advance time to just inside the 14-day warning window
        env.ledger().with_mut(|l| {
            l.timestamp = TEE_HASH_VALIDITY - TEE_WARNING_PERIOD + 1;
        });
        assert!(client.is_tee_hash_near_expiry(&h));
    }

    #[test]
    fn test_is_tee_hash_near_expiry_false_for_unregistered_hash() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 77);
        assert!(!client.is_tee_hash_near_expiry(&h));
    }

    #[test]
    fn test_is_tee_hash_near_expiry_false_after_rotation() {
        let (env, _admin, client) = setup();
        let old = hash32_with_value(&env, 50);
        let new = hash32_with_value(&env, 51);
        client.add_tee_hash(&old);
        client.rotate_tee_hash(&old, &new);
        // Rotated hash should not show near-expiry
        assert!(!client.is_tee_hash_near_expiry(&old));
    }

    // -----------------------------------------------------------------------
    // #187 – TEE hash versioning
    // -----------------------------------------------------------------------

    #[test]
    fn test_add_tee_hash_version_and_retrieve() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 20);
        client.add_tee_hash_version(&h, &1u32);
        let info = client.get_tee_hash_version(&h);
        assert_eq!(info.version, 1u32);
        assert!(!info.deprecated);
    }

    #[test]
    fn test_get_tee_hashes_by_version() {
        let (env, _admin, client) = setup();
        let h1 = hash32_with_value(&env, 21);
        let h2 = hash32_with_value(&env, 22);
        client.add_tee_hash_version(&h1, &2u32);
        client.add_tee_hash_version(&h2, &2u32);
        let hashes = client.get_tee_hashes_by_version(&2u32);
        assert_eq!(hashes.len(), 2);
    }

    #[test]
    fn test_add_same_hash_to_version_is_idempotent() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 23);
        client.add_tee_hash_version(&h, &3u32);
        client.add_tee_hash_version(&h, &3u32); // second call
        let hashes = client.get_tee_hashes_by_version(&3u32);
        assert_eq!(hashes.len(), 1);
    }

    #[test]
    fn test_get_tee_hash_version_not_found() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 24);
        let err = client.try_get_tee_hash_version(&h).unwrap_err().unwrap();
        assert_eq!(err, Error::TeeHashNotFound);
    }

    // -----------------------------------------------------------------------
    // #187 – TEE hash deprecation
    // -----------------------------------------------------------------------

    #[test]
    fn test_deprecate_tee_hash() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 30);
        client.add_tee_hash_version(&h, &1u32);
        client.deprecate_tee_hash(&h);
        let info = client.get_tee_hash_version(&h);
        assert!(info.deprecated);
        assert!(info.deprecated_at.is_some());
    }

    #[test]
    fn test_deprecate_unregistered_tee_hash_fails() {
        let (env, _admin, client) = setup();
        let h = hash32_with_value(&env, 31);
        let err = client.try_deprecate_tee_hash(&h).unwrap_err().unwrap();
        assert_eq!(err, Error::TeeHashNotFound);
    }

    // -----------------------------------------------------------------------
    // #186 – Provider reputation system
    // -----------------------------------------------------------------------

    #[test]
    fn test_provider_has_initial_reputation_score() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[40u8; 32]);
        client.add_provider(&p);
        let rep = client.get_provider_reputation(&p);
        assert_eq!(rep.score, REPUTATION_MAX_SCORE / 2);
        assert_eq!(rep.total_verifications, 0);
    }

    #[test]
    fn test_record_verification_result_success_increases_score() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[41u8; 32]);
        client.add_provider(&p);
        client.record_verification_result(&p, &true);
        let rep = client.get_provider_reputation(&p);
        assert_eq!(rep.successful_count, 1);
        assert_eq!(rep.total_verifications, 1);
        assert_eq!(rep.score, REPUTATION_MAX_SCORE);
    }

    #[test]
    fn test_record_verification_result_failure_lowers_score() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[42u8; 32]);
        client.add_provider(&p);
        client.record_verification_result(&p, &true);
        client.record_verification_result(&p, &false);
        let rep = client.get_provider_reputation(&p);
        assert_eq!(rep.score, REPUTATION_MAX_SCORE / 2);
    }

    #[test]
    fn test_get_providers_by_min_reputation() {
        let (env, _admin, client) = setup();
        let p1 = BytesN::from_array(&env, &[43u8; 32]);
        let p2 = BytesN::from_array(&env, &[44u8; 32]);
        client.add_provider(&p1);
        client.add_provider(&p2);
        client.record_verification_result(&p1, &true);
        // p2 has base score = REPUTATION_MAX_SCORE / 2
        let high_threshold = REPUTATION_MAX_SCORE - 1;
        let result = client.get_providers_by_min_reputation(&high_threshold);
        // Only p1 (score 1000) qualifies
        assert_eq!(result.len(), 1);
    }

    #[test]
    fn test_apply_reputation_decay() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[45u8; 32]);
        client.add_provider(&p);
        let initial = client.get_provider_reputation(&p).score;
        // Advance time by 2 decay periods (60 days)
        env.ledger().with_mut(|l| {
            l.timestamp = 2 * REPUTATION_DECAY_PERIOD_SECS + 1;
        });
        client.apply_reputation_decay(&p);
        let after = client.get_provider_reputation(&p).score;
        assert!(after < initial);
    }

    #[test]
    fn test_apply_reputation_decay_no_change_within_period() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[46u8; 32]);
        client.add_provider(&p);
        let initial = client.get_provider_reputation(&p).score;
        // Only 1 second has passed — less than one period
        env.ledger().with_mut(|l| {
            l.timestamp = 1;
        });
        client.apply_reputation_decay(&p);
        assert_eq!(client.get_provider_reputation(&p).score, initial);
    }

    #[test]
    fn test_get_provider_reputation_not_found() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[47u8; 32]);
        let err = client.try_get_provider_reputation(&p).unwrap_err().unwrap();
        assert_eq!(err, Error::ProviderNotFound);
    }

    // -----------------------------------------------------------------------
    // #192 – Provider geographic distribution
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_and_get_provider_regions() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[50u8; 32]);
        client.add_provider(&p);
        let regions = soroban_sdk::vec![&env, Region::Europe, Region::NorthAmerica];
        client.set_provider_regions(&p, &regions);
        let stored = client.get_provider_regions(&p);
        assert_eq!(stored.len(), 2);
    }

    #[test]
    fn test_add_provider_region_is_idempotent() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[51u8; 32]);
        client.add_provider(&p);
        client.add_provider_region(&p, &Region::Asia);
        client.add_provider_region(&p, &Region::Asia); // duplicate
        assert_eq!(client.get_provider_regions(&p).len(), 1);
    }

    #[test]
    fn test_get_providers_by_region() {
        let (env, _admin, client) = setup();
        let p1 = BytesN::from_array(&env, &[52u8; 32]);
        let p2 = BytesN::from_array(&env, &[53u8; 32]);
        client.add_provider(&p1);
        client.add_provider(&p2);
        let r1 = soroban_sdk::vec![&env, Region::Europe];
        let r2 = soroban_sdk::vec![&env, Region::Asia];
        client.set_provider_regions(&p1, &r1);
        client.set_provider_regions(&p2, &r2);
        let europe_providers = client.get_providers_by_region(&Region::Europe);
        assert_eq!(europe_providers.len(), 1);
        assert_eq!(europe_providers.get(0).unwrap(), p1);
    }

    #[test]
    fn test_set_provider_regions_for_unregistered_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[54u8; 32]);
        let regions = soroban_sdk::vec![&env, Region::Africa];
        let err = client
            .try_set_provider_regions(&p, &regions)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::ProviderNotFound);
    }

    // -----------------------------------------------------------------------
    // #193 – Provider capacity management
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_and_get_provider_capacity() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[60u8; 32]);
        client.add_provider(&p);
        client.set_provider_capacity(&p, &10u32);
        let cap = client.get_provider_capacity(&p);
        assert_eq!(cap.max_concurrent, 10);
        assert_eq!(cap.active_requests, 0);
    }

    #[test]
    fn test_set_provider_capacity_zero_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[61u8; 32]);
        client.add_provider(&p);
        let err = client
            .try_set_provider_capacity(&p, &0u32)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::InvalidCapacity);
    }

    #[test]
    fn test_has_capacity_true_when_not_at_limit() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[62u8; 32]);
        client.add_provider(&p);
        client.set_provider_capacity(&p, &5u32);
        assert!(client.has_capacity(&p));
    }

    #[test]
    fn test_increment_and_decrement_active_requests() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[63u8; 32]);
        client.add_provider(&p);
        client.set_provider_capacity(&p, &3u32);
        client.increment_active_requests(&p);
        client.increment_active_requests(&p);
        assert_eq!(client.get_provider_capacity(&p).active_requests, 2);
        client.decrement_active_requests(&p);
        assert_eq!(client.get_provider_capacity(&p).active_requests, 1);
    }

    #[test]
    fn test_increment_beyond_capacity_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[64u8; 32]);
        client.add_provider(&p);
        client.set_provider_capacity(&p, &1u32);
        client.increment_active_requests(&p);
        let err = client
            .try_increment_active_requests(&p)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::CapacityExceeded);
    }

    #[test]
    fn test_has_capacity_true_when_no_capacity_set() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[65u8; 32]);
        client.add_provider(&p);
        // No capacity configured → unlimited → has_capacity returns true
        assert!(client.has_capacity(&p));
    }

    // -----------------------------------------------------------------------
    // #194 – Provider specializations
    // -----------------------------------------------------------------------

    #[test]
    fn test_add_and_get_provider_specialization() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[70u8; 32]);
        client.add_provider(&p);
        client.add_provider_specialization(&p, &Specialization::ImageVerification);
        let specs = client.get_provider_specializations(&p);
        assert_eq!(specs.len(), 1);
        assert_eq!(specs.get(0).unwrap(), Specialization::ImageVerification);
    }

    #[test]
    fn test_add_specialization_idempotent() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[71u8; 32]);
        client.add_provider(&p);
        client.add_provider_specialization(&p, &Specialization::VideoVerification);
        client.add_provider_specialization(&p, &Specialization::VideoVerification);
        assert_eq!(client.get_provider_specializations(&p).len(), 1);
    }

    #[test]
    fn test_remove_provider_specialization() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[72u8; 32]);
        client.add_provider(&p);
        client.add_provider_specialization(&p, &Specialization::AiDetection);
        client.add_provider_specialization(&p, &Specialization::DocumentVerification);
        client.remove_provider_specialization(&p, &Specialization::AiDetection);
        let specs = client.get_provider_specializations(&p);
        assert_eq!(specs.len(), 1);
        assert_eq!(specs.get(0).unwrap(), Specialization::DocumentVerification);
    }

    #[test]
    fn test_get_providers_by_specialization() {
        let (env, _admin, client) = setup();
        let p1 = BytesN::from_array(&env, &[73u8; 32]);
        let p2 = BytesN::from_array(&env, &[74u8; 32]);
        client.add_provider(&p1);
        client.add_provider(&p2);
        client.add_provider_specialization(&p1, &Specialization::AudioVerification);
        let providers = client.get_providers_by_specialization(&Specialization::AudioVerification);
        assert_eq!(providers.len(), 1);
        assert_eq!(providers.get(0).unwrap(), p1);
    }

    #[test]
    fn test_add_specialization_for_unregistered_provider_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[75u8; 32]);
        let err = client
            .try_add_provider_specialization(&p, &Specialization::ImageVerification)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::ProviderNotFound);
    }

    // -----------------------------------------------------------------------
    // #195 – Provider blacklist / whitelist
    // -----------------------------------------------------------------------

    #[test]
    fn test_blacklist_and_is_blacklisted() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[80u8; 32]);
        client.add_provider(&p);
        client.blacklist_provider(&p, &1u32);
        assert!(client.is_blacklisted(&p));
    }

    #[test]
    fn test_get_blacklist_entry() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[81u8; 32]);
        client.add_provider(&p);
        client.blacklist_provider(&p, &42u32);
        let entry = client.get_blacklist_entry(&p);
        assert_eq!(entry.reason_code, 42u32);
    }

    #[test]
    fn test_whitelist_provider_removes_from_blacklist() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[82u8; 32]);
        client.add_provider(&p);
        client.blacklist_provider(&p, &1u32);
        assert!(client.is_blacklisted(&p));
        client.whitelist_provider(&p);
        assert!(!client.is_blacklisted(&p));
    }

    #[test]
    fn test_whitelist_non_blacklisted_provider_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[83u8; 32]);
        client.add_provider(&p);
        let err = client.try_whitelist_provider(&p).unwrap_err().unwrap();
        assert_eq!(err, Error::NotBlacklisted);
    }

    #[test]
    fn test_is_provider_authorized_registered_and_clean() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[84u8; 32]);
        client.add_provider(&p);
        assert!(client.is_provider_authorized(&p));
    }

    #[test]
    fn test_is_provider_authorized_blacklisted_returns_error() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[85u8; 32]);
        client.add_provider(&p);
        client.blacklist_provider(&p, &1u32);
        let err = client.try_is_provider_authorized(&p).unwrap_err().unwrap();
        assert_eq!(err, Error::ProviderBlacklisted);
    }

    #[test]
    fn test_is_provider_authorized_unregistered_returns_false() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[86u8; 32]);
        assert!(!client.is_provider_authorized(&p));
    }

    #[test]
    fn test_get_blacklist_entry_not_blacklisted_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[87u8; 32]);
        client.add_provider(&p);
        let err = client.try_get_blacklist_entry(&p).unwrap_err().unwrap();
        assert_eq!(err, Error::NotBlacklisted);
    }

    // -----------------------------------------------------------------------
    // #189 – reject application path
    // -----------------------------------------------------------------------

    #[test]
    fn test_reject_application() {
        let (env, _admin, client) = setup();
        let applicant = Address::generate(&env);
        let provider_key = BytesN::from_array(&env, &[90u8; 32]);
        let id = client.submit_provider_application(
            &applicant,
            &provider_key,
            &String::from_str(&env, "test"),
        );
        client.review_application(&id, &false);
        let app = client.get_application(&id).unwrap();
        assert_eq!(app.status, ApplicationStatus::Rejected);
        // Rejected provider must NOT be registered
        assert!(!client.is_provider(&provider_key));
    }

    // -----------------------------------------------------------------------
    // #163 – multisig: execute before timelock elapses
    // -----------------------------------------------------------------------

    #[test]
    fn test_execute_proposal_before_timelock_fails() {
        let (env, _admin, client) = setup();
        let h = BytesN::from_array(&env, &[1u8; 32]);
        let operation = ProposalOperation::AddTeeHash(h);
        // Timelock = 100 ledgers; current sequence starts at 0
        let pid = client
            .try_propose_operation(&operation, &100u32)
            .unwrap()
            .unwrap();
        client.try_approve_proposal(&pid).unwrap().unwrap();
        // Do NOT advance the ledger — should fail
        let err = client.try_execute_proposal(&pid).unwrap_err().unwrap();
        assert_eq!(err, Error::InvalidThreshold);
    }

    // -----------------------------------------------------------------------
    // #24 – verify_and_mint hash mismatch
    // -----------------------------------------------------------------------

    #[test]
    fn test_verify_and_mint_hash_mismatch_returns_failure() {
        let (env, _admin, client) = setup();
        let content = Bytes::from_slice(&env, b"real content");
        let bad_hash = BytesN::from_array(&env, &[0xFFu8; 32]);
        let owner = Address::generate(&env);
        let result = client.verify_and_mint(&content, &bad_hash, &owner);
        assert!(!result.success);
        assert_eq!(result.certificate_id, 0);
    }

    // -----------------------------------------------------------------------
    // #454 – Provider groups
    // -----------------------------------------------------------------------

    #[test]
    fn test_create_and_get_provider_group() {
        let (env, _admin, client) = setup();
        let id = client.create_provider_group(
            &String::from_str(&env, "EU Verifiers"),
            &String::from_str(&env, "Providers operating in the EU"),
        );
        assert_eq!(id, 1);

        let group = client.get_provider_group(&id);
        assert_eq!(group.name, String::from_str(&env, "EU Verifiers"));
        assert_eq!(
            group.description,
            String::from_str(&env, "Providers operating in the EU")
        );
        assert_eq!(group.members.len(), 0);
    }

    #[test]
    fn test_create_provider_group_non_admin_panics_result() {
        let env = Env::default();
        let cid = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &cid);
        let admin = Address::generate(&env);
        let provenance = Address::generate(&env);
        client.init(&admin, &provenance);

        let result = client.try_create_provider_group(
            &String::from_str(&env, "Name"),
            &String::from_str(&env, "Desc"),
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_update_provider_group() {
        let (env, _admin, client) = setup();
        let id = client.create_provider_group(
            &String::from_str(&env, "Old Name"),
            &String::from_str(&env, "Old Desc"),
        );
        client.update_provider_group(
            &id,
            &String::from_str(&env, "New Name"),
            &String::from_str(&env, "New Desc"),
        );
        let group = client.get_provider_group(&id);
        assert_eq!(group.name, String::from_str(&env, "New Name"));
        assert_eq!(group.description, String::from_str(&env, "New Desc"));
    }

    #[test]
    fn test_update_nonexistent_group_fails() {
        let (env, _admin, client) = setup();
        let err = client
            .try_update_provider_group(
                &999u64,
                &String::from_str(&env, "Name"),
                &String::from_str(&env, "Desc"),
            )
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::GroupNotFound);
    }

    #[test]
    fn test_add_provider_to_group_and_query_members() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[100u8; 32]);
        client.add_provider(&p);

        let id = client.create_provider_group(
            &String::from_str(&env, "Group"),
            &String::from_str(&env, "Desc"),
        );
        client.add_provider_to_group(&id, &p);

        let members = client.get_group_members(&id);
        assert_eq!(members.len(), 1);
        assert_eq!(members.get(0).unwrap(), p);
    }

    #[test]
    fn test_add_provider_to_group_is_idempotent() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[101u8; 32]);
        client.add_provider(&p);

        let id = client.create_provider_group(
            &String::from_str(&env, "Group"),
            &String::from_str(&env, "Desc"),
        );
        client.add_provider_to_group(&id, &p);
        client.add_provider_to_group(&id, &p); // duplicate

        assert_eq!(client.get_group_members(&id).len(), 1);
    }

    #[test]
    fn test_add_unregistered_provider_to_group_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[102u8; 32]);

        let id = client.create_provider_group(
            &String::from_str(&env, "Group"),
            &String::from_str(&env, "Desc"),
        );
        let err = client
            .try_add_provider_to_group(&id, &p)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::ProviderNotFound);
    }

    #[test]
    fn test_add_provider_to_nonexistent_group_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[103u8; 32]);
        client.add_provider(&p);

        let err = client
            .try_add_provider_to_group(&999u64, &p)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::GroupNotFound);
    }

    #[test]
    fn test_remove_provider_from_group() {
        let (env, _admin, client) = setup();
        let p1 = BytesN::from_array(&env, &[104u8; 32]);
        let p2 = BytesN::from_array(&env, &[105u8; 32]);
        client.add_provider(&p1);
        client.add_provider(&p2);

        let id = client.create_provider_group(
            &String::from_str(&env, "Group"),
            &String::from_str(&env, "Desc"),
        );
        client.add_provider_to_group(&id, &p1);
        client.add_provider_to_group(&id, &p2);
        client.remove_provider_from_group(&id, &p1);

        let members = client.get_group_members(&id);
        assert_eq!(members.len(), 1);
        assert_eq!(members.get(0).unwrap(), p2);
    }

    #[test]
    fn test_remove_from_nonexistent_group_fails() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[106u8; 32]);
        client.add_provider(&p);

        let err = client
            .try_remove_provider_from_group(&999u64, &p)
            .unwrap_err()
            .unwrap();
        assert_eq!(err, Error::GroupNotFound);
    }

    #[test]
    fn test_get_groups_for_provider() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[107u8; 32]);
        client.add_provider(&p);

        let g1 = client.create_provider_group(
            &String::from_str(&env, "Group 1"),
            &String::from_str(&env, "Desc"),
        );
        let g2 = client.create_provider_group(
            &String::from_str(&env, "Group 2"),
            &String::from_str(&env, "Desc"),
        );
        client.add_provider_to_group(&g1, &p);
        client.add_provider_to_group(&g2, &p);

        let groups = client.get_groups_for_provider(&p);
        assert_eq!(groups.len(), 2);
        assert!(groups.contains(&g1));
        assert!(groups.contains(&g2));
    }

    #[test]
    fn test_remove_provider_from_group_updates_reverse_index() {
        let (env, _admin, client) = setup();
        let p = BytesN::from_array(&env, &[108u8; 32]);
        client.add_provider(&p);

        let id = client.create_provider_group(
            &String::from_str(&env, "Group"),
            &String::from_str(&env, "Desc"),
        );
        client.add_provider_to_group(&id, &p);
        assert_eq!(client.get_groups_for_provider(&p).len(), 1);

        client.remove_provider_from_group(&id, &p);
        assert_eq!(client.get_groups_for_provider(&p).len(), 0);
    }

    #[test]
    fn test_get_provider_group_not_found() {
        let (_env, _admin, client) = setup();
        let err = client.try_get_provider_group(&999u64).unwrap_err().unwrap();
        assert_eq!(err, Error::GroupNotFound);
    }

    #[test]
    fn test_get_group_members_not_found() {
        let (_env, _admin, client) = setup();
        let err = client.try_get_group_members(&999u64).unwrap_err().unwrap();
        assert_eq!(err, Error::GroupNotFound);
    }
}

// #654 — integration tests covering multi-step workflows, storage mutations,
// event emission, and error paths across the registry contract.
#[cfg(test)]
mod integration_tests;
#[cfg(test)]
mod smoke_tests;
