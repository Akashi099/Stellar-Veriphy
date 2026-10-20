# Glossary

Terms used across StellarVeriphy's contracts, documentation, and codebase. Entries are grouped by topic and listed alphabetically within each group.

## Table of contents

- [Blockchain basics](#blockchain-basics)
- [Proof basics](#proof-basics)
- [Verification basics](#verification-basics)
- [Provenance basics](#provenance-basics)
- [Stellar and Soroban fundamentals](#stellar-and-soroban-fundamentals)
- [Provenance certificates](#provenance-certificates)
- [Verification and attestation](#verification-and-attestation)
- [Oracle and request lifecycle](#oracle-and-request-lifecycle)
- [Providers](#providers)
- [Registry and trust anchors](#registry-and-trust-anchors)
- [Fees, staking, and economics](#fees-staking-and-economics)
- [Governance](#governance)
- [Frontend and integration](#frontend-and-integration)

---

## Blockchain basics

**Block**
A batch of transactions committed together to a blockchain. On Stellar, blocks are called [ledgers](#stellar-and-soroban-fundamentals) and are produced roughly every 5 seconds.

**Consensus**
The process by which independent network participants agree on the order and contents of blocks. Stellar uses the Stellar Consensus Protocol (SCP); StellarVeriphy relies on it to guarantee that certificates and attestations are recorded once and cannot be reordered.

**Ledger (blockchain)**
See [Ledger](#stellar-and-soroban-fundamentals) under Stellar and Soroban fundamentals. A single block on the Stellar blockchain, identified by a monotonically increasing sequence number.

**Transaction**
A signed instruction submitted to the Stellar network that changes on-chain state — for example minting a certificate, submitting a verification request, or depositing stake. Every StellarVeriphy action is a transaction and pays a network fee.

---

## Proof basics

**Attestation (proof)**
A signed statement from a trusted party that a claim is true. In StellarVeriphy, an attestation is produced inside a TEE and proves that verification ran on approved code. See [Attestation](#verification-and-attestation) for the contract-level details.

**Hash**
A fixed-length fingerprint computed from data by a one-way function (SHA-256 in StellarVeriphy). The same input always yields the same hash, and any change to the input changes the hash. Used for manifest hashes, attestation hashes, and TEE hashes.

**Merkle proof**
A short proof that a piece of data is included in a larger set, built from sibling hashes along a Merkle tree. Lets a verifier confirm inclusion without downloading the whole dataset.

**Signature**
A cryptographic value proving that a specific key holder authorized a message. StellarVeriphy verifies oracle attestations with ed25519 signatures; wallet transactions are signed by the user's Stellar key.

---

## Verification basics

**Certificate**
The user-facing record that a piece of content has been verified. Backed on-chain by a [ProvenanceCert](#provenance-certificates). Displayed in the app with its manifest hash, attestation hash, creator, and verification level.

**Confidence score**
A numeric indicator of how much trust to place in a verification result, derived from provider reputation, verification level, and attestation validity. Higher scores mean stronger evidence that the content matches its manifest.

**Oracle**
A service that supplies off-chain facts to a smart contract. In StellarVeriphy, oracle providers run verification inside a TEE and submit signed attestations to the Oracle contract.

**Verification**
The process of confirming that content matches its claimed manifest and was processed by approved code. Produces an attestation that is recorded on-chain and reflected in the certificate's verification level.

---

## Provenance basics

**Anchor**
A durable, tamper-evident reference that ties off-chain content to an on-chain record. In StellarVeriphy the certificate's `storage_ref` and `manifest_hash` together act as the anchor for a piece of content.

**Audit trail**
The chronological record of actions taken on a certificate or request. For certificates this is the [amendment history](#provenance-certificates); for requests it is the sequence of state changes and events.

**Manifest (provenance)**
The JSON document describing a piece of content's origin and metadata. Its hash anchors the content to a certificate. See [Manifest](#provenance-certificates) for the full field list.

**Provenance record**
The complete set of on-chain fields that establish where content came from and how it was verified: `storage_ref`, `manifest_hash`, and `attestation_hash`, plus the certificate's creator and timestamp.

---

## Stellar and Soroban fundamentals

**Base fee**
The minimum fee charged by the Stellar network to include a transaction in a ledger. Currently 100 stroops (0.00001 XLM) per operation, set in the transaction envelope. Separate from the Soroban resource fee.

**Instance storage**
A Soroban storage tier tied to the contract instance's own TTL. Automatically extended whenever the contract is invoked. Used for lightweight singletons like admin addresses, counters, and configuration values. The cheapest storage tier for per-call reads.

**Ledger**
A single block on the Stellar blockchain, produced approximately every 5 seconds. Ledger sequence numbers are used throughout StellarVeriphy for TTL calculations and cooldown periods — for example, the withdrawal cooldown is 7,200 ledgers (about 1 hour).

**Ledger sequence**
The monotonically increasing integer identifying a specific ledger on the Stellar network. Used by the Oracle contract to track request TTLs, staking cooldowns, and archival intervals.

**Ledger timestamp**
The Unix timestamp (seconds since epoch) stored in a ledger's header. Distinct from the ledger sequence. Used by the Provenance contract for certificate timestamps, expiration checks, and minting time-series analytics.

**Persistent storage**
A Soroban storage tier for long-lived data. Entries survive indefinitely but their TTL must be periodically renewed to avoid eviction by the network's rent mechanism. Used for provenance certificates, provider records, and Registry trust data.

**Resource fee**
The Soroban-specific portion of a transaction fee, charged on top of the classic base fee. Composed of a non-refundable component (CPU instructions and bandwidth) and a refundable component (storage rent). Exact amounts vary with network resource prices; use `stellar contract simulate` to get an estimate before submitting.

**Soroban**
The smart-contract platform built on Stellar. StellarVeriphy's three contracts (Oracle, Provenance, Registry) are all Soroban contracts written in Rust using the `soroban-sdk`.

**Stroop**
The smallest unit of XLM. 1 XLM = 10,000,000 stroops. All fee and staking amounts in StellarVeriphy are denominated in stroops.

**Temporary storage**
A Soroban storage tier for short-lived data. Entries are automatically deleted when their TTL reaches zero, at no additional cost to the caller. The Oracle contract stores verification requests in temporary storage with priority-dependent TTLs of 50–200 ledgers.

**TTL (Time-To-Live)**
The number of ledgers an entry in Soroban storage is guaranteed to remain accessible. When TTL reaches zero, temporary entries are silently dropped; persistent entries must have their TTL renewed. A TTL extension is charged as refundable rent. See also: [Gas Costs and Fee Reference](gas-costs.md#ttl-and-rent-costs).

**XLM**
The native asset of the Stellar network, also called Lumens. Used to pay transaction fees and meet minimum balance requirements. 1 XLM = 10,000,000 stroops.

---

## Provenance certificates

**Amendment history**
An append-only log of lifecycle actions taken on a certificate: `minted`, `transferred`, `metadata_updated`. Stored per certificate in persistent storage and queryable via `get_certificate_history`. Provides an auditable trail of all changes.

**Attestation hash**
A cryptographic hash of the TEE attestation document produced during verification. Stored in `ProvenanceCert.attestation_hash`. Together with `storage_ref` and `manifest_hash`, it forms the complete provenance record. When all three fields are non-empty, the certificate is auto-assigned `VerificationLevel::Standard` at mint time.

**CertificateRelation**
An enum describing how two linked certificates relate: `Parent(id)`, `Child(id)`, or `Sibling(id)`. Relations are stored bidirectionally — linking A as a parent of B also records B as a child of A. Cycle detection (up to a 20-hop walk) prevents circular parent chains.

**Collection**
A named group of certificates owned by a single address. Created with `create_collection` and populated with `add_certificate_to_collection`. A certificate can belong to multiple collections simultaneously.

**ContentType**
An enum classifying the media type associated with a certificate: `Image`, `Video`, `Audio`, `Document`, or `Other`. Used to build a secondary index that enables `get_certificates_by_content_type` queries.

**Creator**
The Stellar address (`to` parameter in `mint`) that a certificate is initially issued to. Stored in `ProvenanceCert.creator`. Updated when ownership is transferred. Also referred to as the owner.

**Duplicate prevention**
A uniqueness check on `manifest_hash` performed during `mint` and `mint_batch`. If a certificate with the same manifest hash already exists the call fails with `DuplicateCertificate`, preventing the same content from being certified twice.

**Expiration**
An optional Unix timestamp stored in `ProvenanceCert.expires_at`. Once `ledger_timestamp > expires_at`, the certificate is considered expired. Expired certificates are filtered out of `get_certificates_by_time_range` results. Owners can set, clear, or renew expiration; the oracle can revoke regardless of expiration state.

**Immutability lock**
A permanent, irreversible flag (`ProvenanceCert.locked = true`) set by the owner via `lock_certificate`. Once locked, a certificate cannot be transferred or have its metadata updated. The lock cannot be undone.

**Manifest**
A JSON document describing a piece of content's origin and metadata. Its SHA-256 hash becomes the `manifest_hash` stored in a certificate. Fields include `contentHash`, `creator`, `timestamp`, and `metadata` (device, location, AI model used, etc.). See the [manifest schema docs](manifest-schema/).

**Manifest hash**
A SHA-256 hash of the content manifest JSON. Acts as the primary deduplication key for certificates. Stored in `ProvenanceCert.manifest_hash` and indexed for reverse lookups (manifest → certificate ID).

**MediaProperties**
Optional rich media metadata attached to a certificate via `set_media_properties`. Fields include `content_type`, `mime_type`, and optional `resolution`, `duration_seconds`, `file_size_bytes`, and `codec`. Supports content-type filtering and media-aware display.

**MetadataVersion**
A snapshot of a certificate's display metadata (`display_name`, `description`) at a specific version number. Saved to persistent storage each time `update_metadata` is called, making all previous metadata states recoverable.

**ProvenanceCert**
The core on-chain data structure representing a verified content certificate. Key fields:

| Field | Type | Description |
|---|---|---|
| `storage_ref` | String | IPFS CID or database ID pointing to the media file |
| `manifest_hash` | String | SHA-256 hash of the manifest JSON |
| `attestation_hash` | String | Hash of the TEE attestation document |
| `creator` | Address | Current owner |
| `timestamp` | u64 | Ledger timestamp at mint time |
| `revoked` | bool | Whether the certificate has been revoked |
| `revocation_reason` | Option\<RevocationReason\> | Reason for revocation, if revoked |
| `revocation_timestamp` | Option\<u64\> | When revocation occurred |
| `expires_at` | Option\<u64\> | Optional expiration timestamp |
| `verification_level` | VerificationLevel | Trust badge level |
| `locked` | bool | Whether the certificate is permanently immutable |

**Revocation**
The process of permanently marking a certificate invalid via `revoke_certificate`. Only the oracle address can revoke. A revoked certificate is not deleted — it remains on-chain with `revoked = true` and an attached `RevocationReason`. Revocation is irreversible.

**RevocationReason**
An enum describing why a certificate was revoked: `FraudulentContent`, `LegalRequirement`, `CreatorRequest`, or `ContractualViolation`.

**Storage reference (storage_ref)**
An external pointer to the media file — typically an IPFS content identifier (CID) or a database document ID. Only the reference is stored on-chain; the media file itself is never written to Stellar.

**Verification code**
An 8-character alphanumeric code generated by `generate_verification_code`, derived from SHA-256 of the certificate ID, ledger timestamp, and a nonce. Lets non-technical users look up a certificate by code rather than by numeric ID. Only one code is active per certificate at a time; generating a new one invalidates the previous.

**VerificationLevel**
An enum badge indicating how thoroughly a certificate's content was verified:

| Level | When assigned |
|---|---|
| `Basic` | Auto-assigned at mint when at least one of the three fields was empty |
| `Standard` | Auto-assigned at mint when all three fields are non-empty |
| `Premium` | Oracle-upgraded via `set_verification_level` after off-chain provider-reputation checks |
| `Enterprise` | Oracle-upgraded via `set_verification_level`; highest trust tier |

---

## Verification and attestation

**Attestation**
A cryptographically signed document produced inside a TEE proving that a specific computation ran on verified code. Oracle providers running inside an AWS Nitro Enclave produce an attestation after verifying content. The signed attestation is submitted to the Oracle contract via `verify_attestation`.

**ed25519**
The digital signature scheme used to verify oracle attestations. `verify_attestation` calls `env.crypto().ed25519_verify(provider_pubkey, payload, signature)` to confirm the attestation was produced by a registered provider.

**Hash mismatch**
The failure outcome of `verify_and_mint` (Registry contract) when `sha256(content) != expected_hash`. The function returns `VerificationResult { state: "hash_mismatch", success: false }` and no certificate is minted.

**Payload**
The data blob signed by the oracle provider during attestation. Submitted to `verify_attestation` alongside the provider public key and signature. The contract verifies the signature without inspecting the payload's contents.

**Signature verification**
The three-step check inside `verify_attestation`: (1) the provider is registered in the Registry, (2) the TEE hash is approved in the Registry, and (3) the ed25519 signature of the payload matches the provider's public key. All three must pass.

**TEE (Trusted Execution Environment)**
A hardware-isolated compute environment that provides confidentiality and integrity guarantees for the code running inside it. StellarVeriphy uses AWS Nitro Enclaves as the TEE. The enclave's code identity is represented by a `tee_hash` registered in the Registry contract. See [ADR-0004](adr/0004-tee-oracle-trust-model.md) for the full trust model.

**TEE hash**
A 32-byte (`BytesN<32>`) cryptographic measurement of a TEE enclave's code image. Registered in the Registry by an admin. Acts as an on-chain whitelist of approved enclave builds. Valid for 180 days from registration; can be rotated before expiry via `rotate_tee_hash`.

**verify_and_mint**
A Registry function combining on-chain SHA-256 hash verification with a cross-contract call to Provenance's `mint`. Computes `sha256(content)`, compares it to `expected_hash`, and mints a certificate on match. Returns a `VerificationResult` with `state = "minted"` on success or `state = "hash_mismatch"` on failure.

---

## Oracle and request lifecycle

**Archival**
The process of moving verification requests from temporary storage to persistent storage so they are not lost when their TTL expires. Performed by `archive_old_requests`, which is rate-limited to run at most once per 1,000 ledgers. Archived requests are recoverable via `get_archived_request`.

**Batch request**
Up to 10 verification requests submitted together in a single transaction via `submit_batch_request`. Reduces per-request network overhead compared to N separate calls. Each request in the batch receives its own ID and TTL based on its priority.

**Circuit breaker**
A pause mechanism controlled by the admin via `pause` and `unpause`. While active, `submit_request` and `submit_batch_request` fail with `ContractPaused`. Used for emergency response without requiring contract redeployment.

**ContentComplexity**
An enum used in cost estimation to express how computationally expensive a piece of content is to verify: `Simple`, `Moderate`, or `Complex`. Applies a multiplier to the base fee in `estimate_cost` (0%, +25%, +75% respectively).

**Expiration warning**
An event emitted by `check_expiration_warning` when a request's remaining TTL is at or below the configured warning threshold (default 10–20 ledgers). Signals to off-chain monitors that the request is about to expire and should be processed or re-submitted soon.

**Priority**
An enum attached to each verification request that controls both its TTL and its application-level fee surcharge:

| Value | TTL (ledgers) | Approx. duration | Priority fee surcharge |
|---|---|---|---|
| `Low` | 50 | ~4 minutes | None |
| `Normal` | 100 | ~8 minutes | None |
| `High` | 200 | ~17 minutes | +50% of base fee |
| `Urgent` | 200 | ~17 minutes | +150% of base fee |

**Request**
A `VerificationRequest` entry stored in temporary storage after `submit_request`. Contains `storage_ref`, `manifest_hash`, `requester`, `state`, and `priority`. Each request has a unique auto-incremented ID.

**Request ID**
A monotonically increasing `u64` assigned to each verification request at submission. Used to query, cancel, archive, and dispute a request.

**RequestState**
An enum tracking where a request is in its lifecycle: `Pending` (freshly submitted), `Cancelled` (requester-initiated cancellation). Requests that expire in temporary storage without being cancelled or processed are simply dropped — they do not transition to a terminal error state.

**SLA (Service Level Agreement)**
Per-provider performance targets configured by the admin via `set_provider_sla`. Targets include `target_response_time_seconds`, `target_uptime_percentage`, and `target_success_rate`. Actual performance is tracked by `record_verification` and evaluated via `get_sla_compliance`. Providers below 70% overall compliance are automatically suspended.

**SLA compliance**
The `SLACompliance` struct returned by `get_sla_compliance`. Contains a per-target pass/fail boolean for response time, uptime, and success rate; an overall `compliance_percent` (0–100); and a `suspended` flag. Compliance below 70% triggers a `ProviderAutoSuspendedEvent`.

---

## Providers

**Active requests**
The count of in-flight verification requests currently assigned to a provider. Tracked in the Registry by `increment_active_requests` and `decrement_active_requests`. Used by `has_capacity` to gate new assignments when the provider's `max_concurrent` limit is reached.

**Failure cooldown**
A 500-ledger window after a provider accumulates 5 or more consecutive failures. During this window the load balancer (`get_next_available_provider`) skips that provider when selecting the next assignee. Resets once the provider resumes successful verifications.

**Provider**
An oracle node operator running verification software inside a TEE. In the Oracle contract, providers are identified by a Stellar `Address`. In the Registry contract, providers are identified by a 32-byte `BytesN<32>` public key. Providers must be registered by an admin before they can receive requests.

**Provider application**
A `ProviderApplication` record submitted by an applicant via `submit_provider_application`. Contains the applicant's address, intended provider public key, and descriptive metadata. Reviewed by an admin via `review_application`; approval automatically calls `add_provider`.

**Provider capacity**
The maximum number of concurrent verification requests a provider is configured to handle, set by the admin via `set_provider_capacity`. `has_capacity` returns false when `active_requests >= max_concurrent`. Providers with no capacity record are treated as having unlimited capacity.

**Provider grace period**
A 30-day window that begins when an admin calls `deactivate_provider`. During this period, new request assignments are blocked but in-flight requests may still complete. After the grace period elapses, `finalize_removal` sets the provider's status to `Removed`.

**Provider lifecycle**
The state machine governing a provider's status in the Registry: `Active` → `Deactivating(grace_end_timestamp)` → `Removed`. New providers start `Active`. Only `Active` providers can accept new requests.

**Provider metrics**
A `ProviderMetrics` struct in the Oracle contract tracking `total_verifications`, `successful_verifications`, `failed_verifications`, and `last_activity`. Updated by `record_verification_success` and `record_verification_failure`. Used by the load balancer to compute reputation scores and apply failure cooldowns.

**Provider pricing**
A `ProviderPricing` struct configured by the admin via `set_provider_pricing`. Fields: `base_fee_stroops` (flat starting charge) and `per_kb_fee_stroops` (per-kilobyte surcharge). These values feed the `estimate_cost` calculation. See [Gas Costs](gas-costs.md#application-level-verification-pricing).

**Region**
A geographic tag assigned to a provider by an admin. Supported values: `NorthAmerica`, `Europe`, `Asia`, `SouthAmerica`, `Africa`, `Oceania`. Enables geographic routing via `get_providers_by_region`.

**Reputation score**
A numeric rating of a provider's historical verification success rate. In the Registry it is a 0–1000 integer: `(successful_count × 1000) / total_verifications`. New providers are seeded at 500. Decays by 50 points per 30-day inactive period via `apply_reputation_decay`. In the Oracle contract a parallel 0–100 score is computed as `(successful / total) × 100` for load-balancing decisions.

**Round-robin index**
An instance-storage counter incremented after every call to `get_next_available_provider`. Ensures fair request distribution among providers that share the highest reputation score, so no single provider monopolizes assignments during periods of equal scoring.

**Service tier**
A classification of a provider's capability level: `Basic`, `Standard`, or `Premium`. Assigned by an admin via `set_provider_tier`. New providers default to `Basic`. Used to filter providers by tier via `get_providers_by_tier`.

**Specialization**
A capability tag indicating the types of content a provider can verify: `ImageVerification`, `VideoVerification`, `DocumentVerification`, `AiDetection`, `AudioVerification`. Multiple tags can be assigned. Enables capability-aware routing via `get_providers_by_specialization`.

**Suspension**
A block preventing a provider from being selected by the load balancer. In the Oracle contract it is triggered automatically when SLA compliance drops below 70% and cleared by an admin via `reinstate_provider`. In the Registry contract, deactivation and blacklisting serve a similar purpose but through different mechanisms.

**Weighted round-robin**
The load-balancing algorithm used by `get_next_available_provider`. Among eligible providers (registered, not suspended, not in failure cooldown), the one with the highest reputation score is selected. Ties are broken by the round-robin index.

---

## Registry and trust anchors

**Blacklist**
A Registry-level ban on a provider, keyed by their 32-byte public key. Created via `blacklist_provider(provider, reason_code)` and removed via `whitelist_provider`. A blacklisted provider causes `is_provider_authorized` to return `Err(ProviderBlacklisted)`. Distinct from SLA suspension, which is Oracle-level and temporary.

**Cert ref (certificate reference)**
A `TeeHashCertRef` struct attached to a TEE hash via `attach_cert_ref`. Stores X.509-style metadata: `issuer`, `valid_from`, `valid_until`, and an optional `cert_uri` pointing to the full DER/PEM certificate. Allows on-chain freshness validation via `validate_cert_expiration`.

**TEE hash deprecation**
The process of flagging a versioned TEE hash as no longer recommended via `deprecate_tee_hash`. The hash remains queryable but is marked `deprecated = true` with a timestamp. Does not affect `is_tee_hash_approved` — use `rotate_tee_hash` if the hash should stop being accepted.

**TEE hash rotation**
The process of invalidating an old TEE hash and replacing it with a new one via `rotate_tee_hash`. The old hash is immediately marked `rotated = true` (causing `is_tee_hash_approved` to return false). A migration pointer is stored so in-flight verifications can look up the replacement via `get_tee_hash_migration`. The new hash is registered atomically in the same call.

**TEE hash validity window**
The 180-day period after registration during which a TEE hash is considered approved. Once elapsed, `is_tee_hash_approved` returns false. A 14-day pre-expiry warning window is detectable via `is_tee_hash_near_expiry`.

**TEE hash version**
An explicit `u32` version tag attached to a TEE hash via `add_tee_hash_version`. Multiple hashes can share a version; multiple versions can be active simultaneously. Enables tracking of which enclave build generation a hash belongs to.

**Trust anchor**
The Registry contract's role in the system. It is the on-chain source of truth for approved TEE code hashes and approved provider public keys. Both the Oracle contract and the Registry's own `verify_and_mint` function query the Registry to validate these before accepting attestations or minting certificates.

---

## Fees, staking, and economics

**Application-level fee**
A fee in stroops that a requester pays an oracle provider for content verification services. Configured per provider by the admin via `set_provider_pricing`. Computed in full by `estimate_cost`. Entirely separate from and in addition to the Stellar network transaction fee.

**Base fee (provider pricing)**
The provider-configured flat starting charge for a verification in stroops, before priority and complexity surcharges are applied. Set via `set_provider_pricing`. The foundation for the `estimate_cost` formula.

**Complexity fee**
A surcharge applied by `estimate_cost` based on how computationally demanding the content is to verify: `Simple` = +0%, `Moderate` = +25% of base fee, `Complex` = +75% of base fee.

**CostEstimate**
The struct returned by `estimate_cost`. Fields: `base_fee`, `size_fee`, `priority_fee`, `complexity_fee`, `total`. All values are in stroops. See [Gas Costs](gas-costs.md#estimate_cost-breakdown).

**Minimum stake**
The smallest amount a provider must deposit to participate: 1,000,000,000 stroops (100 XLM). `deposit_stake` rejects amounts below this threshold with `InsufficientStake`.

**Per-KB fee**
The provider-configured additional charge per kilobyte of content. Computed in `estimate_cost` as `per_kb_fee_stroops × ceil(content_size_bytes / 1024)`. Set alongside `base_fee_stroops` via `set_provider_pricing`.

**Priority fee (application)**
A surcharge applied by `estimate_cost` based on request urgency: `Low`/`Normal` = +0%, `High` = +50% of base fee, `Urgent` = +150% of base fee. Separate from the effect priority has on request TTL.

**Slashing**
An admin-initiated reduction of a provider's staked balance via `slash_stake` or as part of `resolve_dispute` when the outcome is `ProviderFault`. The slash amount is capped at the provider's current balance — the operation never underflows. Slashed funds are permanently removed. Emits a `stake_slashed` event.

**Staking**
The mechanism by which providers lock up XLM in the Oracle contract as a security deposit. Managed via `deposit_stake`, `initiate_withdrawal`, and `complete_withdrawal`. Stake can be slashed by the admin as a penalty for misbehavior.

**Withdrawal cooldown**
A 7,200-ledger (~1 hour) waiting period that begins when a provider calls `initiate_withdrawal`. The stake amount is deducted from the balance immediately; it cannot be recovered until `complete_withdrawal` is called after the cooldown elapses. Attempting to complete early returns `WithdrawalCooldown`.

---

## Governance

**Dispute**
A formal complaint filed by a requester against a provider via `file_dispute`. Stores the request ID, provider address, reason bytes, and the filing ledger. Disputes progress through states: `Open` → `Resolved` (admin-adjudicated) or `Open` → `Dismissed` (admin-rejected). A `ProviderFault` resolution can trigger reputation penalties and stake slashing.

**DisputeResolution**
The outcome of an admin-reviewed dispute: `ProviderFault` (provider acted incorrectly; penalties apply) or `NoFault` (provider acted correctly; dispute closed without penalty).

**DisputeState**
The lifecycle state of a dispute: `Open` (filed, pending admin review), `Resolved` (adjudicated via `resolve_dispute`), or `Dismissed` (rejected via `dismiss_dispute`).

**Multisig governance**
A Registry-level mechanism requiring multiple admin approvals before a sensitive operation executes. Proposals are created via `propose_operation`, approved via `approve_proposal`, and executed via `execute_proposal`. Execution requires both a configurable approval threshold and a timelock period to elapse.

**Proposal**
A pending governance action created via `propose_operation`. Contains a `ProposalOperation` variant (`AddProvider`, `RemoveProvider`, `AddTeeHash`, `UpdateThreshold`), a required execution ledger (current ledger + timelock), and an approval list. Executed once enough admins have approved and the timelock has elapsed.

**Reputation penalty**
A basis-point value applied to a provider's Oracle metrics when a dispute is resolved as `ProviderFault`. Converted to synthetic failed verification records: `penalty_basis_points / 10` failures are added to the provider's `failed_verifications` count, lowering their reputation score.

**Timelock**
The number of ledgers that must pass after a proposal is created before it can be executed. Set per proposal via `propose_operation(operation, timelock_ledgers)`. Prevents instant execution of sensitive admin operations even when the approval threshold is met.

---

## Frontend and integration

**Certificate viewer**
A planned frontend page that displays a `ProvenanceCert` by ID — storage reference, manifest hash, attestation hash, creator address, and timestamp. Not yet implemented in the UI; certificates are currently viewable via `stellar contract invoke` or a block explorer.

**Freighter**
A browser extension wallet for the Stellar network. Used by the StellarVeriphy frontend to request transaction signatures from users. Integrated via `@stellar/freighter-api`. A mock wallet shim (`NEXT_PUBLIC_MOCK_WALLET=true`) is available for local development and E2E testing.

**IPFS CID**
An IPFS Content Identifier — a hash-based address pointing to a file stored on the IPFS network. Used as the `storage_ref` value in a `ProvenanceCert` when IPFS is the configured storage backend. Because the CID is derived from the file's contents, it also serves as an implicit integrity check.

**Mock wallet**
A test shim that replaces Freighter in local development and E2E tests when `NEXT_PUBLIC_MOCK_WALLET=true`. Allows wallet-connection and signing flows to be exercised without a real browser extension.

**Storage backend**
The off-chain system where media files are actually stored. StellarVeriphy supports two backends (see [ADR-0005](adr/0005-pluggable-storage-layer.md)): IPFS (content-addressed, decentralized) and MongoDB (database-backed). Only the `storage_ref` pointer is ever written on-chain.

**WalletContext**
A React context provider in the frontend (`frontend/`) that wraps Freighter API calls and exposes wallet connection state (address, network, connect/disconnect) to all child components. Falls back to the mock wallet shim in test environments.
