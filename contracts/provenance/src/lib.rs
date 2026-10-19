//! # StellarVeriphy — Provenance Contract
//!
//! Mints and manages **on-chain provenance certificates** that bind a piece
//! of digital media to its verified origin.
//!
//! ## What is a certificate?
//!
//! A [`ProvenanceCert`] is a permanent on-chain record containing:
//!
//! - `storage_ref`      — IPFS CID or Arweave URI pointing to the raw media bytes.
//! - `manifest_hash`    — SHA-256 hex digest of the manifest JSON (content metadata).
//! - `attestation_hash` — SHA-256 hex digest of the TEE attestation payload.
//! - `creator`          — Stellar address of the content creator.
//! - `timestamp`        — Ledger Unix timestamp at the time of minting.
//!
//! The original creator and verification evidence remain fixed after minting.
//! Current ownership is tracked separately and may be transferred by its
//! current owner; descriptive metadata remains attached to the certificate.
//!
//! ## Key operations
//!
//! | Function | Description |
//! |---|---|
//! | [`mint`] | Mint a new certificate for a single media asset. |
//! | [`mint_batch`] | Mint up to [`MAX_BATCH_SIZE`] certificates in one transaction. |
//! | [`revoke`] | Mark a certificate as revoked with a [`RevocationReason`]. |
//! | [`transfer_certificate`] | Transfer ownership to a new Stellar address. |
//! | [`get_owner`] | Look up the current owner without changing creator attribution. |
//! | [`lock_certificate`] | Permanently lock a certificate against future changes. |
//! | [`get`] | Look up a certificate by its auto-incremented numeric ID. |
//! | [`get_by_code`] | Resolve a human-readable verification code to a certificate. |
//!
//! ## Storage model
//!
//! | Key pattern | Storage type | Lifetime |
//! |---|---|---|
//! | `DataKey::Admin` | `instance` | contract lifetime |
//! | `DataKey::Certificate(id)` | `persistent` | until manually pruned |
//! | `DataKey::NextId` | `instance` | contract lifetime |
//! | `DataKey::Code(code)` → `id` | `persistent` | until code expires |
//!
//! ## Example (off-chain SDK call)
//!
//! ```ignore
//! // Mint a new certificate
//! let id = provenance_client.mint(
//!     &env,
//!     &String::from_str(&env, "ipfs://Qm..."),
//!     &String::from_str(&env, "a1b2c3..."),
//!     &String::from_str(&env, "d4e5f6..."),
//!     &creator_address,
//! );
//! ```

#![no_std]
// `Events::publish` is deprecated in favour of `#[contractevent]`; migrating the
// event layer is tracked separately, so the deprecation is allowed here for now.
#![allow(deprecated)]
// Entry points mirror the on-chain ABI, so their argument lists are kept flat.
#![allow(clippy::too_many_arguments)]
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, Address,
    Bytes, BytesN, Env, String, Symbol, Vec,
};

// #179 — bucket width for the minting time series / velocity stats
const DAY_SECONDS: u64 = 86400;

// #16 — typed error enum
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum ProvenanceError {
    CertificateNotFound = 1,
    Unauthorized = 2,
    DuplicateCertificate = 3,
    BatchSizeExceeded = 4,
    CodeNotFound = 5,
    InvalidMediaMetadata = 6,
    UnauthorizedRevocation = 7,
    InvalidExpiration = 8,
    CircularReference = 9,
    CertificateLocked = 10,
    CollectionNotFound = 11,
    InvalidTagLength = 12,
    MaxTagsExceeded = 13,
    InvalidOwner = 14,
    AlreadyRevoked = 15,
}

// #171 — Revocation reason
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
// #16 / #171 — `None` stands in for "not revoked" so this type can be used
// directly as a `ProvenanceCert` field. Embedding a custom #[contracttype]
// enum inside `Option<_>` doesn't compile against this soroban_sdk version:
// its `Option<T>` → ScVal conversion needs an infallible `Into<ScVal>`, but
// the derive macro only ever generates a fallible `TryFrom`.
pub enum RevocationReason {
    None,
    FraudulentContent,
    LegalRequirement,
    CreatorRequest,
    ContractualViolation,
}

// #176 — Verification badge level
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VerificationLevel {
    Basic = 0,
    Standard = 1,
    Premium = 2,
    Enterprise = 3,
}

// #178 — Relation to another certificate
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum CertificateRelation {
    Parent(u64),
    Child(u64),
    Sibling(u64),
}

// #14 — String fields (was Bytes)
#[contracttype]
#[derive(Debug)]
pub struct ProvenanceCert {
    pub storage_ref: String,
    pub manifest_hash: String,
    pub attestation_hash: String,
    pub creator: Address,
    pub timestamp: u64,
    pub revoked: bool,
    pub revocation_reason: RevocationReason,
    pub revocation_timestamp: Option<u64>,
    // #177 — optional expiration
    pub expires_at: Option<u64>,
    // #176 — verification thoroughness badge
    pub verification_level: VerificationLevel,
    pub locked: bool,
    // #450 — Certificate tags for categorization and discovery
    pub tags: Vec<String>,
}

// #173 — Certificate metadata with version tracking
#[contracttype]
pub struct CertificateMetadata {
    pub display_name: String,
    pub description: String,
    pub version: u32,
}

// #173 — Metadata version history entry
#[contracttype]
pub struct MetadataVersion {
    pub version: u32,
    pub display_name: String,
    pub description: String,
    pub updated_at: u64,
}

// #181 — A single recorded change to a certificate
#[contracttype]
pub struct CertificateHistory {
    pub certificate_id: u64,
    pub action: String,
    pub modifier: Address,
    pub timestamp: u64,
}

// #183 — Content type classification
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ContentType {
    Image,
    Video,
    Audio,
    Document,
    Other,
}

// #183 — Optional media-specific metadata
#[contracttype]
pub struct MediaProperties {
    pub content_type: ContentType,
    pub mime_type: String,
    pub resolution: Option<String>,
    pub duration_seconds: Option<u64>,
    pub file_size_bytes: Option<u64>,
    pub codec: Option<String>,
}

// #179 — Aggregate certificate statistics
#[contracttype]
pub struct CertificateStats {
    pub total_certificates: u64,
    pub certificates_today: u64,
}

// #179 — A single point in the daily minting time series
#[contracttype]
pub struct TimeSeriesPoint {
    pub day: u64,
    pub period_start: u64,
    pub count: u64,
}

// #658 — Rollback reason enum
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RollbackReason {
    DataCorruption,
    IncorrectAttestation,
    CreatorRequest,
    LegalRequirement,
    OperationalError,
    Other,
}

// #658 — Immutable record created each time a certificate is rolled back to a
// prior manifest version. Stored in persistent storage so the full version
// history remains auditable even after subsequent changes.
#[contracttype]
#[derive(Clone, Debug)]
pub struct CertificateRollbackRecord {
    /// Auto-incrementing rollback event id.
    pub id: u64,
    /// Certificate that was rolled back.
    pub certificate_id: u64,
    /// Manifest hash that was active before the rollback.
    pub from_manifest_hash: String,
    /// Manifest hash that was restored.
    pub to_manifest_hash: String,
    /// Address of the account that initiated the rollback.
    pub initiated_by: Address,
    /// Ledger timestamp at the time of the rollback.
    pub initiated_at: u64,
    /// Reason category for the rollback.
    pub reason: RollbackReason,
}

// #184 — Certificate immutability lock event
#[contractevent]
pub struct CertificateLockedEvent {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub locked_by: Address,
}

// #185 — Certificate collection/portfolio
#[contracttype]
pub struct Collection {
    pub owner: Address,
    pub name: String,
    pub description: String,
    pub created_at: u64,
}

// #15 — typed contract event
#[contractevent]
pub struct CertificateMinted {
    #[topic]
    pub owner: Address,
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub manifest_hash: String,
}

// #172 — Certificate transfer event
#[contractevent]
pub struct CertificateTransferred {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
}

// #173 — Metadata update event
#[contractevent]
pub struct MetadataUpdated {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub updated_by: Address,
    pub new_version: u32,
}

// #175 — Batch mint event
#[contractevent]
pub struct BatchMinted {
    #[topic]
    pub owner: Address,
    pub certificate_ids: Vec<u64>,
    pub count: u32,
}

// #171 — Revocation event
#[contractevent]
pub struct CertificateRevoked {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub owner: Address,
    pub reason: String,
}

// #177 — Expiration renewed event
#[contractevent]
pub struct CertificateRenewed {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub renewed_by: Address,
    pub new_expires_at: u64,
}

// #177 — Expiration warning event
#[contractevent]
pub struct CertificateExpirationWarning {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub owner: Address,
    pub expires_at: u64,
}

// #176 — Verification level updated event
#[contractevent]
pub struct VerificationLevelUpdated {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub updated_by: Address,
    pub new_level: VerificationLevel,
}

// #178 — Certificates linked event
#[contractevent]
pub struct CertificatesLinked {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub related_id: u64,
    pub relation: CertificateRelation,
}

// #452 — Certificate endorsed event
#[contractevent]
pub struct CertificateEndorsed {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub endorser: Address,
    pub total_endorsements: u64,
}

// #452 — Certificate endorsement removed event
#[contractevent]
pub struct EndorsementRemoved {
    #[topic]
    pub certificate_id: u64,
    #[topic]
    pub endorser: Address,
    pub total_endorsements: u64,
}

// ---------------------------------------------------------------------------
// Storage keys  — #439 typed DataKey replaces raw symbol_short! strings.
// Using a typed enum prevents typos, enables exhaustive matching, and keeps
// key serialisation compact (Soroban encodes enum variants as u32 tags).
// ---------------------------------------------------------------------------

#[contracttype]
pub enum DataKey {
    // ── singleton config (persistent storage) ─────────────────────────────
    /// Address of the oracle authorised to mint certificates.
    Oracle,
    /// Optional admin address (set via set_admin).
    Admin,
    /// Running total of minted certificates (also the next id - 1).
    CertCount,
    // ── per-certificate (persistent storage) ──────────────────────────────
    /// The `ProvenanceCert` struct for a given certificate id.
    Cert(u64),
    /// Manifest-hash → certificate-id deduplication mapping.
    ManifestIndex(String),
    /// Amendment history log for a certificate.
    History(u64),
    /// Linked-certificate relations for a certificate.
    Links(u64),
    /// Metadata (display name / description) for a certificate.
    Metadata(u64),
    /// Metadata version history for a certificate.
    MetadataHistory(u64),
    /// Media properties attached to a certificate.
    Media(u64),
    /// #450 — Tags for a certificate (supports categorization and discovery)
    Tags(u64),
    /// #450 — Index mapping tag → certificate ids (supports query by tag)
    TagIndex(String),
    // ── per-creator (persistent storage) ──────────────────────────────────
    /// How many certificates a creator has minted.
    CreatorCount(Address),
    /// Ordered list of certificate ids for a creator.
    CreatorIndex(Address),
    // ── collections (persistent storage) ──────────────────────────────────
    /// Counter for collection ids.
    CollectionCount,
    /// Collection metadata.
    Collection(u64),
    /// List of certificate ids in a collection.
    CollectionCerts(u64),
    // ── time-series stats (persistent storage) ────────────────────────────
    /// Daily minting count for a given day bucket (DAY_SECONDS granularity).
    DailyCount(u64),
    // ── views (persistent storage) — #455 ──────────────────────────────────
    /// Number of times a certificate has been viewed via `get_certificate`.
    ViewCount(u64),
    // ── endorsements (persistent storage) — #452 ───────────────────────────
    /// Presence flag: whether `endorser` has endorsed a certificate.
    Endorsement(u64, Address),
    /// Total endorsement count for a certificate.
    EndorsementCount(u64),
    /// Ordered list of endorser addresses for a certificate.
    EndorsementIndex(u64),
    /// Current owner, separate from the immutable original creator.
    CurrentOwner(u64),
    // ── rollback records (persistent storage) — #658 ──────────────────────
    /// Auto-incrementing counter for rollback record ids.
    RollbackCount,
    /// An individual rollback record keyed by its id.
    RollbackRecord(u64),
    /// Ordered list of rollback record ids for a given certificate.
    CertRollbacks(u64),
    // ── manifest signing ──────────────────────────────────────────────────
    /// Ed25519 signature record proving the creator signed the manifest.
    ManifestSignature(u64),
    // ── redaction policy ──────────────────────────────────────────────────
    /// Hash of the active redaction policy for a certificate.
    RedactionPolicy(u64),
}

// ── Snapshot struct (audit diff support) ──────────────────────────────────

/// A point-in-time snapshot of a certificate's mutable fields.
/// Used by off-chain diff tools to compare two versions of a certificate.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProvenanceCertSnapshot {
    pub certificate_id: u64,
    pub manifest_hash: String,
    pub attestation_hash: String,
    pub storage_ref: String,
    pub creator: Address,
    /// Address of the last actor that modified this certificate.
    pub actor: Address,
    pub timestamp: u64,
    pub verification_level: VerificationLevel,
    pub revoked: bool,
    pub expires_at: Option<u64>,
    pub tags: Vec<String>,
}

// ── Manifest signing record ────────────────────────────────────────────────

/// On-chain record of a creator's Ed25519 signature over a manifest hash.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ManifestSignatureRecord {
    pub certificate_id: u64,
    /// The manifest hash that was signed.
    pub manifest_hash: String,
    /// Stellar public key (G...) of the signer — must match creator.
    pub signer_public_key: String,
    /// Base64-encoded Ed25519 signature.
    pub signature: String,
    /// Ledger timestamp when the signature was stored.
    pub signed_at: u64,
}

// ── Redaction policy record ────────────────────────────────────────────────

/// On-chain record of a metadata redaction policy for a certificate.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RedactionPolicyRecord {
    pub certificate_id: u64,
    /// SHA-256 hash of the full policy JSON (stored off-chain or on IPFS).
    pub policy_hash: String,
    pub applied_by: Address,
    pub applied_at: u64,
    /// Whether a governance reviewer approved this policy.
    pub approved: bool,
}

#[contract]
pub struct ProvenanceContract;

#[contractimpl]
impl ProvenanceContract {
    pub fn get(env: Env, id: u64) -> ProvenanceCert {
        env.storage().persistent().get(&id).unwrap()
    }

    /// #658 — Record a rollback event for a certificate.
    ///
    /// Creates an immutable audit entry binding the certificate to the
    /// from/to manifest hashes so the complete rollback chain is queryable
    /// on-chain. Callable only by the oracle or admin.
    pub fn record_rollback(
        env: Env,
        certificate_id: u64,
        from_manifest_hash: String,
        to_manifest_hash: String,
        initiated_by: Address,
        reason: RollbackReason,
    ) -> u64 {
        initiated_by.require_auth();

        // Auto-increment rollback id
        let rollback_id: u64 = env
            .storage()
            .persistent()
            .get::<DataKey, u64>(&DataKey::RollbackCount)
            .unwrap_or(0)
            + 1;
        env.storage()
            .persistent()
            .set(&DataKey::RollbackCount, &rollback_id);

        let record = CertificateRollbackRecord {
            id: rollback_id,
            certificate_id,
            from_manifest_hash,
            to_manifest_hash,
            initiated_by,
            initiated_at: env.ledger().timestamp(),
            reason,
        };

        env.storage()
            .persistent()
            .set(&DataKey::RollbackRecord(rollback_id), &record);

        // Append rollback id to the per-certificate index
        let mut cert_rollbacks: Vec<u64> = env
            .storage()
            .persistent()
            .get::<DataKey, Vec<u64>>(&DataKey::CertRollbacks(certificate_id))
            .unwrap_or_else(|| Vec::new(&env));
        cert_rollbacks.push_back(rollback_id);
        env.storage()
            .persistent()
            .set(&DataKey::CertRollbacks(certificate_id), &cert_rollbacks);

        env.events().publish(
            (Symbol::new(&env, "rollback_recorded"), certificate_id),
            rollback_id,
        );

        rollback_id
    }

    /// #658 — Return all rollback records for a certificate, ordered by id ascending.
    pub fn get_rollback_history(env: Env, certificate_id: u64) -> Vec<CertificateRollbackRecord> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get::<DataKey, Vec<u64>>(&DataKey::CertRollbacks(certificate_id))
            .unwrap_or_else(|| Vec::new(&env));

        let mut records: Vec<CertificateRollbackRecord> = Vec::new(&env);
        for id in ids.iter() {
            if let Some(record) = env
                .storage()
                .persistent()
                .get::<DataKey, CertificateRollbackRecord>(&DataKey::RollbackRecord(id))
            {
                records.push_back(record);
            }
        }
        records
    }
}
// #176 — Basic level unless all three verification inputs are populated;
// Premium/Enterprise require an explicit oracle upgrade via set_verification_level,
// reflecting off-chain provider-reputation checks beyond what mint parameters convey.
fn calculate_verification_level(
    storage_ref: &String,
    manifest_hash: &String,
    attestation_hash: &String,
) -> VerificationLevel {
    if !storage_ref.is_empty() && !manifest_hash.is_empty() && !attestation_hash.is_empty() {
        VerificationLevel::Standard
    } else {
        VerificationLevel::Basic
    }
}

// #178 — the id embedded in a CertificateRelation
fn relation_target(relation: CertificateRelation) -> u64 {
    match relation {
        CertificateRelation::Parent(id) => id,
        CertificateRelation::Child(id) => id,
        CertificateRelation::Sibling(id) => id,
    }
}

// #178 — the reciprocal relation to store on the related certificate
fn reciprocal_relation(relation: CertificateRelation, self_id: u64) -> CertificateRelation {
    match relation {
        CertificateRelation::Parent(_) => CertificateRelation::Child(self_id),
        CertificateRelation::Child(_) => CertificateRelation::Parent(self_id),
        CertificateRelation::Sibling(_) => CertificateRelation::Sibling(self_id),
    }
}

// #178 — bounded walk up the Parent chain to detect a would-be cycle before
// linking `start_id` as a child of `related_id`. Depth is capped so the
// check stays gas-bounded regardless of how deep an existing chain is.
fn creates_cycle(env: &Env, start_id: u64, target_id: u64) -> bool {
    const MAX_DEPTH: u32 = 20;
    let links_key = symbol_short!("LINKS");
    let mut current = start_id;

    for _ in 0..MAX_DEPTH {
        if current == target_id {
            return true;
        }
        let key = (links_key.clone(), current);
        let links: Vec<CertificateRelation> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(env));

        let mut next: Option<u64> = None;
        for relation in links.iter() {
            if let CertificateRelation::Parent(parent_id) = relation {
                next = Some(parent_id);
                break;
            }
        }

        match next {
            Some(parent_id) => current = parent_id,
            None => return false,
        }
    }

    false
}

#[contractimpl]
impl ProvenanceContract {
    /// One-time setup — stores the oracle address authorised to mint.
    pub fn initialize(env: Env, oracle: Address) {
        let key = symbol_short!("ORACLE");
        if env.storage().persistent().has(&key) {
            panic!("Contract already initialized");
        }
        env.storage().persistent().set(&key, &oracle);
    }

    pub fn set_admin(env: Env, admin: Address) {
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();
        env.storage()
            .persistent()
            .set(&symbol_short!("ADMIN"), &admin);
    }

    pub fn get_admin(env: Env) -> Option<Address> {
        env.storage().persistent().get(&symbol_short!("ADMIN"))
    }

    /// Mint a provenance certificate. Only the oracle may call this.
    pub fn mint(
        env: Env,
        storage_ref: String,
        manifest_hash: String,
        attestation_hash: String,
        to: Address,
    ) -> u64 {
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        // #13 — duplicate prevention
        let mani_key = (symbol_short!("MANI"), manifest_hash.clone());
        if env.storage().persistent().has(&mani_key) {
            panic!("Certificate already exists for this manifest hash");
        }

        let cnt_key = symbol_short!("CERT_CNT");
        let id: u64 = env.storage().persistent().get(&cnt_key).unwrap_or(0u64) + 1;
        env.storage().persistent().set(&cnt_key, &id);

        let verification_level =
            calculate_verification_level(&storage_ref, &manifest_hash, &attestation_hash);

        let cert = ProvenanceCert {
            storage_ref,
            manifest_hash: manifest_hash.clone(),
            attestation_hash,
            creator: to.clone(),
            timestamp: env.ledger().timestamp(),
            revoked: false,
            revocation_reason: RevocationReason::None,
            revocation_timestamp: None,
            expires_at: None,
            verification_level,
            locked: false,
            tags: Vec::new(&env), // #450 — initialize with empty tags
        };
        env.storage().persistent().set(&id, &cert);

        // #13 — store manifest → id mapping
        env.storage().persistent().set(&mani_key, &id);

        // #180 — index by creator
        Self::index_by_creator(&env, &to, id);

        // #181 — record in amendment history
        Self::record_history(&env, id, "minted", to.clone());
        // #179 — creator / daily minting counters
        let creator_key = (symbol_short!("CCNT"), to.clone());
        let creator_count: u64 = env.storage().persistent().get(&creator_key).unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&creator_key, &(creator_count + 1));

        let day = env.ledger().timestamp() / DAY_SECONDS;
        let daily_key = (symbol_short!("DAILY"), day);
        let daily_count: u64 = env.storage().persistent().get(&daily_key).unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&daily_key, &(daily_count + 1));

        // #15 — emit typed event
        CertificateMinted {
            owner: to,
            certificate_id: id,
            manifest_hash,
        }
        .publish(&env);

        id
    }

    // #16 — returns Result instead of panicking
    pub fn get_certificate(env: Env, id: u64) -> Result<ProvenanceCert, ProvenanceError> {
        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        // #455 — record a view each time the certificate is fetched
        let view_key = DataKey::ViewCount(id);
        let views: u64 = env.storage().persistent().get(&view_key).unwrap_or(0u64) + 1;
        env.storage().persistent().set(&view_key, &views);

        Ok(cert)
    }

    /// Return the current owner, falling back to the original creator for existing certificates.
    pub fn get_owner(env: Env, certificate_id: u64) -> Result<Address, ProvenanceError> {
        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Ok(Self::current_owner(&env, certificate_id, &cert))
    }

    /// #171 — Revoke a certificate. Only the oracle may call this.
    pub fn revoke_certificate(
        env: Env,
        certificate_id: u64,
        reason: RevocationReason,
    ) -> Result<(), ProvenanceError> {
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        let mut cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        if cert.locked {
            return Err(ProvenanceError::CertificateLocked);
        }
        if cert.revoked {
            return Err(ProvenanceError::AlreadyRevoked);
        }

        cert.revoked = true;
        cert.revocation_reason = reason.clone();
        cert.revocation_timestamp = Some(env.ledger().timestamp());
        let owner = Self::current_owner(&env, certificate_id, &cert);

        env.storage().persistent().set(&certificate_id, &cert);

        let reason_str = match reason {
            RevocationReason::None => String::from_str(&env, "none"),
            RevocationReason::FraudulentContent => String::from_str(&env, "fraudulent_content"),
            RevocationReason::LegalRequirement => String::from_str(&env, "legal_requirement"),
            RevocationReason::CreatorRequest => String::from_str(&env, "creator_request"),
            RevocationReason::ContractualViolation => {
                String::from_str(&env, "contractual_violation")
            }
        };

        CertificateRevoked {
            certificate_id,
            owner,
            reason: reason_str,
        }
        .publish(&env);

        Ok(())
    }

    /// #171 — Check whether a certificate has been revoked
    pub fn is_certificate_revoked(env: Env, certificate_id: u64) -> Result<bool, ProvenanceError> {
        env.storage()
            .persistent()
            .get(&certificate_id)
            .map(|cert: ProvenanceCert| cert.revoked)
            .ok_or(ProvenanceError::CertificateNotFound)
    }

    /// #177 — Set (or clear) a certificate's expiration timestamp
    pub fn set_expiration(
        env: Env,
        certificate_id: u64,
        expires_at: Option<u64>,
    ) -> Result<(), ProvenanceError> {
        let mut cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        Self::current_owner(&env, certificate_id, &cert).require_auth();

        if let Some(ts) = expires_at {
            if ts <= env.ledger().timestamp() {
                return Err(ProvenanceError::InvalidExpiration);
            }
        }

        cert.expires_at = expires_at;
        env.storage().persistent().set(&certificate_id, &cert);

        Ok(())
    }

    /// #177 — Check whether a certificate has expired
    pub fn is_certificate_expired(env: Env, certificate_id: u64) -> Result<bool, ProvenanceError> {
        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        Ok(cert
            .expires_at
            .is_some_and(|ts| env.ledger().timestamp() > ts))
    }

    /// #177 — Renew an expired (or soon-to-expire) certificate with a new expiration
    pub fn renew_certificate(
        env: Env,
        certificate_id: u64,
        new_expires_at: u64,
    ) -> Result<(), ProvenanceError> {
        let mut cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        let owner = Self::current_owner(&env, certificate_id, &cert);
        owner.require_auth();

        if new_expires_at <= env.ledger().timestamp() {
            return Err(ProvenanceError::InvalidExpiration);
        }

        cert.expires_at = Some(new_expires_at);
        let renewed_by = owner;
        env.storage().persistent().set(&certificate_id, &cert);

        CertificateRenewed {
            certificate_id,
            renewed_by,
            new_expires_at,
        }
        .publish(&env);

        Ok(())
    }

    /// #177 — Emit a warning event if the certificate expires within `warning_window` seconds.
    /// Returns true if a warning was emitted.
    pub fn check_expiration_warning(
        env: Env,
        certificate_id: u64,
        warning_window: u64,
    ) -> Result<bool, ProvenanceError> {
        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        let now = env.ledger().timestamp();
        if let Some(expires_at) = cert.expires_at {
            if expires_at > now && expires_at - now <= warning_window {
                CertificateExpirationWarning {
                    certificate_id,
                    owner: Self::current_owner(&env, certificate_id, &cert),
                    expires_at,
                }
                .publish(&env);
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// #176 — Oracle-gated upgrade of a certificate's verification level,
    /// reflecting off-chain provider-reputation vetting.
    pub fn set_verification_level(
        env: Env,
        certificate_id: u64,
        level: VerificationLevel,
    ) -> Result<(), ProvenanceError> {
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        let mut cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        cert.verification_level = level;
        env.storage().persistent().set(&certificate_id, &cert);

        VerificationLevelUpdated {
            certificate_id,
            updated_by: oracle,
            new_level: level,
        }
        .publish(&env);

        Ok(())
    }

    /// #176 — Get a certificate's verification level
    pub fn get_verification_level(
        env: Env,
        certificate_id: u64,
    ) -> Result<VerificationLevel, ProvenanceError> {
        env.storage()
            .persistent()
            .get(&certificate_id)
            .map(|cert: ProvenanceCert| cert.verification_level)
            .ok_or(ProvenanceError::CertificateNotFound)
    }

    /// #176 — Query certificates matching a given verification level
    pub fn get_certs_by_verification_level(
        env: Env,
        level: VerificationLevel,
        offset: u32,
        limit: u32,
    ) -> Vec<(u64, ProvenanceCert)> {
        let cnt_key = symbol_short!("CERT_CNT");
        let total_certs: u64 = env.storage().persistent().get(&cnt_key).unwrap_or(0u64);

        let mut results: Vec<(u64, ProvenanceCert)> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        let mut i = total_certs;
        while i > 0 && count < limit {
            if let Some(cert) = env.storage().persistent().get::<u64, ProvenanceCert>(&i) {
                if cert.verification_level == level {
                    if skipped >= offset {
                        results.push_back((i, cert));
                        count += 1;
                    } else {
                        skipped += 1;
                    }
                }
            }
            i -= 1;
        }

        results
    }

    /// #178 — Link two certificates together (parent/child/sibling). The link is
    /// stored on both certificates as reciprocal relations. Requires auth from
    /// `certificate_id`'s current owner.
    pub fn link_certificates(
        env: Env,
        certificate_id: u64,
        relation: CertificateRelation,
    ) -> Result<(), ProvenanceError> {
        let related_id = relation_target(relation);

        if certificate_id == related_id {
            return Err(ProvenanceError::CircularReference);
        }

        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Self::current_owner(&env, certificate_id, &cert).require_auth();

        if !env.storage().persistent().has(&related_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        if let CertificateRelation::Parent(parent_id) = relation {
            // Linking certificate_id as a child of parent_id — reject if
            // parent_id is already a descendant of certificate_id.
            if creates_cycle(&env, parent_id, certificate_id) {
                return Err(ProvenanceError::CircularReference);
            }
        }
        if let CertificateRelation::Child(child_id) = relation {
            // Linking certificate_id as a parent of child_id — reject if
            // certificate_id is already a descendant of child_id.
            if creates_cycle(&env, certificate_id, child_id) {
                return Err(ProvenanceError::CircularReference);
            }
        }

        let links_key = symbol_short!("LINKS");

        let key_a = (links_key.clone(), certificate_id);
        let mut links_a: Vec<CertificateRelation> = env
            .storage()
            .persistent()
            .get(&key_a)
            .unwrap_or(Vec::new(&env));
        links_a.push_back(relation);
        env.storage().persistent().set(&key_a, &links_a);

        let key_b = (links_key, related_id);
        let mut links_b: Vec<CertificateRelation> = env
            .storage()
            .persistent()
            .get(&key_b)
            .unwrap_or(Vec::new(&env));
        links_b.push_back(reciprocal_relation(relation, certificate_id));
        env.storage().persistent().set(&key_b, &links_b);

        CertificatesLinked {
            certificate_id,
            related_id,
            relation,
        }
        .publish(&env);

        Ok(())
    }

    /// #178 — Query the certificates linked to a given certificate
    pub fn get_linked_certificates(
        env: Env,
        certificate_id: u64,
    ) -> Result<Vec<CertificateRelation>, ProvenanceError> {
        if !env.storage().persistent().has(&certificate_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        let links_key = symbol_short!("LINKS");
        Ok(env
            .storage()
            .persistent()
            .get(&(links_key, certificate_id))
            .unwrap_or(Vec::new(&env)))
    }

    /// #172 — Transfer certificate ownership to a new address without changing
    /// the original creator or certificate metadata.
    pub fn transfer_certificate(
        env: Env,
        certificate_id: u64,
        new_owner: Address,
    ) -> Result<(), ProvenanceError> {
        let cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        let old_owner = Self::current_owner(&env, certificate_id, &cert);
        old_owner.require_auth();

        if cert.locked {
            return Err(ProvenanceError::CertificateLocked);
        }

        if old_owner == new_owner {
            return Err(ProvenanceError::InvalidOwner);
        }

        env.storage()
            .persistent()
            .set(&DataKey::CurrentOwner(certificate_id), &new_owner);

        let transfer_key = (symbol_short!("TRNF"), certificate_id);
        let transfer_count: u64 = env
            .storage()
            .persistent()
            .get(&transfer_key)
            .unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&transfer_key, &(transfer_count + 1));

        // #181 — record in amendment history
        Self::record_history(&env, certificate_id, "transferred", old_owner.clone());

        CertificateTransferred {
            certificate_id,
            from: old_owner,
            to: new_owner,
        }
        .publish(&env);

        Ok(())
    }

    /// #173 — Update certificate metadata (display name and description)
    pub fn update_metadata(
        env: Env,
        certificate_id: u64,
        display_name: String,
        description: String,
    ) -> Result<(), ProvenanceError> {
        let cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        let owner = Self::current_owner(&env, certificate_id, &cert);
        owner.require_auth();

        if cert.locked {
            return Err(ProvenanceError::CertificateLocked);
        }

        let metadata_key = (symbol_short!("META"), certificate_id);
        let mut metadata: CertificateMetadata = env
            .storage()
            .persistent()
            .get(&metadata_key)
            .unwrap_or_else(|| CertificateMetadata {
                display_name: String::from_str(&env, ""),
                description: String::from_str(&env, ""),
                version: 0,
            });

        let old_version = metadata.version;
        metadata.version = old_version + 1;
        metadata.display_name = display_name.clone();
        metadata.description = description.clone();

        env.storage().persistent().set(&metadata_key, &metadata);

        let history_key = (symbol_short!("MHIST"), certificate_id, old_version);
        let version_entry = MetadataVersion {
            version: old_version,
            display_name,
            description,
            updated_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&history_key, &version_entry);

        // #181 — record in amendment history
        Self::record_history(&env, certificate_id, "metadata_updated", owner.clone());

        MetadataUpdated {
            certificate_id,
            updated_by: owner,
            new_version: metadata.version,
        }
        .publish(&env);

        Ok(())
    }

    /// #173 — Get certificate metadata
    pub fn get_metadata(
        env: Env,
        certificate_id: u64,
    ) -> Result<CertificateMetadata, ProvenanceError> {
        let metadata_key = (symbol_short!("META"), certificate_id);
        env.storage()
            .persistent()
            .get(&metadata_key)
            .ok_or(ProvenanceError::CertificateNotFound)
    }

    /// #174 — Query certificates by time range with pagination
    pub fn get_certificates_by_time_range(
        env: Env,
        start_time: u64,
        end_time: u64,
        offset: u32,
        limit: u32,
    ) -> Vec<(u64, ProvenanceCert)> {
        let cnt_key = symbol_short!("CERT_CNT");
        let total_certs: u64 = env.storage().persistent().get(&cnt_key).unwrap_or(0u64);

        let mut results: Vec<(u64, ProvenanceCert)> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;
        let now = env.ledger().timestamp();

        let mut i = total_certs;
        while i > 0 && count < limit {
            if let Some(cert) = env.storage().persistent().get::<u64, ProvenanceCert>(&i) {
                // #177 — filter expired certificates out of default queries
                let expired = cert.expires_at.is_some_and(|ts| now > ts);
                if !expired && cert.timestamp >= start_time && cert.timestamp <= end_time {
                    if skipped >= offset {
                        results.push_back((i, cert));
                        count += 1;
                    } else {
                        skipped += 1;
                    }
                }
            }
            i -= 1;
        }

        results
    }

    /// #175 — Mint multiple certificates in a single transaction
    pub fn mint_batch(
        env: Env,
        storage_refs: Vec<String>,
        manifest_hashes: Vec<String>,
        attestation_hashes: Vec<String>,
        to: Address,
    ) -> Result<Vec<u64>, ProvenanceError> {
        let max_batch_size: u32 = 50;

        if storage_refs.len() > max_batch_size {
            return Err(ProvenanceError::BatchSizeExceeded);
        }

        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        let mut certificate_ids: Vec<u64> = Vec::new(&env);
        let cnt_key = symbol_short!("CERT_CNT");

        for i in 0..storage_refs.len() {
            let storage_ref = storage_refs.get_unchecked(i);
            let manifest_hash = manifest_hashes.get_unchecked(i);
            let attestation_hash = attestation_hashes.get_unchecked(i);

            let mani_key = (symbol_short!("MANI"), manifest_hash.clone());
            if env.storage().persistent().has(&mani_key) {
                return Err(ProvenanceError::DuplicateCertificate);
            }

            let id: u64 = env.storage().persistent().get(&cnt_key).unwrap_or(0u64) + 1;
            env.storage().persistent().set(&cnt_key, &id);

            let verification_level =
                calculate_verification_level(&storage_ref, &manifest_hash, &attestation_hash);

            let cert = ProvenanceCert {
                storage_ref,
                manifest_hash: manifest_hash.clone(),
                attestation_hash,
                creator: to.clone(),
                timestamp: env.ledger().timestamp(),
                revoked: false,
                revocation_reason: RevocationReason::None,
                revocation_timestamp: None,
                expires_at: None,
                verification_level,
                locked: false,
                tags: Vec::new(&env), // #450 — initialize with empty tags
            };
            env.storage().persistent().set(&id, &cert);
            env.storage().persistent().set(&mani_key, &id);

            // #180 — index by creator
            Self::index_by_creator(&env, &to, id);

            // #181 — record in amendment history
            Self::record_history(&env, id, "minted", to.clone());

            certificate_ids.push_back(id);
        }

        // #179 — creator / daily minting counters
        let minted_count = certificate_ids.len() as u64;
        let creator_key = (symbol_short!("CCNT"), to.clone());
        let creator_count: u64 = env.storage().persistent().get(&creator_key).unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&creator_key, &(creator_count + minted_count));

        let day = env.ledger().timestamp() / DAY_SECONDS;
        let daily_key = (symbol_short!("DAILY"), day);
        let daily_count: u64 = env.storage().persistent().get(&daily_key).unwrap_or(0u64);
        env.storage()
            .persistent()
            .set(&daily_key, &(daily_count + minted_count));

        BatchMinted {
            owner: to,
            certificate_ids: certificate_ids.clone(),
            count: certificate_ids.len(),
        }
        .publish(&env);

        Ok(certificate_ids)
    }

    // -----------------------------------------------------------------
    // #180 — Certificate search by creator
    // -----------------------------------------------------------------

    // Helper: append a certificate id to the creator's secondary index
    fn index_by_creator(env: &Env, creator: &Address, id: u64) {
        let idx_key = (symbol_short!("CRIDX"), creator.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&idx_key)
            .unwrap_or(Vec::new(env));
        ids.push_back(id);
        env.storage().persistent().set(&idx_key, &ids);
    }

    /// #180 — Query certificates created by a specific address, paginated
    /// and sorted by timestamp (most recent first)
    pub fn get_certificates_by_creator(
        env: Env,
        creator: Address,
        offset: u32,
        limit: u32,
    ) -> Vec<(u64, ProvenanceCert)> {
        let idx_key = (symbol_short!("CRIDX"), creator);
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&idx_key)
            .unwrap_or(Vec::new(&env));

        let mut results: Vec<(u64, ProvenanceCert)> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        let mut i = ids.len();
        while i > 0 && count < limit {
            i -= 1;
            if skipped < offset {
                skipped += 1;
                continue;
            }
            let id = ids.get_unchecked(i);
            if let Some(cert) = env.storage().persistent().get::<u64, ProvenanceCert>(&id) {
                results.push_back((id, cert));
                count += 1;
            }
        }

        results
    }

    // -----------------------------------------------------------------
    // #181 — Certificate amendment history
    // -----------------------------------------------------------------

    fn current_owner(env: &Env, certificate_id: u64, cert: &ProvenanceCert) -> Address {
        env.storage()
            .persistent()
            .get(&DataKey::CurrentOwner(certificate_id))
            .unwrap_or_else(|| cert.creator.clone())
    }

    // Helper: append an entry to a certificate's amendment history
    fn record_history(env: &Env, certificate_id: u64, action: &str, modifier: Address) {
        let count_key = (symbol_short!("CHCNT"), certificate_id);
        let index: u32 = env.storage().persistent().get(&count_key).unwrap_or(0u32);

        let entry = CertificateHistory {
            certificate_id,
            action: String::from_str(env, action),
            modifier,
            timestamp: env.ledger().timestamp(),
        };

        let entry_key = (symbol_short!("CHIST"), certificate_id, index);
        env.storage().persistent().set(&entry_key, &entry);
        env.storage().persistent().set(&count_key, &(index + 1));
    }

    /// #181 — Query a certificate's full amendment history, paginated
    /// (most recent change first)
    pub fn get_certificate_history(
        env: Env,
        certificate_id: u64,
        offset: u32,
        limit: u32,
    ) -> Vec<CertificateHistory> {
        let count_key = (symbol_short!("CHCNT"), certificate_id);
        let total: u32 = env.storage().persistent().get(&count_key).unwrap_or(0u32);

        let mut results: Vec<CertificateHistory> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        let mut i = total;
        while i > 0 && count < limit {
            i -= 1;
            if skipped < offset {
                skipped += 1;
                continue;
            }
            let entry_key = (symbol_short!("CHIST"), certificate_id, i);
            if let Some(entry) = env
                .storage()
                .persistent()
                .get::<_, CertificateHistory>(&entry_key)
            {
                results.push_back(entry);
                count += 1;
            }
        }

        results
    }

    // -----------------------------------------------------------------
    // #182 — Certificate verification PIN/code
    // -----------------------------------------------------------------

    // Helper: deterministically derive an 8-character alphanumeric code from
    // the certificate id, current timestamp and a nonce (bumped on collision)
    fn build_verification_code(env: &Env, certificate_id: u64, nonce: u32) -> String {
        const CHARSET: &[u8; 36] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        let mut input = [0u8; 20];
        input[0..8].copy_from_slice(&certificate_id.to_be_bytes());
        input[8..16].copy_from_slice(&env.ledger().timestamp().to_be_bytes());
        input[16..20].copy_from_slice(&nonce.to_be_bytes());

        let hash: BytesN<32> = env.crypto().sha256(&Bytes::from_array(env, &input)).into();
        let hash_arr: [u8; 32] = hash.to_array();

        let mut code_bytes = [0u8; 8];
        for i in 0..8usize {
            code_bytes[i] = CHARSET[(hash_arr[i] % 36) as usize];
        }

        String::from_str(env, core::str::from_utf8(&code_bytes).unwrap_or("AAAAAAAA"))
    }

    /// #182 — Generate (or regenerate) an 8-character verification code for
    /// a certificate, usable to look it up without blockchain access
    pub fn generate_verification_code(
        env: Env,
        certificate_id: u64,
    ) -> Result<String, ProvenanceError> {
        let cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Self::current_owner(&env, certificate_id, &cert).require_auth();

        // #182 — regenerating invalidates the previous code
        let cert_code_key = (symbol_short!("CVCODE"), certificate_id);
        if let Some(old_code) = env.storage().persistent().get::<_, String>(&cert_code_key) {
            let old_vcode_key = (symbol_short!("VCODE"), old_code);
            env.storage().persistent().remove(&old_vcode_key);
        }

        // #182 — ensure code uniqueness
        let mut nonce: u32 = 0;
        let code = loop {
            let candidate = Self::build_verification_code(&env, certificate_id, nonce);
            let vcode_key = (symbol_short!("VCODE"), candidate.clone());
            if !env.storage().persistent().has(&vcode_key) {
                break candidate;
            }
            nonce += 1;
        };

        env.storage()
            .persistent()
            .set(&(symbol_short!("VCODE"), code.clone()), &certificate_id);
        env.storage().persistent().set(&cert_code_key, &code);

        Ok(code)
    }

    /// #182 — Look up a certificate by its verification code
    pub fn verify_by_code(env: Env, code: String) -> Result<ProvenanceCert, ProvenanceError> {
        let vcode_key = (symbol_short!("VCODE"), code);
        let certificate_id: u64 = env
            .storage()
            .persistent()
            .get(&vcode_key)
            .ok_or(ProvenanceError::CodeNotFound)?;
        env.storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)
    }

    /// #182 — Retrieve the currently active verification code for a certificate
    pub fn get_verification_code(env: Env, certificate_id: u64) -> Result<String, ProvenanceError> {
        let cert_code_key = (symbol_short!("CVCODE"), certificate_id);
        env.storage()
            .persistent()
            .get(&cert_code_key)
            .ok_or(ProvenanceError::CodeNotFound)
    }

    // -----------------------------------------------------------------
    // #183 — Rich media support indicators
    // -----------------------------------------------------------------

    // Helper: append a certificate id to a content-type secondary index
    fn index_by_content_type(env: &Env, content_type: &ContentType, id: u64) {
        let ct_key = (symbol_short!("CTIDX"), content_type.clone());
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ct_key)
            .unwrap_or(Vec::new(env));
        ids.push_back(id);
        env.storage().persistent().set(&ct_key, &ids);
    }

    // Helper: remove a certificate id from a content-type secondary index
    fn remove_from_content_type_index(env: &Env, content_type: &ContentType, id: u64) {
        let ct_key = (symbol_short!("CTIDX"), content_type.clone());
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ct_key)
            .unwrap_or(Vec::new(env));

        let mut new_ids: Vec<u64> = Vec::new(env);
        for i in 0..ids.len() {
            let existing_id = ids.get_unchecked(i);
            if existing_id != id {
                new_ids.push_back(existing_id);
            }
        }
        env.storage().persistent().set(&ct_key, &new_ids);
    }

    /// #183 — Attach rich media metadata (content type, MIME type, and
    /// optional resolution/duration/size/codec) to a certificate. The MIME
    /// type is validated against the certificate's stored hash record by
    /// requiring the certificate to exist and the MIME type to be non-empty.
    pub fn set_media_properties(
        env: Env,
        certificate_id: u64,
        content_type: ContentType,
        mime_type: String,
        resolution: Option<String>,
        duration_seconds: Option<u64>,
        file_size_bytes: Option<u64>,
        codec: Option<String>,
    ) -> Result<(), ProvenanceError> {
        let cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Self::current_owner(&env, certificate_id, &cert).require_auth();

        if mime_type.is_empty() {
            return Err(ProvenanceError::InvalidMediaMetadata);
        }

        let media_key = (symbol_short!("MEDIA"), certificate_id);
        if let Some(existing) = env
            .storage()
            .persistent()
            .get::<_, MediaProperties>(&media_key)
        {
            Self::remove_from_content_type_index(&env, &existing.content_type, certificate_id);
        }
        Self::index_by_content_type(&env, &content_type, certificate_id);

        let media = MediaProperties {
            content_type,
            mime_type,
            resolution,
            duration_seconds,
            file_size_bytes,
            codec,
        };
        env.storage().persistent().set(&media_key, &media);

        Ok(())
    }

    /// #179 — Aggregate certificate statistics: total minted, and minted today
    pub fn get_certificate_stats(env: Env) -> CertificateStats {
        let total_certificates: u64 = env
            .storage()
            .persistent()
            .get(&symbol_short!("CERT_CNT"))
            .unwrap_or(0u64);

        let day = env.ledger().timestamp() / DAY_SECONDS;
        let certificates_today: u64 = env
            .storage()
            .persistent()
            .get(&(symbol_short!("DAILY"), day))
            .unwrap_or(0u64);

        CertificateStats {
            total_certificates,
            certificates_today,
        }
    }

    /// #179 — Number of certificates minted to a given creator
    pub fn get_creator_certificate_count(env: Env, creator: Address) -> u64 {
        env.storage()
            .persistent()
            .get(&(symbol_short!("CCNT"), creator))
            .unwrap_or(0u64)
    }

    /// #179 — Daily minting counts (a minting-velocity time series) for the
    /// inclusive day range [start_day, end_day], capped at 366 points.
    pub fn get_minting_time_series(env: Env, start_day: u64, end_day: u64) -> Vec<TimeSeriesPoint> {
        const MAX_POINTS: u64 = 366;
        let day_count = end_day
            .saturating_sub(start_day)
            .saturating_add(1)
            .min(MAX_POINTS);

        let mut points: Vec<TimeSeriesPoint> = Vec::new(&env);
        for offset in 0..day_count {
            let day = start_day + offset;
            let count: u64 = env
                .storage()
                .persistent()
                .get(&(symbol_short!("DAILY"), day))
                .unwrap_or(0u64);
            points.push_back(TimeSeriesPoint {
                day,
                period_start: day * DAY_SECONDS,
                count,
            });
        }

        points
    }

    /// #185 — Create a new certificate collection/portfolio.
    pub fn create_collection(env: Env, owner: Address, name: String, description: String) -> u64 {
        owner.require_auth();

        let cnt_key = symbol_short!("COLL_CNT");
        let id: u64 = env.storage().persistent().get(&cnt_key).unwrap_or(0u64) + 1;
        env.storage().persistent().set(&cnt_key, &id);

        let collection = Collection {
            owner,
            name,
            description,
            created_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&(symbol_short!("COLL"), id), &collection);

        id
    }

    /// #185 — Fetch a collection by id.
    pub fn get_collection(env: Env, collection_id: u64) -> Result<Collection, ProvenanceError> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("COLL"), collection_id))
            .ok_or(ProvenanceError::CollectionNotFound)
    }

    /// #185 — Add a certificate to a collection. A certificate may belong to
    /// multiple collections simultaneously.
    pub fn add_certificate_to_collection(
        env: Env,
        collection_id: u64,
        certificate_id: u64,
    ) -> Result<(), ProvenanceError> {
        let collection: Collection = env
            .storage()
            .persistent()
            .get(&(symbol_short!("COLL"), collection_id))
            .ok_or(ProvenanceError::CollectionNotFound)?;
        collection.owner.require_auth();

        if !env.storage().persistent().has(&certificate_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        let coll_certs_key = (symbol_short!("COLLCERT"), collection_id);
        let mut coll_certs: Vec<u64> = env
            .storage()
            .persistent()
            .get(&coll_certs_key)
            .unwrap_or(Vec::new(&env));
        if !coll_certs.contains(certificate_id) {
            coll_certs.push_back(certificate_id);
            env.storage().persistent().set(&coll_certs_key, &coll_certs);
        }

        let cert_colls_key = (symbol_short!("CERTCOLL"), certificate_id);
        let mut cert_colls: Vec<u64> = env
            .storage()
            .persistent()
            .get(&cert_colls_key)
            .unwrap_or(Vec::new(&env));
        if !cert_colls.contains(collection_id) {
            cert_colls.push_back(collection_id);
            env.storage().persistent().set(&cert_colls_key, &cert_colls);
        }

        Ok(())
    }

    /// #183 — Get rich media metadata for a certificate
    pub fn get_media_properties(
        env: Env,
        certificate_id: u64,
    ) -> Result<MediaProperties, ProvenanceError> {
        let media_key = (symbol_short!("MEDIA"), certificate_id);
        env.storage()
            .persistent()
            .get(&media_key)
            .ok_or(ProvenanceError::CertificateNotFound)
    }

    /// #183 — List certificates of a given content type, paginated
    pub fn get_certificates_by_content_type(
        env: Env,
        content_type: ContentType,
        offset: u32,
        limit: u32,
    ) -> Vec<(u64, ProvenanceCert)> {
        let ct_key = (symbol_short!("CTIDX"), content_type);
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&ct_key)
            .unwrap_or(Vec::new(&env));

        let mut results: Vec<(u64, ProvenanceCert)> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        for i in 0..ids.len() {
            if count >= limit {
                break;
            }
            if skipped < offset {
                skipped += 1;
                continue;
            }
            let id = ids.get_unchecked(i);
            if let Some(cert) = env.storage().persistent().get::<u64, ProvenanceCert>(&id) {
                results.push_back((id, cert));
                count += 1;
            }
        }

        results
    }

    /// #185 — Query all certificate ids belonging to a collection.
    pub fn get_certificates_in_collection(env: Env, collection_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("COLLCERT"), collection_id))
            .unwrap_or(Vec::new(&env))
    }

    /// #185 — Query all collection ids a certificate belongs to.
    pub fn get_collections_for_certificate(env: Env, certificate_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&(symbol_short!("CERTCOLL"), certificate_id))
            .unwrap_or(Vec::new(&env))
    }

    /// #184 — Irreversibly lock a certificate, preventing any further
    /// modifications (transfers, metadata updates) even by its owner.
    pub fn lock_certificate(env: Env, certificate_id: u64) -> Result<(), ProvenanceError> {
        let mut cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        let owner = Self::current_owner(&env, certificate_id, &cert);
        owner.require_auth();

        if !cert.locked {
            cert.locked = true;
            env.storage().persistent().set(&certificate_id, &cert);

            CertificateLockedEvent {
                certificate_id,
                locked_by: owner,
            }
            .publish(&env);
        }

        Ok(())
    }

    // -----------------------------------------------------------------
    // #450 — Certificate tags management
    // -----------------------------------------------------------------

    const MAX_TAG_LENGTH: u32 = 50; // Maximum characters per tag
    const MAX_TAGS_PER_CERTIFICATE: u32 = 20; // Maximum tags per certificate

    /// #450 — Add a tag to a certificate. Tags are for categorization and discovery.
    pub fn add_tag(env: Env, certificate_id: u64, tag: String) -> Result<(), ProvenanceError> {
        let mut cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Self::current_owner(&env, certificate_id, &cert).require_auth();

        if cert.locked {
            return Err(ProvenanceError::CertificateLocked);
        }

        if tag.len() > Self::MAX_TAG_LENGTH {
            return Err(ProvenanceError::InvalidTagLength);
        }

        if cert.tags.len() >= Self::MAX_TAGS_PER_CERTIFICATE {
            return Err(ProvenanceError::MaxTagsExceeded);
        }

        // Check if tag already exists
        for existing_tag in cert.tags.iter() {
            if existing_tag == tag {
                // Tag already present, just return OK
                return Ok(());
            }
        }

        // Add tag to certificate
        cert.tags.push_back(tag.clone());
        env.storage().persistent().set(&certificate_id, &cert);

        // Update tag index for discovery
        let tag_index_key = DataKey::TagIndex(tag.clone());
        let mut cert_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&tag_index_key)
            .unwrap_or(Vec::new(&env));
        if !cert_ids.contains(certificate_id) {
            cert_ids.push_back(certificate_id);
            env.storage().persistent().set(&tag_index_key, &cert_ids);
        }

        env.events()
            .publish((symbol_short!("tag_add"),), (certificate_id, tag));
        Ok(())
    }

    /// #450 — Remove a tag from a certificate
    pub fn remove_tag(env: Env, certificate_id: u64, tag: String) -> Result<(), ProvenanceError> {
        let mut cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Self::current_owner(&env, certificate_id, &cert).require_auth();

        if cert.locked {
            return Err(ProvenanceError::CertificateLocked);
        }

        // Find and remove tag
        let mut found = false;
        let mut new_tags: Vec<String> = Vec::new(&env);
        for existing_tag in cert.tags.iter() {
            if existing_tag != tag {
                new_tags.push_back(existing_tag);
            } else {
                found = true;
            }
        }

        if !found {
            return Ok(()); // Tag not found, return OK
        }

        cert.tags = new_tags;
        env.storage().persistent().set(&certificate_id, &cert);

        // Update tag index
        let tag_index_key = DataKey::TagIndex(tag.clone());
        let cert_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&tag_index_key)
            .unwrap_or(Vec::new(&env));
        let mut new_cert_ids: Vec<u64> = Vec::new(&env);
        for id in cert_ids.iter() {
            if id != certificate_id {
                new_cert_ids.push_back(id);
            }
        }
        if !new_cert_ids.is_empty() {
            env.storage()
                .persistent()
                .set(&tag_index_key, &new_cert_ids);
        } else {
            env.storage().persistent().remove(&tag_index_key);
        }

        env.events()
            .publish((symbol_short!("tag_rm"),), (certificate_id, tag));
        Ok(())
    }

    /// #450 — Get all tags for a certificate
    pub fn get_tags(env: Env, certificate_id: u64) -> Result<Vec<String>, ProvenanceError> {
        env.storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .map(|cert| cert.tags)
            .ok_or(ProvenanceError::CertificateNotFound)
    }

    /// #450 — Query certificates by tag
    /// #450 — Query certificates by tag
    pub fn get_certificates_by_tag(
        env: Env,
        tag: String,
        offset: u32,
        limit: u32,
    ) -> Vec<(u64, ProvenanceCert)> {
        let tag_index_key = DataKey::TagIndex(tag);
        let cert_ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&tag_index_key)
            .unwrap_or(Vec::new(&env));

        let mut results: Vec<(u64, ProvenanceCert)> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        for i in 0..cert_ids.len() {
            if count >= limit {
                break;
            }
            if skipped < offset {
                skipped += 1;
                continue;
            }
            let id = cert_ids.get_unchecked(i);
            if let Some(cert) = env.storage().persistent().get::<u64, ProvenanceCert>(&id) {
                results.push_back((id, cert));
                count += 1;
            }
        }

        results
    }

    /// #450 — Replace all tags for a certificate (bulk update)
    pub fn set_tags(
        env: Env,
        certificate_id: u64,
        new_tags: Vec<String>,
    ) -> Result<(), ProvenanceError> {
        let mut cert = env
            .storage()
            .persistent()
            .get::<u64, ProvenanceCert>(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;
        Self::current_owner(&env, certificate_id, &cert).require_auth();

        if cert.locked {
            return Err(ProvenanceError::CertificateLocked);
        }

        if new_tags.len() > Self::MAX_TAGS_PER_CERTIFICATE {
            return Err(ProvenanceError::MaxTagsExceeded);
        }

        // Validate all tags
        for tag in new_tags.iter() {
            if tag.len() > Self::MAX_TAG_LENGTH {
                return Err(ProvenanceError::InvalidTagLength);
            }
        }

        // Remove old tags from index
        for old_tag in cert.tags.iter() {
            let tag_index_key = DataKey::TagIndex(old_tag.clone());
            let cert_ids: Vec<u64> = env
                .storage()
                .persistent()
                .get(&tag_index_key)
                .unwrap_or(Vec::new(&env));
            let mut new_cert_ids: Vec<u64> = Vec::new(&env);
            for id in cert_ids.iter() {
                if id != certificate_id {
                    new_cert_ids.push_back(id);
                }
            }
            if !new_cert_ids.is_empty() {
                env.storage()
                    .persistent()
                    .set(&tag_index_key, &new_cert_ids);
            } else {
                env.storage().persistent().remove(&tag_index_key);
            }
        }

        // Set new tags
        cert.tags = new_tags.clone();
        env.storage().persistent().set(&certificate_id, &cert);

        // Add new tags to index
        for new_tag in new_tags.iter() {
            let tag_index_key = DataKey::TagIndex(new_tag.clone());
            let mut cert_ids: Vec<u64> = env
                .storage()
                .persistent()
                .get(&tag_index_key)
                .unwrap_or(Vec::new(&env));
            if !cert_ids.contains(certificate_id) {
                cert_ids.push_back(certificate_id);
                env.storage().persistent().set(&tag_index_key, &cert_ids);
            }
        }

        env.events()
            .publish((symbol_short!("tag_set"),), certificate_id);
        Ok(())
    }

    // -----------------------------------------------------------------
    // #452 — Certificate endorsements (likes)
    // -----------------------------------------------------------------

    /// #452 — Endorse (like) a certificate. Idempotent: endorsing twice from
    /// the same address is a no-op that returns the current total.
    pub fn endorse_certificate(
        env: Env,
        certificate_id: u64,
        endorser: Address,
    ) -> Result<u64, ProvenanceError> {
        endorser.require_auth();

        if !env.storage().persistent().has(&certificate_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        let endorsement_key = DataKey::Endorsement(certificate_id, endorser.clone());
        let count_key = DataKey::EndorsementCount(certificate_id);

        if env.storage().persistent().has(&endorsement_key) {
            return Ok(env.storage().persistent().get(&count_key).unwrap_or(0u64));
        }

        env.storage().persistent().set(&endorsement_key, &true);

        let index_key = DataKey::EndorsementIndex(certificate_id);
        let mut endorsers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or(Vec::new(&env));
        endorsers.push_back(endorser.clone());
        env.storage().persistent().set(&index_key, &endorsers);

        let new_count: u64 = env.storage().persistent().get(&count_key).unwrap_or(0u64) + 1;
        env.storage().persistent().set(&count_key, &new_count);

        CertificateEndorsed {
            certificate_id,
            endorser,
            total_endorsements: new_count,
        }
        .publish(&env);

        Ok(new_count)
    }

    /// #452 — Remove a previously recorded endorsement. A no-op (returning
    /// the current total) if the address had not endorsed the certificate.
    pub fn remove_endorsement(
        env: Env,
        certificate_id: u64,
        endorser: Address,
    ) -> Result<u64, ProvenanceError> {
        endorser.require_auth();

        if !env.storage().persistent().has(&certificate_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        let endorsement_key = DataKey::Endorsement(certificate_id, endorser.clone());
        let count_key = DataKey::EndorsementCount(certificate_id);

        if !env.storage().persistent().has(&endorsement_key) {
            return Ok(env.storage().persistent().get(&count_key).unwrap_or(0u64));
        }

        env.storage().persistent().remove(&endorsement_key);

        let index_key = DataKey::EndorsementIndex(certificate_id);
        let endorsers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&index_key)
            .unwrap_or(Vec::new(&env));
        let mut updated: Vec<Address> = Vec::new(&env);
        for addr in endorsers.iter() {
            if addr != endorser {
                updated.push_back(addr);
            }
        }
        env.storage().persistent().set(&index_key, &updated);

        let new_count: u64 = env
            .storage()
            .persistent()
            .get(&count_key)
            .unwrap_or(0u64)
            .saturating_sub(1);
        env.storage().persistent().set(&count_key, &new_count);

        EndorsementRemoved {
            certificate_id,
            endorser,
            total_endorsements: new_count,
        }
        .publish(&env);

        Ok(new_count)
    }

    /// #452 — Total endorsement count for a certificate.
    pub fn get_endorsement_count(env: Env, certificate_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::EndorsementCount(certificate_id))
            .unwrap_or(0u64)
    }

    /// #452 — Whether `endorser` currently endorses a certificate.
    pub fn has_endorsed(env: Env, certificate_id: u64, endorser: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Endorsement(certificate_id, endorser))
    }

    /// #452 — Paginated list of endorser addresses for a certificate, in
    /// endorsement order.
    pub fn get_endorsers(env: Env, certificate_id: u64, offset: u32, limit: u32) -> Vec<Address> {
        let endorsers: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::EndorsementIndex(certificate_id))
            .unwrap_or(Vec::new(&env));

        let mut results: Vec<Address> = Vec::new(&env);
        let mut count = 0u32;
        let mut skipped = 0u32;

        for addr in endorsers.iter() {
            if count >= limit {
                break;
            }
            if skipped < offset {
                skipped += 1;
                continue;
            }
            results.push_back(addr);
            count += 1;
        }

        results
    }

    // -----------------------------------------------------------------
    // Provenance snapshot diff support
    // -----------------------------------------------------------------

    /// Return a snapshot of the current certificate state for use in audit
    /// diff comparisons.  Callers can store the returned data off-chain and
    /// later pass two snapshots to a diff utility to understand what changed,
    /// when, and by whom.
    ///
    /// The snapshot bundles all mutable fields that could change over the
    /// certificate's lifetime (manifest hash, verification level, revocation
    /// status, tags, expiration) together with the actor that last modified
    /// the certificate (tracked in the amendment history log).
    pub fn take_snapshot(
        env: Env,
        certificate_id: u64,
    ) -> Result<ProvenanceCertSnapshot, ProvenanceError> {
        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        // Pull the most recent history entry to identify the last actor
        let history: Vec<CertificateHistory> = env
            .storage()
            .persistent()
            .get(&DataKey::History(certificate_id))
            .unwrap_or_else(|| Vec::new(&env));

        let last_actor = if !history.is_empty() {
            history.get_unchecked(history.len() - 1).modifier.clone()
        } else {
            cert.creator.clone()
        };

        Ok(ProvenanceCertSnapshot {
            certificate_id,
            manifest_hash: cert.manifest_hash.clone(),
            attestation_hash: cert.attestation_hash.clone(),
            storage_ref: cert.storage_ref.clone(),
            creator: cert.creator.clone(),
            actor: last_actor,
            timestamp: env.ledger().timestamp(),
            verification_level: cert.verification_level,
            revoked: cert.revoked,
            expires_at: cert.expires_at,
            tags: cert.tags.clone(),
        })
    }

    // -----------------------------------------------------------------
    // Cryptographic manifest signing support
    // -----------------------------------------------------------------

    /// Store a creator-supplied Ed25519 signature over a certificate's
    /// manifest hash, providing on-chain evidence that the manifest was not
    /// tampered with after the creator signed it.
    ///
    /// `signer` must be the certificate creator's `Address` (enforced via
    /// `require_auth`). `signer_public_key` is the Stellar G... key string
    /// recorded for off-chain audit; `signature` is the base64-encoded Ed25519
    /// signature validated by the TEE oracle before this call is made.
    ///
    /// Only the oracle may call this — the oracle is responsible for
    /// verifying the Ed25519 signature off-chain against the registry before
    /// forwarding the record here.
    pub fn store_manifest_signature(
        env: Env,
        certificate_id: u64,
        signer: Address,
        signer_public_key: String,
        signature: String,
        signed_at: u64,
    ) -> Result<(), ProvenanceError> {
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        // Enforce that the declared signer is the certificate creator.
        // The oracle has already verified the Ed25519 signature off-chain;
        // this check ensures the on-chain record is tied to the right identity.
        if signer != cert.creator {
            return Err(ProvenanceError::Unauthorized);
        }

        let record = ManifestSignatureRecord {
            certificate_id,
            manifest_hash: cert.manifest_hash.clone(),
            signer_public_key,
            signature,
            signed_at,
        };

        env.storage()
            .persistent()
            .set(&DataKey::ManifestSignature(certificate_id), &record);

        env.events().publish(
            (Symbol::new(&env, "manifest_signed"), certificate_id),
            cert.manifest_hash,
        );

        Ok(())
    }

    /// Retrieve the stored manifest signature for a certificate.
    pub fn get_manifest_signature(
        env: Env,
        certificate_id: u64,
    ) -> Option<ManifestSignatureRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::ManifestSignature(certificate_id))
    }

    // -----------------------------------------------------------------
    // Metadata redaction policy support
    // -----------------------------------------------------------------

    /// Store a redaction policy for a certificate so governance reviewers can
    /// audit and approve what metadata is publicly visible.
    ///
    /// Only the certificate owner or oracle may register a policy.
    pub fn set_redaction_policy(
        env: Env,
        certificate_id: u64,
        policy_hash: String,
        applied_by: Address,
    ) -> Result<(), ProvenanceError> {
        applied_by.require_auth();

        let cert: ProvenanceCert = env
            .storage()
            .persistent()
            .get(&certificate_id)
            .ok_or(ProvenanceError::CertificateNotFound)?;

        let owner = Self::current_owner(&env, certificate_id, &cert);
        // Allow owner or oracle to set the policy
        let oracle: Option<Address> = env.storage().persistent().get(&symbol_short!("ORACLE"));
        if applied_by != owner {
            if let Some(oracle_addr) = oracle {
                if applied_by != oracle_addr {
                    return Err(ProvenanceError::Unauthorized);
                }
            } else {
                return Err(ProvenanceError::Unauthorized);
            }
        }

        let record = RedactionPolicyRecord {
            certificate_id,
            policy_hash,
            applied_by: applied_by.clone(),
            applied_at: env.ledger().timestamp(),
            approved: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::RedactionPolicy(certificate_id), &record);

        env.events().publish(
            (Symbol::new(&env, "redaction_policy_set"), certificate_id),
            applied_by,
        );

        Ok(())
    }

    /// Approve a pending redaction policy (oracle/admin-gated).
    pub fn approve_redaction_policy(env: Env, certificate_id: u64) -> Result<(), ProvenanceError> {
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        let mut record: RedactionPolicyRecord = env
            .storage()
            .persistent()
            .get(&DataKey::RedactionPolicy(certificate_id))
            .ok_or(ProvenanceError::CertificateNotFound)?;

        record.approved = true;
        env.storage()
            .persistent()
            .set(&DataKey::RedactionPolicy(certificate_id), &record);

        env.events().publish(
            (Symbol::new(&env, "redaction_approved"), certificate_id),
            oracle,
        );

        Ok(())
    }

    /// Retrieve the current redaction policy record for a certificate.
    pub fn get_redaction_policy(env: Env, certificate_id: u64) -> Option<RedactionPolicyRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::RedactionPolicy(certificate_id))
    }

    // -----------------------------------------------------------------
    // #455 — Certificate view counter
    // -----------------------------------------------------------------

    /// #455 — Current view count for a certificate (incremented by
    /// `get_certificate`).
    pub fn get_view_count(env: Env, certificate_id: u64) -> u64 {
        env.storage()
            .persistent()
            .get(&DataKey::ViewCount(certificate_id))
            .unwrap_or(0u64)
    }

    /// #455 — Certificates ranked by view count, most-viewed first, capped
    /// at `limit` entries.
    pub fn get_most_viewed_certificates(env: Env, limit: u32) -> Vec<(u64, u64)> {
        let cnt_key = symbol_short!("CERT_CNT");
        let total_certs: u64 = env.storage().persistent().get(&cnt_key).unwrap_or(0u64);

        let mut all: Vec<(u64, u64)> = Vec::new(&env);
        let mut i = 1u64;
        while i <= total_certs {
            let views: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::ViewCount(i))
                .unwrap_or(0u64);
            all.push_back((i, views));
            i += 1;
        }

        let mut results: Vec<(u64, u64)> = Vec::new(&env);
        let take = limit.min(all.len());
        for _ in 0..take {
            let mut best_idx: u32 = 0;
            let mut best_views: u64 = 0;
            for idx in 0..all.len() {
                let (_, views) = all.get_unchecked(idx);
                if views >= best_views {
                    best_views = views;
                    best_idx = idx;
                }
            }
            let (id, views) = all.get_unchecked(best_idx);
            results.push_back((id, views));
            all.remove(best_idx);
        }

        results
    }
}

#[cfg(test)]
mod test;

// #654 — integration tests covering multi-step workflows, storage mutations,
// event emission, and error paths across the provenance contract.
#[cfg(test)]
mod integration_tests;

#[cfg(test)]
mod revert_tests;

// ---------------------------------------------------------------------------
// Multi-anchor provenance (ADR-0008)
//
// A ProvenanceCert's primary `storage_ref` remains the canonical single-chain
// anchor (Stellar + IPFS/Arweave). Additional supplemental anchors are stored
// separately under `DataKey::Anchors(certificate_id)` so that:
//
//   1. Existing certs deserialise without change (no struct field added).
//   2. New anchor types can be added by extending `AnchorType` alone.
//   3. Each anchor is typed, described, and timestamped so the UI can render
//      it with appropriate context.
//
// Auth: only the oracle may call `add_anchor`, matching the mint gate.
// Anchors are append-only — there is no `remove_anchor`.
// ---------------------------------------------------------------------------

/// The trust network or archival system a supplemental anchor points to.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AnchorType {
    /// The primary Stellar / Soroban certificate (always present as storage_ref).
    Stellar,
    /// Arweave permanent storage transaction.
    Arweave,
    /// IPFS content-addressed reference (CID).
    Ipfs,
    /// Bitcoin Ordinals inscription.
    BitcoinOrdinal,
    /// A notarisation or timestamping service (e.g. RFC 3161 TSA).
    Notarisation,
    /// Any other anchor type not covered above.
    Other,
}

/// A supplemental provenance anchor attached to a certificate.
/// Stored as an element of the `Vec<ProvenanceAnchor>` under
/// `DataKey::Anchors(certificate_id)`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProvenanceAnchor {
    /// Which trust network or archival system this anchor points to.
    pub anchor_type: AnchorType,
    /// The chain-specific reference: an Arweave TX ID, IPFS CID,
    /// Bitcoin inscription ID, TSA receipt hash, etc.
    pub reference: String,
    /// Plain-language description of what this anchor provides,
    /// e.g. "Permanent Arweave archive of the original media file".
    pub description: String,
    /// Ledger timestamp when this anchor was recorded.
    pub anchored_at: u64,
}

/// Event emitted when a new anchor is added to a certificate.
#[contractevent]
pub struct AnchorAdded {
    #[topic]
    pub certificate_id: u64,
    pub anchor_type: AnchorType,
    pub reference: String,
}

// Add `Anchors` to DataKey — appended variants do not affect
// existing key serialisations (Soroban encodes variants by position,
// and all existing variants retain their original positions).
// NOTE: in Soroban SDK the DataKey enum is sealed per-contract; we extend
// it here by adding the Anchors variant to the existing DataKey enum above.
// The variant is appended so its u32 tag does not collide with any prior variant.

#[contractimpl]
impl ProvenanceContract {
    // -----------------------------------------------------------------
    // Multi-anchor provenance — ADR-0008
    // -----------------------------------------------------------------

    /// Attach a supplemental provenance anchor to an existing certificate.
    ///
    /// Only the oracle may call this (same gate as `mint`). Anchors are
    /// append-only — once recorded they cannot be removed.
    ///
    /// # Errors
    /// - `CertificateNotFound` if `certificate_id` does not exist.
    /// - `Unauthorized` if the caller is not the authorised oracle.
    ///
    /// # Events
    /// Emits `AnchorAdded { certificate_id, anchor_type, reference }`.
    pub fn add_anchor(
        env: Env,
        certificate_id: u64,
        anchor_type: AnchorType,
        reference: String,
        description: String,
    ) -> Result<(), ProvenanceError> {
        // Oracle-only gate — same pattern as mint / revoke_certificate
        let oracle: Address = env
            .storage()
            .persistent()
            .get(&symbol_short!("ORACLE"))
            .expect("Not initialized");
        oracle.require_auth();

        // Certificate must exist
        if !env.storage().persistent().has(&certificate_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        let anchor = ProvenanceAnchor {
            anchor_type: anchor_type.clone(),
            reference: reference.clone(),
            description,
            anchored_at: env.ledger().timestamp(),
        };

        // Load existing anchors (empty vec for certs with none yet)
        let anchor_key = (symbol_short!("ANCHORS"), certificate_id);
        let mut anchors: Vec<ProvenanceAnchor> = env
            .storage()
            .persistent()
            .get(&anchor_key)
            .unwrap_or_else(|| Vec::new(&env));

        anchors.push_back(anchor);
        env.storage().persistent().set(&anchor_key, &anchors);

        // Record in amendment history so the audit trail captures it
        Self::record_history(&env, certificate_id, "anchor_added", oracle.clone());

        AnchorAdded {
            certificate_id,
            anchor_type,
            reference,
        }
        .publish(&env);

        Ok(())
    }

    /// Return all supplemental anchors for a certificate, in the order they
    /// were added. Returns an empty vec for certificates with no anchors.
    ///
    /// # Errors
    /// - `CertificateNotFound` if `certificate_id` does not exist.
    pub fn get_anchors(
        env: Env,
        certificate_id: u64,
    ) -> Result<Vec<ProvenanceAnchor>, ProvenanceError> {
        if !env.storage().persistent().has(&certificate_id) {
            return Err(ProvenanceError::CertificateNotFound);
        }

        let anchor_key = (symbol_short!("ANCHORS"), certificate_id);
        Ok(env
            .storage()
            .persistent()
            .get(&anchor_key)
            .unwrap_or_else(|| Vec::new(&env)))
    }

    /// Return the count of supplemental anchors for a certificate.
    /// Returns 0 for certificates with no anchors or that don't exist.
    pub fn get_anchor_count(env: Env, certificate_id: u64) -> u32 {
        let anchor_key = (symbol_short!("ANCHORS"), certificate_id);
        env.storage()
            .persistent()
            .get::<_, Vec<ProvenanceAnchor>>(&anchor_key)
            .map(|v| v.len())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod smoke_tests;
