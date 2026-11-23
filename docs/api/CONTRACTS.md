# Smart Contract API Reference

This reference covers the public API exposed by the StellarVeriphy Soroban
contracts in `contracts/oracle`, `contracts/provenance`, and
`contracts/registry`.

Generate the canonical RustDoc reference from source comments with:

```bash
pnpm docs:contracts
```

The GitHub Pages workflow in `.github/workflows/contract-docs.yml` publishes
this reference plus generated RustDoc artifacts on pushes to `main`.

> Note: this checkout currently contains duplicated/interleaved Rust blocks in
> contract sources. If `cargo doc` fails, fix the malformed Rust first; this
> file documents the intended public surface visible in the source.

## Invocation Pattern

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source <IDENTITY> \
  -- <function_name> --<arg-name> <value>
```

Use generated Soroban client `try_*` methods for calls that return
`Result<T, Error>` so typed contract errors can be handled without panics.

## Oracle Contract

Coordinates verification requests, providers, staking, disputes, SLA checks,
cost estimates, and TEE attestation checks.

| Function                      | Parameters                                                                                                            | Returns                                           | Description                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `init`                        | `registry: Address`, `provenance: Address`, `admin: Address`                                                          | `Result<(), Error>`                               | Initializes dependencies and admin ownership. |
| `add_provider`                | `provider: Address`                                                                                                   | `Result<(), Error>`                               | Registers an oracle provider. Admin-gated.    |
| `remove_provider`             | `provider: Address`                                                                                                   | `Result<(), Error>`                               | Removes a provider. Admin-gated.              |
| `is_provider`                 | `provider: Address`                                                                                                   | `bool`                                            | Checks whether an address is a provider.      |
| `pause`                       | none                                                                                                                  | `Result<(), Error>`                               | Pauses request submission. Admin-gated.       |
| `unpause`                     | none                                                                                                                  | `Result<(), Error>`                               | Resumes request submission. Admin-gated.      |
| `is_paused`                   | none                                                                                                                  | `bool`                                            | Reads pause state.                            |
| `deposit_stake`               | `provider: Address`, `amount: u128`                                                                                   | `Result<(), Error>`                               | Adds provider stake after provider auth.      |
| `initiate_withdrawal`         | `provider: Address`, `amount: u128`                                                                                   | `Result<(), Error>`                               | Starts stake withdrawal cooldown.             |
| `complete_withdrawal`         | `provider: Address`                                                                                                   | `Result<u128, Error>`                             | Completes withdrawal and returns amount.      |
| `get_provider_stake`          | `provider: Address`                                                                                                   | `u128`                                            | Reads current provider stake.                 |
| `slash_stake`                 | `provider: Address`, `amount: u128`                                                                                   | `Result<(), Error>`                               | Reduces provider stake as admin penalty.      |
| `record_verification_success` | `provider: Address`                                                                                                   | `()`                                              | Records a successful verification.            |
| `record_verification_failure` | `provider: Address`                                                                                                   | `()`                                              | Records a failed verification.                |
| `get_provider_metrics`        | `provider: Address`                                                                                                   | `Option<ProviderMetrics>` / `Option<ProviderSLA>` | Reads provider metrics.                       |
| `get_reputation_score`        | `provider: Address`                                                                                                   | `u32`                                             | Returns provider reputation percentage.       |
| `get_next_available_provider` | none                                                                                                                  | `Result<Address, Error>`                          | Selects an eligible provider.                 |
| `get_provider_list`           | none                                                                                                                  | `Vec<Address>`                                    | Lists registered providers.                   |
| `file_dispute`                | `request_id: u64`, `provider: Address`, `reason: Bytes`                                                               | `Result<u64, Error>`                              | Opens a verification dispute.                 |
| `resolve_dispute`             | `dispute_id: u64`, `resolution: DisputeResolution`, `reputation_penalty: u32`, `slash_amount: u128`                   | `Result<(), Error>`                               | Resolves a dispute and applies penalties.     |
| `dismiss_dispute`             | `dispute_id: u64`                                                                                                     | `Result<(), Error>`                               | Closes a dispute without penalty.             |
| `get_dispute`                 | `dispute_id: u64`                                                                                                     | `Option<Dispute>`                                 | Reads dispute details.                        |
| `get_disputes_by_provider`    | `provider: Address`                                                                                                   | `Vec<u64>`                                        | Lists dispute IDs for a provider.             |
| `submit_request`              | `storage_ref: Bytes`, `manifest_hash: Bytes`, `requester: Address`, `priority: Priority`                              | `Result<u64, Error>`                              | Creates a verification request.               |
| `get_request`                 | `id: u64`                                                                                                             | `Option<VerificationRequest>`                     | Reads an active request.                      |
| `cancel_request`              | `id: u64`                                                                                                             | `Result<(), Error>`                               | Cancels a pending request.                    |
| `submit_batch_request`        | `requests: Vec<(Bytes, Bytes, Address, Priority)>`                                                                    | `Result<Vec<u64>, Error>`                         | Creates up to 10 requests.                    |
| `get_requests_by_state`       | `state: RequestState`, `offset: u32`, `limit: u32`, `requester: Option<Address>`                                      | `PaginatedRequests`                               | Lists requests by state.                      |
| `get_ttl_config`              | none                                                                                                                  | `TTLConfig` / `Result<TTLConfig, Error>`          | Reads request TTL settings.                   |
| `update_ttl_config`           | `config: TTLConfig` or TTL fields                                                                                     | `Result<(), Error>`                               | Updates TTL settings. Admin-gated.            |
| `get_warning_threshold`       | none                                                                                                                  | `u32`                                             | Reads expiration warning threshold.           |
| `update_warning_threshold`    | `ledgers: u32`                                                                                                        | `Result<(), Error>`                               | Updates warning threshold. Admin-gated.       |
| `check_expiration_warning`    | `id: u64`                                                                                                             | `bool`                                            | Emits/returns near-expiration state.          |
| `archive_old_requests`        | none                                                                                                                  | `u32`                                             | Archives expired requests and returns count.  |
| `get_archived_request`        | `id: u64`                                                                                                             | `Option<ArchivedRequest>`                         | Reads an archived request.                    |
| `get_last_archival_ledger`    | none                                                                                                                  | `u32`                                             | Reads last archival ledger.                   |
| `verify_tee_hash`             | `tee_hash: BytesN<32>`                                                                                                | `Result<(), Error>`                               | Checks TEE approval through registry.         |
| `verify_attestation`          | `provider: BytesN<32>`, `tee_hash: BytesN<32>`, `payload: Bytes`, `signature: BytesN<64>`                             | `Result<(), Error>`                               | Verifies provider, TEE hash, and signature.   |
| `set_provider_sla`            | `provider: Address`, `target_response_time_seconds: u32`, `target_uptime_percentage: u32`, `target_success_rate: u32` | `Result<(), Error>`                               | Stores SLA targets. Admin-gated.              |
| `record_verification`         | `provider: Address`, `success: bool`, `response_time_seconds: u32`, `uptime_sample: u32`                              | `Result<(), Error>`                               | Updates SLA metrics and suspension state.     |
| `get_sla_compliance`          | `provider: Address`                                                                                                   | `Result<SLACompliance, Error>`                    | Reads SLA compliance.                         |
| `reinstate_provider`          | `provider: Address`                                                                                                   | `Result<(), Error>`                               | Clears suspension. Admin-gated.               |
| `is_provider_suspended`       | `provider: Address`                                                                                                   | `bool`                                            | Checks suspension.                            |
| `set_provider_pricing`        | `provider: Address`, `base_fee_stroops: u128`, `per_kb_fee_stroops: u128`                                             | `Result<(), Error>`                               | Configures pricing. Admin-gated.              |
| `get_provider_pricing`        | `provider: Address`                                                                                                   | `Option<ProviderPricing>`                         | Reads pricing.                                |
| `estimate_cost`               | `provider: Address`, `content_size_bytes: u64`, `priority: Priority`, `complexity: ContentComplexity`                 | `Result<CostEstimate, Error>`                     | Returns itemized estimated cost.              |

```bash
stellar contract invoke --id $ORACLE_ID --network testnet --source alice -- \
  submit_request --storage-ref ipfs://bafy... \
  --manifest-hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 \
  --requester $ALICE_ADDRESS --priority Normal
```

## Provenance Contract

Mints and manages certificates, ownership, metadata, revocation, lookup codes,
collections, media properties, and analytics.

| Function                                 | Parameters                                                                                                                                                                                      | Returns                                      | Description                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `initialize`                             | `oracle: Address`                                                                                                                                                                               | `()`                                         | Stores the oracle authorized to mint.           |
| `set_admin`                              | `admin: Address`                                                                                                                                                                                | `()`                                         | Stores an admin address. Oracle-gated.          |
| `get_admin`                              | none                                                                                                                                                                                            | `Option<Address>`                            | Reads the admin address.                        |
| `mint`                                   | `storage_ref: String`, `manifest_hash: String`, `attestation_hash: String`, `to: Address`                                                                                                       | `u64`                                        | Mints a certificate. Oracle-gated.              |
| `get_certificate`                        | `id: u64`                                                                                                                                                                                       | `Result<ProvenanceCert, ProvenanceError>`    | Reads a certificate by ID.                      |
| `revoke_certificate`                     | `certificate_id: u64`, `reason: RevocationReason`                                                                                                                                               | `Result<(), ProvenanceError>`                | Revokes a certificate. Oracle-gated.            |
| `is_certificate_revoked`                 | `certificate_id: u64`                                                                                                                                                                           | `Result<bool, ProvenanceError>`              | Reads revocation status.                        |
| `set_expiration`                         | `certificate_id: u64`, `expires_at: Option<u64>`                                                                                                                                                | `Result<(), ProvenanceError>`                | Sets or clears expiration. Creator-gated.       |
| `is_certificate_expired`                 | `certificate_id: u64`                                                                                                                                                                           | `Result<bool, ProvenanceError>`              | Checks expiration.                              |
| `renew_certificate`                      | `certificate_id: u64`, `new_expires_at: u64`                                                                                                                                                    | `Result<(), ProvenanceError>`                | Renews expiration. Creator-gated.               |
| `check_expiration_warning`               | `certificate_id: u64`, `warning_window: u64`                                                                                                                                                    | `Result<bool, ProvenanceError>`              | Emits/returns near-expiration state.            |
| `set_verification_level`                 | `certificate_id: u64`, `level: VerificationLevel`                                                                                                                                               | `Result<(), ProvenanceError>`                | Updates badge level. Oracle-gated.              |
| `get_verification_level`                 | `certificate_id: u64`                                                                                                                                                                           | `Result<VerificationLevel, ProvenanceError>` | Reads badge level.                              |
| `get_certificates_by_verification_level` | `level: VerificationLevel`, `offset: u32`, `limit: u32`                                                                                                                                         | `Vec<(u64, ProvenanceCert)>`                 | Lists certificates by badge level.              |
| `link_certificates`                      | `certificate_id: u64`, `relation: CertificateRelation`                                                                                                                                          | `Result<(), ProvenanceError>`                | Links certificates reciprocally. Creator-gated. |
| `get_linked_certificates`                | `certificate_id: u64`                                                                                                                                                                           | `Vec<CertificateRelation>`                   | Reads certificate links.                        |
| `transfer_certificate`                   | `certificate_id: u64`, `new_owner: Address`                                                                                                                                                     | `()`                                         | Transfers ownership. Creator-gated.             |
| `update_metadata`                        | `certificate_id: u64`, `display_name: String`, `description: String`                                                                                                                            | `()`                                         | Updates metadata and history. Creator-gated.    |
| `get_metadata`                           | `certificate_id: u64`                                                                                                                                                                           | `CertificateMetadata`                        | Reads current metadata.                         |
| `get_certificates_by_time_range`         | `start_time: u64`, `end_time: u64`, `offset: u32`, `limit: u32`                                                                                                                                 | `Vec<(u64, ProvenanceCert)>`                 | Lists certificates by mint time.                |
| `mint_batch`                             | `storage_refs: Vec<String>`, `manifest_hashes: Vec<String>`, `attestation_hashes: Vec<String>`, `to: Address`                                                                                   | `Result<Vec<u64>, ProvenanceError>`          | Mints multiple certificates. Oracle-gated.      |
| `get_certificates_by_creator`            | `creator: Address`, `offset: u32`, `limit: u32`                                                                                                                                                 | `Vec<(u64, ProvenanceCert)>`                 | Lists certificates by creator.                  |
| `get_certificate_history`                | `certificate_id: u64`, `offset: u32`, `limit: u32`                                                                                                                                              | `Vec<CertificateHistory>`                    | Lists certificate history.                      |
| `generate_verification_code`             | `certificate_id: u64`                                                                                                                                                                           | `Result<String, ProvenanceError>`            | Creates/rotates lookup code. Creator-gated.     |
| `verify_by_code`                         | `code: String`                                                                                                                                                                                  | `Result<ProvenanceCert, ProvenanceError>`    | Finds a certificate by code.                    |
| `get_verification_code`                  | `certificate_id: u64`                                                                                                                                                                           | `Result<String, ProvenanceError>`            | Reads current lookup code.                      |
| `set_media_properties`                   | `certificate_id: u64`, `content_type: ContentType`, `mime_type: String`, `resolution: Option<String>`, `duration_seconds: Option<u64>`, `file_size_bytes: Option<u64>`, `codec: Option<String>` | `Result<(), ProvenanceError>`                | Stores media metadata. Creator-gated.           |
| `get_media_properties`                   | `certificate_id: u64`                                                                                                                                                                           | `Result<MediaProperties, ProvenanceError>`   | Reads media metadata.                           |
| `get_certificate_stats`                  | none                                                                                                                                                                                            | `CertificateStats`                           | Reads aggregate mint stats.                     |
| `get_creator_certificate_count`          | `creator: Address`                                                                                                                                                                              | `u64`                                        | Counts creator certificates.                    |
| `get_minting_time_series`                | `start_day: u64`, `end_day: u64`                                                                                                                                                                | `Vec<TimeSeriesPoint>`                       | Reads daily mint counts.                        |
| `create_collection`                      | `owner: Address`, `name: String`, `description: String`                                                                                                                                         | `u64`                                        | Creates a collection. Owner-gated.              |
| `get_collection`                         | `collection_id: u64`                                                                                                                                                                            | `Result<Collection, ProvenanceError>`        | Reads a collection.                             |
| `add_certificate_to_collection`          | `collection_id: u64`, `certificate_id: u64`                                                                                                                                                     | `Result<(), ProvenanceError>`                | Adds certificate to collection. Owner-gated.    |
| `get_certificates_in_collection`         | `collection_id: u64`                                                                                                                                                                            | `Vec<u64>`                                   | Lists collection certificate IDs.               |
| `get_collections_for_certificate`        | `certificate_id: u64`                                                                                                                                                                           | `Vec<u64>`                                   | Lists certificate collection IDs.               |
| `get_certificates_by_content_type`       | `content_type: ContentType`, `offset: u32`, `limit: u32`                                                                                                                                        | `Vec<(u64, ProvenanceCert)>`                 | Lists certificates by content type.             |
| `lock_certificate`                       | `certificate_id: u64`                                                                                                                                                                           | `Result<(), ProvenanceError>`                | Locks a certificate permanently. Creator-gated. |

```bash
stellar contract invoke --id $PROVENANCE_ID --network testnet --source oracle -- \
  mint --storage-ref ipfs://bafy... --manifest-hash 9f86d081... \
  --attestation-hash 3b2f9c11... --to $ALICE_ADDRESS
```

## Registry Contract

Manages trusted TEE hashes, providers, lifecycle metadata, reputation,
capacity, regions, specializations, blacklist state, and multisig operations.

| Function                          | Parameters                                                                                                   | Returns                             | Description                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------ |
| `init`                            | `admin: Address`, `provenance: Address`                                                                      | `()`                                | Initializes admin and provenance dependency.     |
| `get_admin`                       | none                                                                                                         | `Option<Address>`                   | Reads admin address.                             |
| `add_tee_hash`                    | `code_hash: BytesN<32>`                                                                                      | `()`                                | Registers a TEE hash. Admin-gated.               |
| `is_tee_hash_approved`            | `code_hash: BytesN<32>`                                                                                      | `bool`                              | Checks TEE hash approval.                        |
| `is_tee_hash_near_expiry`         | `code_hash: BytesN<32>`                                                                                      | `bool`                              | Checks warning window.                           |
| `rotate_tee_hash`                 | `old_hash: BytesN<32>`, `new_hash: BytesN<32>`                                                               | `()`                                | Rotates a TEE hash. Admin-gated.                 |
| `get_tee_hash_migration`          | `old_hash: BytesN<32>`                                                                                       | `Option<BytesN<32>>`                | Reads replacement hash.                          |
| `add_tee_hash_version`            | `code_hash: BytesN<32>`, `version: u32`                                                                      | `()`                                | Stores hash version metadata. Admin-gated.       |
| `deprecate_tee_hash`              | `code_hash: BytesN<32>`                                                                                      | `Result<(), Error>`                 | Deprecates a versioned hash. Admin-gated.        |
| `get_tee_hash_version`            | `code_hash: BytesN<32>`                                                                                      | `Result<TeeHashVersionInfo, Error>` | Reads version metadata.                          |
| `get_tee_hashes_by_version`       | `version: u32`                                                                                               | `Vec<BytesN<32>>`                   | Lists hashes by version.                         |
| `get_tee_hash_version_history`    | none                                                                                                         | `Vec<TeeHashVersionInfo>`           | Reads version history.                           |
| `add_provider`                    | `provider: BytesN<32>`                                                                                       | `()`                                | Registers provider key. Admin-gated.             |
| `is_provider`                     | `provider: BytesN<32>`                                                                                       | `bool`                              | Checks provider registration.                    |
| `set_provider_tier`               | `provider: BytesN<32>`, `tier: ServiceTier`                                                                  | `()`                                | Sets provider tier. Admin-gated.                 |
| `get_provider_info`               | `provider: BytesN<32>`                                                                                       | `Option<ProviderInfo>`              | Reads provider metadata.                         |
| `get_providers_by_tier`           | `tier: ServiceTier`                                                                                          | `Vec<BytesN<32>>`                   | Lists providers by tier.                         |
| `deactivate_provider`             | `provider: BytesN<32>`                                                                                       | `()`                                | Starts removal grace period. Admin-gated.        |
| `can_accept_new_requests`         | `provider: BytesN<32>`                                                                                       | `bool`                              | Checks whether provider can receive requests.    |
| `finalize_removal`                | `provider: BytesN<32>`                                                                                       | `()`                                | Completes provider removal. Admin-gated.         |
| `submit_provider_application`     | `applicant: Address`, `provider_key: BytesN<32>`, `metadata: String`                                         | `u64`                               | Submits onboarding application. Applicant-gated. |
| `get_application`                 | `application_id: u64`                                                                                        | `Option<ProviderApplication>`       | Reads application.                               |
| `review_application`              | `application_id: u64`, `approve: bool`                                                                       | `()`                                | Approves/rejects application. Admin-gated.       |
| `record_verification_result`      | `provider: BytesN<32>`, `success: bool`                                                                      | `Result<(), Error>`                 | Updates reputation. Admin-gated.                 |
| `apply_reputation_decay`          | `provider: BytesN<32>`                                                                                       | `Result<(), Error>`                 | Applies time-based reputation decay.             |
| `get_provider_reputation`         | `provider: BytesN<32>`                                                                                       | `Result<ProviderReputation, Error>` | Reads reputation.                                |
| `get_providers_by_min_reputation` | `min_score: u32`                                                                                             | `Vec<BytesN<32>>`                   | Lists providers by reputation threshold.         |
| `set_provider_regions`            | `provider: BytesN<32>`, `regions: Vec<Region>`                                                               | `Result<(), Error>`                 | Sets provider regions. Admin-gated.              |
| `add_provider_region`             | `provider: BytesN<32>`, `region: Region`                                                                     | `Result<(), Error>`                 | Adds provider region. Admin-gated.               |
| `get_provider_regions`            | `provider: BytesN<32>`                                                                                       | `Vec<Region>`                       | Reads regions.                                   |
| `get_providers_by_region`         | `region: Region`                                                                                             | `Vec<BytesN<32>>`                   | Lists providers by region.                       |
| `set_provider_capacity`           | `provider: BytesN<32>`, `max_concurrent: u32`                                                                | `Result<(), Error>`                 | Sets capacity. Admin-gated.                      |
| `get_provider_capacity`           | `provider: BytesN<32>`                                                                                       | `Result<ProviderCapacity, Error>`   | Reads capacity.                                  |
| `has_capacity`                    | `provider: BytesN<32>`                                                                                       | `bool`                              | Checks available capacity.                       |
| `increment_active_requests`       | `provider: BytesN<32>`                                                                                       | `Result<(), Error>`                 | Reserves capacity.                               |
| `decrement_active_requests`       | `provider: BytesN<32>`                                                                                       | `Result<(), Error>`                 | Releases capacity.                               |
| `add_provider_specialization`     | `provider: BytesN<32>`, `specialization: Specialization`                                                     | `Result<(), Error>`                 | Adds specialization. Admin-gated.                |
| `remove_provider_specialization`  | `provider: BytesN<32>`, `specialization: Specialization`                                                     | `Result<(), Error>`                 | Removes specialization. Admin-gated.             |
| `get_provider_specializations`    | `provider: BytesN<32>`                                                                                       | `Vec<Specialization>`               | Reads specializations.                           |
| `get_providers_by_specialization` | `specialization: Specialization`                                                                             | `Vec<BytesN<32>>`                   | Lists providers by specialization.               |
| `blacklist_provider`              | `provider: BytesN<32>`, `reason_code: u32`                                                                   | `Result<(), Error>`                 | Blacklists provider. Admin-gated.                |
| `whitelist_provider`              | `provider: BytesN<32>`                                                                                       | `Result<(), Error>`                 | Removes blacklist state. Admin-gated.            |
| `is_blacklisted`                  | `provider: BytesN<32>`                                                                                       | `bool`                              | Checks blacklist state.                          |
| `get_blacklist_entry`             | `provider: BytesN<32>`                                                                                       | `Result<BlacklistEntry, Error>`     | Reads blacklist details.                         |
| `is_provider_authorized`          | `provider: BytesN<32>`                                                                                       | `Result<bool, Error>`               | Checks registration and blacklist state.         |
| `verify_and_mint`                 | `content: Bytes`, `expected_hash: BytesN<32>`, `owner: Address`                                              | `VerificationResult`                | Verifies hash and mints on match.                |
| `get_multisig_threshold`          | none                                                                                                         | `u32`                               | Reads multisig threshold.                        |
| `update_multisig_threshold`       | `threshold: u32`                                                                                             | `Result<(), Error>`                 | Updates threshold. Admin-gated.                  |
| `propose_operation`               | `operation: ProposalOperation`, `timelock_ledgers: u32`                                                      | `Result<u64, Error>`                | Creates multisig proposal.                       |
| `approve_proposal`                | `proposal_id: u64`                                                                                           | `Result<(), Error>`                 | Approves proposal. Admin-gated.                  |
| `execute_proposal`                | `proposal_id: u64`                                                                                           | `Result<(), Error>`                 | Executes approved proposal after timelock.       |
| `get_proposal`                    | `proposal_id: u64`                                                                                           | `Option<Proposal>`                  | Reads proposal.                                  |
| `get_proposal_approvals`          | `proposal_id: u64`                                                                                           | `Vec<Address>`                      | Lists proposal approvers.                        |
| `attach_cert_ref`                 | `code_hash: BytesN<32>`, `issuer: String`, `valid_from: u64`, `valid_until: u64`, `cert_uri: Option<String>` | `Result<(), Error>`                 | Attaches certificate reference. Admin-gated.     |
| `get_cert_ref`                    | `code_hash: BytesN<32>`                                                                                      | `Result<TeeHashCertRef, Error>`     | Reads certificate reference.                     |
| `get_tee_hash_with_cert`          | `code_hash: BytesN<32>`                                                                                      | `(bool, Option<TeeHashCertRef>)`    | Reads approval plus certificate reference.       |
| `validate_cert_expiration`        | `code_hash: BytesN<32>`                                                                                      | `Result<bool, Error>`               | Checks certificate reference validity.           |

```bash
stellar contract invoke --id $REGISTRY_ID --network testnet --source admin -- \
  add_tee_hash --code-hash 7c9e6f3a...
```

## Event Replay Verification

`scripts/contract-event-replay.mjs` rebuilds verification state from raw
contract events and compares it against an exported snapshot of the current
indexed state. Operators use it to detect records that were dropped or
mutated between the chain and the indexer.

### Inputs

The tool takes two JSON files:

- **Event dump** — an array of contract events (as returned by
  `stellar contract events` or the indexer's raw event log). Each entry must
  include `contract`, `ledger`, `txHash`, `type`, and `value`.
- **Indexed state export** — the indexer's current view, keyed by record ID,
  with the same fields the replay reconstructs (e.g. `requestId`,
  `certificateId`, `provider`, `state`, `manifestHash`).

```bash
node scripts/contract-event-replay.mjs \
  --events ./artifacts/events-1000-2000.json \
  --state ./artifacts/indexed-state.json \
  --from-ledger 1000 \
  --to-ledger 2000 \
  --out ./artifacts/replay-report.json
```

### Bounded ranges

`--from-ledger` and `--to-ledger` are inclusive and required for
deterministic runs. The tool refuses to scan unbounded ranges; split large
backfills into windows (e.g. 10,000 ledgers) and run each window separately.
`--contract` may be repeated to restrict replay to specific contract IDs.

### Output format

The report is stable, sorted JSON so successive runs can be diffed:

```json
{
  "range": { "fromLedger": 1000, "toLedger": 2000 },
  "contracts": ["C..."],
  "summary": { "replayed": 412, "matched": 400, "missing": 7, "altered": 5 },
  "missing": [
    { "recordId": "req:1042", "lastSeenLedger": 1187, "reason": "no indexed record" }
  ],
  "altered": [
    {
      "recordId": "cert:88",
      "fields": [
        { "field": "manifestHash", "replayed": "9f86...", "indexed": "0000..." }
      ]
    }
  ]
}
```

### Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| `0`  | Replay completed and every record matched.                           |
| `1`  | Replay completed with `missing` or `altered` records (see report).   |
| `2`  | Invalid arguments, unreadable input, or malformed event/state data.  |

### Interpreting results

- **Missing** records exist in the event stream but not in the indexed
  state. Re-run the indexer for the affected ledger range; if the record is
  still absent, treat it as a dropped write and escalate.
- **Altered** records exist in both but disagree on one or more fields. The
  `fields` array lists each mismatch with the replayed and indexed values.
  Altered records usually indicate a bug in indexer update logic or an
  out-of-band manual edit; do not trust the indexed copy until reconciled.
- A clean run (`exit 0`) with an empty `missing`/`altered` set is the
  expected state before promoting an indexer deployment.

## Error Handling

Contract-defined failures use `#[contracterror]` enums such as `Error` and
`ProvenanceError`. Authorization failures from `require_auth()` abort at the
Soroban host level.

```rust
match client.try_get_certificate(&certificate_id) {
    Ok(Ok(certificate)) => {
        // Use certificate.
    }
    Ok(Err(contract_error)) => {
        // Handle typed ProvenanceError.
    }
    Err(host_error) => {
        // Handle invocation, auth, or host failure.
    }
}
```
