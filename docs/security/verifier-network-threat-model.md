# Verifier Network Threat Model and Security Review

> **⚠ WARNING: Implementation Pending**
> This document is a design-time security review. It identifies risks and suggests
> mitigations; not all mitigations are implemented.
> Closes #680.

This document performs a formal security review of the StellarVeriphy verifier network,
covering all participant roles, trust boundaries, attack surfaces, and identified risks.
Concrete remediation items are linked to engineering follow-up where applicable.

---

## 1. System Participants and Roles

| Actor                                | Role                                                                                     | Trust Level                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Creator**                          | Submits content + manifest for verification; owns the resulting certificate              | Semi-trusted (authenticated via Stellar key)                              |
| **Oracle Provider**                  | Runs the off-chain verification worker; submits attestation to `contracts/oracle`        | Semi-trusted (key must be registered in `contracts/registry`)             |
| **TEE Enclave**                      | Runs the actual verification logic inside AWS Nitro Enclave; signs the attestation       | Trusted-by-hardware (trust is in AWS Nitro + code hash, not the operator) |
| **`contracts/oracle`**               | Receives verification requests; routes to oracle; accepts attestations; triggers minting | Trusted (on-chain, immutable)                                             |
| **`contracts/provenance`**           | Mints, transfers, and revokes provenance certificates                                    | Trusted (on-chain, immutable)                                             |
| **`contracts/registry`**             | Maintains approved TEE code hashes and registered oracle providers                       | Trusted (on-chain), but admin access is a known gap (see §3.1)            |
| **Contract Admin**                   | Can approve/revoke TEE code hashes and oracle providers in `contracts/registry`          | Fully trusted (see known gap)                                             |
| **Verifier (Third Party)**           | Reads on-chain certificates; checks off-chain evidence                                   | Untrusted reader — no write access                                        |
| **End User (public)**                | Uses the frontend to browse, search, verify certificates                                 | Untrusted                                                                 |
| **StellarVeriphy Platform Operator** | Runs infrastructure (API, storage, oracle workers)                                       | Trusted (operational trust, not cryptographic)                            |

---

## 2. Trust Boundaries

```
 ┌───────────────────────────────────────────────────────┐
 │ PUBLIC INTERNET                                       │
 │  Creator, End User, Third-Party Verifier              │
 └──────────────────────┬────────────────────────────────┘
                        │ HTTPS (TLS)
 ┌──────────────────────▼────────────────────────────────┐
 │ PLATFORM (Operator-controlled)                        │
 │  Next.js frontend + API  │  Oracle Worker             │
 │  Storage (IPFS/MongoDB)  │  Job Queue                 │
 └──────────────────────┬───────────────┬────────────────┘
                        │               │
         Stellar RPC    │               │ AWS Nitro SDK
 ┌────────────────────  │               │  ──────────────┐
 │ STELLAR LEDGER       │               │ AWS NITRO      │
 │  contracts/oracle    ◄───────────────┤ ENCLAVE        │
 │  contracts/provenance│               │                │
 │  contracts/registry  │               └────────────────┘
 └──────────────────────┘
```

**Key boundary:** The trust boundary between the platform (operator-controlled) and the
on-chain layer is the critical one. Actions on-chain require valid Stellar key authorization
and, for attestation acceptance, a valid TEE attestation. The platform cannot forge either.

---

## 3. Identified Threats and Mitigations

### 3.1 Registry Admin Bypass (Critical / Known Gap)

**Threat:** `contracts/registry.register()` currently checks only that the **caller** signed
the transaction (`admin.require_auth()`). Any Stellar account can register itself as an
oracle provider or approve any TEE code hash. There is no fixed admin set.

**Impact:** A malicious actor could register their own (unapproved) oracle provider and a
fraudulent TEE code hash, then submit fabricated attestations that the on-chain contracts
would accept as legitimate.

**Current status:** Known gap, explicitly documented in `docs/security/key-management.md`
and `docs/adr/0004-tee-oracle-trust-model.md`. Not safe for production.

**Remediation (required before mainnet):**

- Store a fixed admin address at contract initialization time in `contracts/registry`.
- Add an `admin: Address` field to the contract's instance storage, set once in `init()`.
- Change `register()` to `admin.require_auth()` against this stored admin address, not
  the caller's own address.
- Track as a blocking issue before any mainnet deployment.

### 3.2 Forged Attestation Submission (High)

**Threat:** An oracle provider submits a fabricated attestation (not produced by an approved
Nitro enclave) to `contracts/oracle.verify_attestation()`.

**Attack vectors:**

- Constructing a fake attestation document with an arbitrary payload.
- Replaying a previous legitimate attestation against a different content record.

**Current mitigations:**

- `contracts/oracle` verifies the Ed25519 signature on the attestation payload using the
  provider's registered public key.
- The `contracts/registry.is_tee_hash_approved()` cross-contract call checks that the
  enclave's PCR0 (code hash) is in the approved list.
- The attestation payload contains `request_id`, `content_hash`, and `manifest_hash` bound
  together — a replayed attestation for a different request_id would fail the binding check.
- `frontend/services/teeAttestationService.ts` performs an off-chain pre-check (timestamp
  within ±5 minutes, payload binding) before submitting on-chain.

**Residual risk:** If the registry admin gap (§3.1) is not closed, an attacker who registers
their own TEE hash can generate signatures that pass the on-chain check. See §3.1.

**Remediation:** Close §3.1. Additionally, implement replay protection by tracking used
`request_id` values on-chain and rejecting duplicate submissions.

### 3.3 Oracle Provider Key Compromise (High)

**Threat:** The private signing key used by an oracle provider to sign attestations is
stolen. An attacker uses it to sign forged attestation payloads.

**Impact:** Can mint fraudulent certificates for any content, bypassing verification, until
the provider is blacklisted.

**Current mitigations:**

- Provider keys are registered on-chain; the registry can blacklist a provider
  (`contracts/registry` supports revocation).
- The TEE attestation adds a second check (code hash must also be approved), so a
  compromised provider key alone is not sufficient if the registry admin gap is closed.

**Residual risk:** The window between key compromise and blacklisting is an exposure window.

**Remediation:**

- Implement key rotation for oracle providers (`contracts/registry.rotate_provider_key()`).
- Monitor for anomalous attestation volumes from a single provider as a compromise signal.
- Require a time-lock or multisig for provider key registration to prevent rapid fraudulent
  re-registration after blacklisting.

### 3.4 Malicious Manifest Submission (High)

**Threat:** A creator submits a manifest that claims a different content hash than the actual
uploaded file, or injects malicious data into metadata fields.

**Impact:**

- If the TEE verifies the wrong content, the certificate is fraudulent.
- If metadata injection reaches downstream consumers, it may cause XSS or data corruption.

**Current mitigations:**

- The TEE re-computes the content hash inside the enclave (hardware-isolated) and compares it
  to the manifest's `contentHash`. A mismatch causes `verification_result: "failed"`.
- `validateManifest()` strips control characters from metadata values.
- The on-chain certificate stores the `manifest_hash` (not the manifest contents), binding
  the certificate to the specific manifest that was verified.

**Residual risk:** Unicode normalization attacks and homoglyph spoofing in metadata fields
(see `docs/security/manifest-validation-model.md` §4.4).

**Remediation:** Apply `NFC` Unicode normalization in `validateManifest()`. See
`docs/security/manifest-validation-model.md` for the complete gap list.

### 3.5 Storage Layer Tampering (Medium)

**Threat:** An attacker with write access to MongoDB or the IPFS pinning service modifies
a stored manifest or content file after the provenance certificate has been minted.

**Impact:** The on-chain certificate still references the original `manifest_hash`. A
tampered manifest would hash to a different value, so tampering is detectable by anyone
who re-hashes the retrieved manifest and compares to the on-chain certificate.

**Current mitigations:**

- The on-chain certificate contains `manifest_hash` and `attestation_hash` as integrity
  anchors. Tampering is detectable by any verifier.
- IPFS content is content-addressed — the CID is the hash of the content. Modifying content
  on IPFS produces a different CID, breaking the `storage_ref` reference.

**Residual risk:** MongoDB records are not content-addressed. A MongoDB-level attacker can
modify a manifest without detection unless the verifier explicitly re-hashes and compares
to the on-chain hash. The platform should display a hash verification result in the UI.

**Remediation:**

- The certificate verification flow in the frontend should always re-hash the retrieved
  manifest and display a match/mismatch result against the on-chain `manifest_hash`.
- Consider migrating all manifests to IPFS (content-addressed) to eliminate the MongoDB
  integrity gap.

### 3.6 Sybil Oracle Provider Attack (Medium)

**Threat:** An attacker registers many oracle provider accounts to gain disproportionate
influence over the verification network (relevant if future governance adds voting or
reputation-weighted routing).

**Current mitigations:**

- Provider registration is currently controlled by a single admin (once §3.1 is closed).
  No open registration exists.
- The `contracts/registry` implementation includes a provider reputation scoring system
  (`provider_trust.ts` in `packages/shared/scoring/`).

**Residual risk:** Low in the current centralized admin model; increases significantly if
governance is decentralized in later phases.

**Remediation:** Document this risk in governance design documents when Phase 5
(governance and staking) is planned.

### 3.7 Cross-Contract Call Manipulation (Medium)

**Threat:** The oracle contract makes cross-contract calls to the registry
(`is_tee_hash_approved`, `is_provider`) and provenance (`mint`). An attacker could attempt
to deploy a malicious contract at the address the oracle points to (if the registry address
is not fixed at deploy time), or exploit logic reentrancy if the oracle contract's state is
inconsistent between a cross-call and its return.

**Current mitigations:**

- Contract addresses are set at initialization time, not passed as call arguments.
- Soroban's execution model does not expose classic EVM-style reentrancy (no raw call
  value forwarding), but logic reentrancy (state inconsistency between calls) is still
  possible.

**Remediation:**

- Audit `contracts/oracle/src/lib.rs` for state transitions that occur around
  cross-contract calls. Ensure request status is updated to a terminal or in-progress
  state before any cross-contract call that could be made repeatedly.
- Track as part of the smart contract audit runbook (`docs/security/smart-contract-audit-runbook.md`).

### 3.8 Denial of Service via Request Flooding (Low)

**Threat:** An attacker submits a very large number of verification requests to exhaust
oracle worker capacity, storage, or Stellar sequence number availability.

**Current mitigations:**

- `frontend/lib/security/rateLimiter.ts` provides application-level rate limiting.
- The oracle contract accepts a stake/fee for request submission (staking mechanism in
  `contracts/oracle`), raising the economic cost of flooding.

**Residual risk:** The rate limiter is client-side and easily circumvented via direct API
calls. A server-side enforced rate limit at the API layer is needed.

**Remediation:** Implement server-side rate limiting at `app/api/uploads/route.ts` and
other write endpoints using an in-memory or Redis-backed counter.

### 3.9 Certificate Ownership Spoofing (Low)

**Threat:** An attacker attempts to claim ownership of a certificate they did not create by
submitting a request that references the same `content_hash` as an existing certificate.

**Current mitigations:**

- The oracle contract requires the `creator` field to match the signing Stellar account
  (`creator.require_auth()` in the oracle request submission flow).
- The provenance contract binds `creator` at mint time; it is immutable on the certificate.

**Residual risk:** A creator can submit multiple requests for the same content, producing
multiple certificates. The platform should document whether duplicate certificates are
valid or an error.

**Remediation:** Consider adding a duplicate-check in `contracts/oracle` that rejects a
new request if an active or certified certificate already exists for the same
`manifest_hash`. This is a policy decision as well as a security one.

---

## 4. Internal Actor Threats

### 4.1 Rogue Operator

**Threat:** A StellarVeriphy platform operator with access to the oracle worker and storage
layer attempts to route content to a compromised verification worker or modify stored
manifests to produce fraudulent attestations.

**Why this is bounded:**

- Fraudulent attestations require a registered TEE code hash in `contracts/registry`.
  The operator cannot forge a valid PCR0 for an unauthorized enclave image without either
  compromising AWS Nitro (infeasible) or registering a fraudulent code hash (possible
  until §3.1 is closed).
- Modified manifests are detectable by hash comparison (see §3.5).

**Residual risk:** Until §3.1 (registry admin gap) is closed, a rogue operator who also
controls the registry admin key can register a fraudulent TEE code hash. This is the
single most critical risk in the current codebase.

### 4.2 Compromised CI/CD Pipeline

**Threat:** An attacker gains access to the GitHub Actions secrets or deployment pipeline
and deploys a backdoored version of the oracle worker or frontend.

**Current mitigations:**

- Production deploys require manual approval via GitHub Environment protection.
- GHCR image signing (when configured) allows verifying the deployed image matches the
  built artifact.

**Remediation:** Ensure GitHub Environment protection (required reviewers) is configured
and enforced for all production deployments. See
`docs/deployment/ci-cd-pipeline.md`.

---

## 5. Remediation Tracking

The following items require engineering follow-up:

| Issue                                                    | Severity     | Required Before | Notes                                             |
| -------------------------------------------------------- | ------------ | --------------- | ------------------------------------------------- |
| Close registry admin gap (§3.1)                          | **Critical** | Mainnet         | Tracked in `docs/security/key-management.md`      |
| Server-side rate limiting on write endpoints (§3.8)      | High         | Production      | New engineering item                              |
| Replay protection in `contracts/oracle` (§3.2)           | High         | Mainnet         | Smart contract audit item                         |
| Unicode NFC normalization in `validateManifest` (§3.4)   | Medium       | Next release    | `docs/security/manifest-validation-model.md` §4.4 |
| Manifest hash UI verification in certificate view (§3.5) | Medium       | Next release    | UI engineering item                               |
| Oracle contract state audit for TOCTOU (§3.7)            | Medium       | Mainnet         | Smart contract audit runbook                      |
| Provider key rotation support (§3.3)                     | Medium       | Mainnet         | Contract enhancement                              |

---

## 6. Out-of-Scope Items

The following threats are real but are outside StellarVeriphy's direct control:

- **Stellar ledger-level attacks** (attacks on Stellar Consensus Protocol) — out of scope;
  Stellar's SCP provides Byzantine fault tolerance.
- **AWS Nitro root CA compromise** — would require breaking AWS's internal PKI; accepted
  as a hardware/cloud provider risk.
- **CRQC attacks on Ed25519** — addressed separately in
  [`docs/security/post-quantum-readiness.md`](./post-quantum-readiness.md).
- **Freighter wallet vulnerabilities** — third-party component; report to the Freighter
  team directly.

---

## 7. Related Documents

- [`SECURITY.md`](../../SECURITY.md) — vulnerability disclosure policy
- [`docs/security/key-management.md`](./key-management.md) — key inventory and access control
- [`docs/security/kms-architecture.md`](./kms-architecture.md) — artifact encryption
- [`docs/security/tee-attestation-service.md`](./tee-attestation-service.md) — attestation validation
- [`docs/security/manifest-validation-model.md`](./manifest-validation-model.md) — manifest validation
- [`docs/security/smart-contract-audit-runbook.md`](./smart-contract-audit-runbook.md) — contract audit process
- [`docs/security/post-quantum-readiness.md`](./post-quantum-readiness.md) — PQC assessment
- [`docs/adr/0004-tee-oracle-trust-model.md`](../adr/0004-tee-oracle-trust-model.md) — TEE trust model decision
- [`contracts/oracle/src/lib.rs`](../../contracts/oracle/src/lib.rs) — oracle contract
- [`contracts/registry/src/lib.rs`](../../contracts/registry/src/lib.rs) — registry contract
- [`contracts/provenance/src/lib.rs`](../../contracts/provenance/src/lib.rs) — provenance contract
