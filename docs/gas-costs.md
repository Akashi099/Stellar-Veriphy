# Gas Costs and Fee Reference

This document covers every fee layer you'll encounter when working with StellarVeriphy: the Stellar network's base transaction fee, Soroban resource fees, the oracle contract's application-level verification pricing, and the provider staking requirements. Amounts are in **stroops** unless otherwise noted (1 XLM = 10,000,000 stroops).

## Table of contents

- [How Stellar fees work](#how-stellar-fees-work)
- [Soroban resource fee components](#soroban-resource-fee-components)
- [Cost drivers by storage type](#cost-drivers-by-storage-type)
- [Per-operation cost guide](#per-operation-cost-guide)
  - [Oracle contract](#oracle-contract)
  - [Provenance contract](#provenance-contract)
  - [Registry contract](#registry-contract)
- [Application-level verification pricing](#application-level-verification-pricing)
  - [estimate_cost breakdown](#estimate_cost-breakdown)
  - [Priority fee multipliers](#priority-fee-multipliers)
  - [Complexity fee multipliers](#complexity-fee-multipliers)
- [Provider staking requirements](#provider-staking-requirements)
- [TTL and rent costs](#ttl-and-rent-costs)
- [Batch operation savings](#batch-operation-savings)
- [Estimating fees before submitting](#estimating-fees-before-submitting)
- [Fee optimization tips](#fee-optimization-tips)

---

## How Stellar fees work

Every transaction on Stellar carries two fee components.

**Inclusion fee (base fee)**

The classic Stellar base fee is 100 stroops (0.00001 XLM) per operation and is set in the transaction envelope. This is a fixed floor — it covers the validator work to include your transaction in a ledger. For most StellarVeriphy transactions this is negligible.

**Soroban resource fee**

Smart contract transactions pay an additional resource fee on top of the base fee. This is priced dynamically based on the actual resources your transaction consumes:

| Resource | What drives the cost |
|---|---|
| CPU instructions | Number of WASM operations executed |
| Memory | Peak bytes allocated during execution |
| Ledger reads | Number of storage entries read |
| Ledger writes | Number of storage entries written |
| Events | Topics and data emitted per event |
| Transaction size | Encoded byte size of the transaction |

The resource fee has two sub-components:
- **Non-refundable fee** — covers instructions and bandwidth. Consumed regardless of outcome.
- **Refundable fee** — covers rent (storage footprint extension). Refunded if not fully consumed.

You can use `stellar contract simulate` or the Stellar SDK's `simulateTransaction` to get an exact resource fee estimate before submitting. The numbers in the table below are relative cost tiers, not fixed stroop values, because resource prices are set by network governors and can change.

---

## Soroban resource fee components

Understanding what each contract operation touches tells you where the cost comes from.

| Cost tier | Typical drivers |
|---|---|
| Minimal | Read-only queries against instance or persistent storage |
| Light | Single persistent write (1–2 entries) + 1 event |
| Moderate | Multiple persistent writes + cross-contract call or crypto op |
| Heavy | Many writes + cross-contract call + crypto op (e.g. `verify_attestation`) |
| Scales linearly | Batch operations — cost grows proportionally with N items |

---

## Cost drivers by storage type

The Oracle, Provenance, and Registry contracts each use Soroban's three storage tiers differently, and each tier has a different rent model.

**Temporary storage** (Oracle verification requests)

- Data is assigned a TTL at write time. When TTL reaches zero the entry is silently dropped at no extra cost to you.
- Calling `extend_ttl` costs rent proportional to the extension length and the entry's byte size.
- TTL values for Oracle requests: Low priority = 50 ledgers, Normal = 100 ledgers, High/Urgent = 200 ledgers.
- The refundable portion of the fee covers the rent for the full TTL window.

**Persistent storage** (certificates, provider records, registry data)

- Data lives indefinitely but must have its TTL renewed periodically (Soroban auto-bump rules apply).
- Every write to persistent storage is more expensive than a comparable temporary write because of the longer rent horizon.
- The Provenance contract stores each `ProvenanceCert` in persistent storage — this is the dominant write cost for `mint`.

**Instance storage** (contract configuration, admin, counters)

- Tied to the contract instance TTL; automatically extended whenever the contract is invoked.
- Used for lightweight singleton values like `DataKey::Admin`, `DataKey::RequestTTL`, `DataKey::NextRequestId`.
- The cheapest storage tier for per-invocation reads.

---

## Per-operation cost guide

Cost tiers are **Minimal / Light / Moderate / Heavy** and reflect relative Soroban resource consumption. Exact stroop amounts depend on current network resource prices and should always be confirmed with `stellar contract simulate`.

### Oracle contract

| Function | Auth required | Storage ops | Cross-contract calls | Cost tier | Notes |
|---|---|---|---|---|---|
| `init` | Admin | 5 instance writes | None | Light | One-time; not repeated |
| `submit_request` | Requester | 1 temp write + extend_ttl + 1 persistent write (state index) | None | Light | TTL adds to refundable fee |
| `submit_batch_request` (N items) | Each requester | N temp writes + N extend_ttl + N index writes | None | Light × N | Capped at 10 items; scales linearly |
| `cancel_request` | Requester | 1 temp read + 1 temp write + 2 persistent writes (state index) | None | Light | |
| `get_request` | None | 1 temp read | None | Minimal | Read-only |
| `get_requests_by_state` | None | 1 persistent read + up to `limit` temp reads | None | Minimal–Light | Cost scales with limit value (max 100) |
| `verify_tee_hash` | None | 1 instance read | 1 (Registry) | Moderate | Cross-contract call is fixed overhead |
| `verify_attestation` | None | 1 instance read | 2 (Registry) | Heavy | ed25519_verify is CPU-intensive |
| `archive_old_requests` | None | N temp reads + N persistent writes | None | Scales with N | Rate-limited to once per 1000 ledgers |
| `get_archived_request` | None | 1 persistent read | None | Minimal | |
| `pause` / `unpause` | Admin | 1 instance write | None | Minimal | |
| `add_provider` | Admin | 2 persistent writes + list update | None | Light | |
| `remove_provider` | Admin | 1 persistent remove + list update | None | Light | |
| `deposit_stake` | Provider | 1 persistent read + 1 persistent write | None | Light | |
| `initiate_withdrawal` | Provider | 2 persistent reads + 2 persistent writes | None | Light | |
| `complete_withdrawal` | Provider | 1 persistent read + 1 persistent remove | None | Light | |
| `slash_stake` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `get_provider_stake` | None | 1 persistent read | None | Minimal | |
| `record_verification_success` | None | 1 persistent read + 1 persistent write | None | Light | |
| `record_verification_failure` | None | 2 persistent reads + 2 persistent writes | None | Light | Also records last-failure ledger |
| `get_reputation_score` | None | 1 persistent read | None | Minimal | |
| `get_next_available_provider` | None | 1 persistent read (provider list) + N reads (metrics) + 1 instance write (RR index) | None | Light–Moderate | Cost grows with provider list size |
| `set_provider_sla` | Admin | 1 persistent write | None | Light | |
| `record_verification` (SLA) | Admin | 1 persistent read + 1 persistent write | None | Light | May emit SLA violation or suspension events |
| `get_sla_compliance` | None | 1 persistent read | None | Minimal | |
| `reinstate_provider` | Admin | 1 persistent write | None | Light | |
| `set_provider_pricing` | Admin | 1 persistent write | None | Light | |
| `estimate_cost` | None | 1 persistent read | None | Minimal | Read-only computation |
| `file_dispute` | Requester | 1 temp read + 2 persistent writes | None | Light | |
| `resolve_dispute` | Admin | 3 persistent reads + 3 persistent writes | None | Moderate | May also slash stake |
| `dismiss_dispute` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `update_ttl_config` | Admin | 1 instance write | None | Minimal | |
| `check_expiration_warning` | None | 1 temp TTL read + 1 instance read | None | Minimal | |

### Provenance contract

| Function | Auth required | Storage ops | Cross-contract calls | Cost tier | Notes |
|---|---|---|---|---|---|
| `initialize` | — | 1 persistent write | None | Minimal | One-time |
| `mint` | Oracle | 5 persistent writes (cert, manifest index, creator index, counter, history) | None | Light–Moderate | +1 event; duplicate check adds 1 read |
| `mint_batch` (N items, max 50) | Oracle | 5N persistent writes | None | Moderate × N | Cheaper per-cert than N individual mints; single auth call |
| `get_certificate` | None | 1 persistent read | None | Minimal | |
| `revoke_certificate` | Oracle | 1 persistent read + 1 persistent write | None | Light | |
| `is_certificate_revoked` | None | 1 persistent read | None | Minimal | |
| `transfer_certificate` | Owner | 2 persistent reads + 2 persistent writes + history write | None | Light | |
| `update_metadata` | Owner | 2 persistent reads + 2 persistent writes + version history write + amendment record | None | Moderate | Version history grows per call |
| `get_metadata` | None | 1 persistent read | None | Minimal | |
| `set_expiration` | Owner | 1 persistent read + 1 persistent write | None | Light | |
| `is_certificate_expired` | None | 1 persistent read | None | Minimal | |
| `renew_certificate` | Owner | 1 persistent read + 1 persistent write | None | Light | |
| `check_expiration_warning` | None | 1 persistent read | None | Minimal | |
| `set_verification_level` | Oracle | 1 persistent read + 1 persistent write | None | Light | |
| `get_verification_level` | None | 1 persistent read | None | Minimal | |
| `get_certificates_by_verification_level` | None | 1 persistent read (counter) + up to `limit` reads | None | Minimal–Light | Full scan from newest; avoid large limits |
| `link_certificates` | Owner | 4 persistent reads + 2 persistent writes + cycle-check walk | None | Moderate | Cycle check reads up to 20 entries |
| `get_linked_certificates` | None | 1 persistent read | None | Minimal | |
| `lock_certificate` | Owner | 1 persistent read + 1 persistent write | None | Light | Irreversible |
| `create_collection` | Owner | 1 persistent write | None | Light | |
| `add_certificate_to_collection` | Collection owner | 2 persistent reads + 2 persistent writes | None | Light | |
| `get_certificates_in_collection` | None | 1 persistent read | None | Minimal | |
| `set_media_properties` | Owner | 2 persistent reads + 2 persistent writes | None | Light | Also updates content-type index |
| `get_media_properties` | None | 1 persistent read | None | Minimal | |
| `get_certificates_by_content_type` | None | 1 persistent read + up to `limit` reads | None | Minimal–Light | |
| `get_certificates_by_time_range` | None | 1 persistent read (counter) + full scan up to `limit` | None | Light–Moderate | Cost scales with scanned range; use tight time windows |
| `get_certificates_by_creator` | None | 1 persistent read (index) + up to `limit` reads | None | Minimal–Light | |
| `get_certificate_history` | None | 1 persistent read (history list) | None | Minimal | |
| `generate_verification_code` | Owner | 2 persistent reads + 2 persistent writes + SHA-256 | None | Light | |
| `verify_by_code` | None | 1 persistent read (code → id) + 1 persistent read (cert) | None | Minimal | |
| `get_certificate_stats` | None | 2 persistent reads | None | Minimal | |
| `get_creator_certificate_count` | None | 1 persistent read | None | Minimal | |
| `get_minting_time_series` | None | Up to 366 persistent reads | None | Light–Moderate | Capped at 366 days |

### Registry contract

| Function | Auth required | Storage ops | Cross-contract calls | Cost tier | Notes |
|---|---|---|---|---|---|
| `init` | — | 5 instance writes | None | Light | One-time |
| `add_tee_hash` | Admin | 2 persistent writes (flag + record) | None | Light | |
| `is_tee_hash_approved` | None | 2 persistent reads | None | Minimal | |
| `is_tee_hash_near_expiry` | None | 1 persistent read | None | Minimal | |
| `rotate_tee_hash` | Admin | 2 persistent reads + 4 persistent writes | None | Moderate | Registers new hash atomically |
| `get_tee_hash_migration` | None | 1 persistent read | None | Minimal | |
| `add_tee_hash_version` | Admin | 3 persistent reads + 4 persistent writes | None | Moderate | Maintains version list + history |
| `deprecate_tee_hash` | Admin | 2 persistent reads + 2 persistent writes | None | Light | |
| `get_tee_hash_version` | None | 1 persistent read | None | Minimal | |
| `get_tee_hashes_by_version` | None | 1 persistent read | None | Minimal | |
| `get_tee_hash_version_history` | None | 1 persistent read (full list) | None | Minimal–Light | Grows with number of registrations |
| `add_provider` | Admin | 3 persistent writes + list update + reputation seed | None | Moderate | Idempotent; seeds reputation at 500/1000 |
| `is_provider` | None | 2 persistent reads | None | Minimal | |
| `set_provider_tier` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `get_provider_info` | None | 1 persistent read | None | Minimal | |
| `get_providers_by_tier` | None | 1 persistent read (list) + N reads | None | Light | Scales with provider count |
| `deactivate_provider` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `can_accept_new_requests` | None | 1 persistent read | None | Minimal | |
| `finalize_removal` | Admin | 1 persistent read + 1 persistent write | None | Light | Panics if grace period not elapsed |
| `submit_provider_application` | Applicant | 2 persistent writes | None | Light | |
| `get_application` | None | 1 persistent read | None | Minimal | |
| `review_application` | Admin | 1 persistent read + 1 persistent write | `add_provider` (if approved) | Moderate | Approval triggers full `add_provider` cost |
| `record_verification_result` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `apply_reputation_decay` | None | 1 persistent read + 1 persistent write | None | Light | No-op if < 1 period elapsed |
| `get_provider_reputation` | None | 1 persistent read | None | Minimal | |
| `get_providers_by_min_reputation` | None | 1 persistent read (list) + N reads | None | Light | Scales with provider count |
| `set_provider_regions` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `add_provider_region` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `get_provider_regions` | None | 1 persistent read | None | Minimal | |
| `get_providers_by_region` | None | 1 persistent read (list) + N reads | None | Light | |
| `set_provider_capacity` | Admin | 1 persistent write | None | Light | |
| `get_provider_capacity` | None | 1 persistent read | None | Minimal | |
| `has_capacity` | None | 1 persistent read | None | Minimal | |
| `increment_active_requests` | None | 1 persistent read + 1 persistent write | None | Light | |
| `decrement_active_requests` | None | 1 persistent read + 1 persistent write | None | Light | |
| `add_provider_specialization` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `remove_provider_specialization` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `get_provider_specializations` | None | 1 persistent read | None | Minimal | |
| `get_providers_by_specialization` | None | 1 persistent read (list) + N reads | None | Light | |
| `blacklist_provider` | Admin | 1 persistent write | None | Light | |
| `whitelist_provider` | Admin | 1 persistent read + 1 persistent remove | None | Light | |
| `is_blacklisted` | None | 1 persistent read | None | Minimal | |
| `is_provider_authorized` | None | 2 persistent reads | None | Minimal | |
| `propose_operation` | Admin | 2 instance reads + 1 persistent write | None | Light | |
| `approve_proposal` | Admin | 1 persistent read + 1 persistent write | None | Light | |
| `execute_proposal` | Admin | 2 persistent reads + 1 persistent write | None | Light | |
| `verify_and_mint` | — | 1 instance read + SHA-256 | 1 (Provenance) | Heavy | Full `mint` cost on Provenance side |
| `attach_cert_ref` | Admin | 2 persistent reads + 1 persistent write | None | Light | |
| `get_cert_ref` | None | 1 persistent read | None | Minimal | |
| `validate_cert_expiration` | None | 1 persistent read | None | Minimal | |

---

## Application-level verification pricing

The Oracle contract has a separate, application-layer fee concept for the cost of a **verification service** — i.e., what a requester pays an oracle provider to verify their content. These fees are denominated in stroops and configured per provider by the admin via `set_provider_pricing`. They are entirely distinct from the Stellar network fees described above.

This is the fee returned by `estimate_cost` and referenced in the `submitted` event.

### estimate_cost breakdown

`estimate_cost(provider, content_size_bytes, priority, complexity)` returns a `CostEstimate` struct:

```
total = base_fee + size_fee + priority_fee + complexity_fee
```

| Field | Formula |
|---|---|
| `base_fee` | Provider's configured `base_fee_stroops` |
| `size_fee` | `per_kb_fee_stroops × ceil(content_size_bytes / 1024)` |
| `priority_fee` | See multiplier table below |
| `complexity_fee` | See multiplier table below |
| `total` | Sum of all four |

### Priority fee multipliers

| Priority level | Priority fee |
|---|---|
| `Low` | 0% of base_fee (no surcharge) |
| `Normal` | 0% of base_fee (no surcharge) |
| `High` | +50% of base_fee |
| `Urgent` | +150% of base_fee |

Priority also affects how long a request lives in temporary storage before expiring:

| Priority | TTL (ledgers) | Approximate duration (at 5s/ledger) |
|---|---|---|
| `Low` | 50 | ~4 minutes |
| `Normal` | 100 | ~8 minutes |
| `High` | 200 | ~17 minutes |
| `Urgent` | 200 | ~17 minutes |

### Complexity fee multipliers

| Content complexity | Complexity fee |
|---|---|
| `Simple` | 0% of base_fee |
| `Moderate` | +25% of base_fee |
| `Complex` | +75% of base_fee |

### Example calculation

A provider with `base_fee_stroops = 10_000_000` (1 XLM) and `per_kb_fee_stroops = 100_000` processing a 512 KB file with `High` priority and `Moderate` complexity:

```
base_fee      = 10,000,000
size_fee      = 100,000 × 512   = 51,200,000
priority_fee  = 10,000,000 × 50% = 5,000,000
complexity_fee = 10,000,000 × 25% = 2,500,000
─────────────────────────────────────────────
total         = 68,700,000 stroops  (6.87 XLM)
```

Note: providers set their own pricing. Pricing is not enforced by the contract — `estimate_cost` is an informational call. The actual payment flow between requester and provider is handled outside the smart contract layer.

---

## Provider staking requirements

Providers must maintain a minimum stake to participate in the network. Staking is managed by the Oracle contract.

| Parameter | Value |
|---|---|
| Minimum stake | 1,000,000,000 stroops (100 XLM) |
| Withdrawal cooldown | 7,200 ledgers ≈ 1 hour |
| Slashing | Admin-initiated; amount is capped at current stake balance |

**Withdrawal flow:**

1. Call `initiate_withdrawal(provider, amount)` — stake is deducted immediately; a cooldown record is written.
2. Wait for 7,200 ledgers (~1 hour).
3. Call `complete_withdrawal(provider)` — returns the withdrawn amount. Fails with `WithdrawalCooldown` if the cooldown hasn't elapsed.

**Slashing:** if `resolve_dispute` finds `ProviderFault`, the admin can specify a `slash_amount`. The contract deducts it from the provider's stake (capped at what's available — the function won't underflow) and emits a `stake_slashed` event. Slashed stake is removed from the balance permanently.

---

## TTL and rent costs

Rent on Stellar is charged as part of the refundable resource fee. The key numbers for StellarVeriphy:

| Data | Storage type | Default TTL | Notes |
|---|---|---|---|
| Verification requests (`Low` priority) | Temporary | 50 ledgers | ~4 min; auto-deleted on expiry |
| Verification requests (`Normal` priority) | Temporary | 100 ledgers | ~8 min |
| Verification requests (`High`/`Urgent` priority) | Temporary | 200 ledgers | ~17 min |
| Provenance certificates | Persistent | Network minimum | Auto-bumped on reads; live indefinitely |
| Provider records (registry) | Persistent | Network minimum | Auto-bumped on reads |
| Contract configuration | Instance | Tied to contract | Bumped on every invocation |

Requests that expire in temporary storage are not recoverable through `get_request` — they return `None`. Use `archive_old_requests` before TTL expiry if you need to preserve them long-term. `archive_old_requests` itself can only run once per 1000 ledgers.

---

## Batch operation savings

Both the Oracle and Provenance contracts support batch operations that reduce per-item overhead compared to submitting individually.

**Oracle — `submit_batch_request` (max 10 items)**

- Single transaction envelope → one base fee covering all N requests.
- Each item in the batch still writes its own temporary storage entry and TTL extension.
- The per-item cost is slightly lower than N separate `submit_request` calls because the transaction overhead (signature verification, ledger read of NextRequestId) is shared.

**Provenance — `mint_batch` (max 50 items)**

- Oracle auth is verified once for the entire batch.
- Each certificate still requires its own persistent writes (cert, manifest index, creator index, counter, history), so total write cost scales linearly with N.
- The saving is the auth overhead (one `require_auth` call instead of N) and a smaller total transaction count on the Stellar network.
- Batching 50 mints in one transaction is significantly cheaper in network fees than 50 individual mint transactions.

---

## Estimating fees before submitting

Always simulate before submitting a transaction in production.

For a repeatable per-operation cost baseline of the oracle contract's most-used calls, see the [contract performance benchmark](benchmarks/README.md) and `pnpm bench:contracts`.

**Using the Stellar CLI:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <ACCOUNT> \
  --network testnet \
  --fee 1000000 \
  -- submit_request \
     --storage_ref "ipfs://Qm..." \
     --manifest_hash "abc123..." \
     --requester <REQUESTER_ADDRESS> \
     --priority '{"Normal": null}'
```

Add `--simulate-only` (or use `contract simulate`) to get the resource fee without broadcasting.

**Using the JavaScript SDK:**

```typescript
import { SorobanRpc } from "@stellar/stellar-sdk";

const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
const simResult = await server.simulateTransaction(tx);

if (SorobanRpc.Api.isSimulationSuccess(simResult)) {
  console.log("Classic fee (base):", simResult.minResourceFee, "stroops");
  console.log("Soroban resource fee:", simResult.cost);
}
```

The `minResourceFee` field is what you must add to your transaction's `fee` field in addition to the base fee.

---

## Fee optimization tips

**For requesters:**
- Use `Low` priority unless time-sensitive — the TTL is shorter but the network resource fee is the same; you avoid the priority surcharge on application-level fees.
- Keep `submit_batch_request` batches as close to the 10-item cap as possible to maximize the shared-overhead savings.
- Avoid calling `get_certificates_by_time_range` or `get_certificates_by_verification_level` with very large `limit` values — wide scans read many storage entries and increase your read fee.

**For providers:**
- Deposit stake in a single large `deposit_stake` call rather than many small ones — each call has the same overhead regardless of amount.
- Initiate withdrawals only when necessary; the cooldown period ties up capital for approximately 1 hour.

**For oracle operators:**
- Call `archive_old_requests` proactively (every ~800 ledgers) rather than waiting for the 1000-ledger rate limit to be reached. Archiving before TTL expiry is the only way to preserve request data long-term.
- Set TTL configs conservatively: lower-priority requests with shorter TTLs reduce the refundable rent cost for requesters.

**For admins:**
- Batch admin operations (adding providers, registering TEE hashes) where possible — each transaction has a base fee, so combining operations into fewer transactions reduces total cost.
- Use `mint_batch` instead of repeated `mint` calls when onboarding multiple certificates at once.
