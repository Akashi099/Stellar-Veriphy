# Contract Improvements: Upgrade Safety, Proof Validation, and Admin Audit

This document outlines the implementation requirements for GitHub issues #795, #796, #797, and #798.

## Issue #795: Improve Upgradeability Checks for Contract Modules

### Objective
Audit whether contract upgrades and storage migrations have explicit safety checks to ensure critical state is protected and backward compatibility is maintained.

### Required Changes

#### 1. Add Upgrade Safety Data Structures (Oracle, Provenance, Registry)

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct UpgradeCheckpoint {
    pub version_from: u32,
    pub version_to: u32,
    pub checkpoint_ledger: u32,
    /// Merkle-like hash of critical state
    pub state_hash: BytesN<32>,
    pub migration_approved: bool,
    pub admin_who_approved: Address,
}
```

#### 2. Add Storage Keys for Upgrade Tracking

```rust
pub enum DataKey {
    // ... existing keys ...
    ContractVersion,
    UpgradeSafetyCheck,
    ContractStateVersion,
}
```

#### 3. Implement Upgrade Safety Functions

- `validate_upgrade_safety()` - Validates contract state before upgrade
  - Verify all critical singleton keys exist (Admin, Registry, Provenance)
  - Check version consistency
  - Ensure no storage corruption
  - Return checksum/hash of critical state for verification

- `record_upgrade_checkpoint()` - Records upgrade migration point
  - Store version numbers (from/to)
  - Record state hash before migration
  - Mark migration as approved by admin
  - Emit event for on-chain verification

#### 4. Protection Mechanisms

- Validate backward compatibility: Existing certificate/request structures remain queryable
- Protect critical state: Admin address, provider registry, request counter
- Store state snapshots before migrations for rollback capability
- Require admin authorization for all upgrade operations

---

## Issue #796: Add Contract-Level Validation Around Proof Metadata

### Objective
Proof metadata must be validated at the contract layer before verification records are published, ensuring invalid payloads are rejected with debuggable error messages.

### Required Changes

#### 1. Add ProofMetadata Structure (Oracle)

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct ProofMetadata {
    pub payload_hash: BytesN<32>,
    pub provider: Address,
    pub created_at_ledger: u32,
    pub tee_hash: BytesN<32>,
    pub content_hash: Bytes,
    pub signature_algorithm: String,
}
```

#### 2. Add Error Types

```rust
pub enum Error {
    InvalidProofMetadata = 24,  // Missing or malformed proof fields
    // ... existing errors ...
}
```

#### 3. Implement Proof Validation Function

`validate_proof_metadata()` should verify:
- **Payload Non-Empty**: Attestation payload cannot be empty
- **Provider Registered**: Provider public key must be registered in registry
- **TEE Hash Approved**: TEE measurement must be in approved list
- **Content Hash Valid**: Content hash must be reasonable length (32-64 bytes for SHA-256)
- **Signature Algorithm Known**: Must match expected algorithm (Ed25519, etc.)

#### 4. Integration Points

- Call `validate_proof_metadata()` at start of `verify_attestation()`
- Reject invalid proofs before signature verification
- Include validation hash in events for audit trail
- Return detailed error messages for debugging failed validations

---

## Issue #797: Review Contract Permissions for Admin Operations

### Objective
Audit access control for critical admin operations (pause, unpause, revoke, register_provider, etc.) to ensure permissions are explicit, tested, and documented.

### Required Changes

#### 1. Add Admin Audit Logging

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct AdminAuditLogEntry {
    pub log_id: u64,
    pub action_type: String,  // "pause", "unpause", "revoke", "register_provider"
    pub performed_by: Address,
    pub target: Bytes,  // Provider address, request ID, dispute ID, etc.
    pub executed_at_ledger: u32,
    pub transaction_id: Bytes,
}
```

#### 2. Add Admin Permission Check Function

```rust
/// Verify caller is the authorized admin
pub fn require_admin_permission(env: Env, caller: Address) -> Result<(), Error>
```

#### 3. Audit Critical Operations

Add audit logging calls to:
- `pause()` - Requires admin
- `unpause()` - Requires admin  
- `resolve_dispute()` - Requires admin
- `dismiss_dispute()` - Requires admin
- `register_provider()` - Requires admin
- `revoke_certificate()` / similar - Requires admin

#### 4. Documentation

Create permission matrix documenting:
| Operation | Permission Required | Caller | Effect |
|-----------|-------------------|--------|--------|
| pause | admin | Only admin | Prevents new requests |
| resolve_dispute | admin | Only admin | Finalizes dispute outcome |
| register_provider | admin | Only admin | Adds provider to network |

---

## Issue #798: Add Transaction Receipts to Admin Verification Workflows

### Objective
Display transaction receipt details in admin tools so reviewers can examine and track verification actions with on-chain verification IDs.

### Required Changes

#### 1. Add TransactionReceipt Structure

```rust
#[contracttype]
#[derive(Clone, Debug)]
pub struct TransactionReceipt {
    pub receipt_id: u64,
    pub audit_log_id: u64,
    pub entity_id: u64,  // Certificate ID, request ID, dispute ID
    pub result_status: String,  // "success", "failed", "pending"
    pub recorded_at_ledger: u32,
    pub error_message: Option<String>,
    pub resource_used: u128,  // Gas/resources for metering
}
```

#### 2. Add Storage Keys

```rust
pub enum DataKey {
    AdminAuditLog(u64),
    TransactionReceipt(u64),
    NextAuditLogId,
}
```

#### 3. Implement Receipt Functions

- `record_admin_action()` - Create audit log entry
- `create_transaction_receipt()` - Create receipt with result status
- `get_transaction_receipt()` - Retrieve receipt by ID
- `get_audit_log_entry()` - Retrieve audit log entry

#### 4. Receipt Integration

When admin action completes:
1. Record in AdminAuditLogEntry with action details
2. Create TransactionReceipt with:
   - Link to audit log entry
   - Entity being acted upon (certificate, request, dispute ID)
   - Success/failure status
   - Optional error message
   - Ledger height for verification
3. Emit events containing receipt ID for indexing
4. Return receipt ID to caller for tracking

#### 5. Admin UI Integration (Frontend)

Retrieve and display:
- Receipt ID (link to blockchain verification)
- Action type (pause, resolve_dispute, etc.)
- Target entity (provider address, request ID)
- Execution ledger (blocks since action)
- Result status and any error messages
- Admin who performed action

---

## Implementation Order

1. **Issue #795** - Upgrade safety checks (infrastructure for migrations)
2. **Issue #796** - Proof metadata validation (data integrity)
3. **Issue #797** - Admin permission auditing (access control)
4. **Issue #798** - Transaction receipts (admin tool integration)

## Testing Checklist

For each issue, verify:
- [ ] New error types are properly handled in existing code
- [ ] New data structures serialize/deserialize correctly  
- [ ] New functions don't introduce infinite loops or recursion
- [ ] Admin-required operations properly check permissions
- [ ] Audit logs are correctly recorded for all admin actions
- [ ] Receipt data can be retrieved and matches corresponding action
- [ ] Events are emitted with correct data
- [ ] Integration tests cover success and failure paths

## CI/CD Checks

- All contracts compile without warnings
- Existing tests continue to pass
- New code follows project style guide
- No new security vulnerabilities introduced
- Storage migrations are backward compatible
