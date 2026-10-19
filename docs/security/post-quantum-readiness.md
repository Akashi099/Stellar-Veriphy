# Post-Quantum Readiness Assessment for Signature Flows

> **⚠ WARNING: Implementation Pending**
> This document is a design-time assessment. No code changes have been made.
> Closes #682.

This document evaluates StellarVeriphy's current cryptographic posture against emerging
post-quantum (PQ) threats, identifies risk areas, and describes a migration sequencing
strategy. It is written for maintainers and contributors — not end-users — and deliberately
avoids over-claiming certainty in an area where standards are still evolving.

---

## 1. Background and Motivation

Current public-key cryptography — specifically ECDSA, Ed25519, and RSA — is vulnerable to
Shor's algorithm running on a sufficiently powerful quantum computer. A cryptographically
relevant quantum computer (CRQC) does not exist today, but the National Institute of
Standards and Technology (NIST) finalized its first post-quantum cryptography (PQC) standards
in August 2024 (FIPS 203–205), creating a concrete migration target.

For StellarVeriphy, the threat is particularly relevant because:

- **Provenance certificates are permanent.** An attacker who records encrypted or signed
  data today and decrypts it after a CRQC becomes available ("harvest now, decrypt later")
  could potentially forge certificates retroactively.
- **On-chain data cannot be modified.** If the signing scheme underlying a certificate is
  broken, the certificate cannot be silently updated. Any migration requires minting new
  certificates under a new scheme.
- **Stellar and Soroban do not yet support PQC natively.** This is the binding constraint
  for the on-chain verification path.

---

## 2. Current Cryptographic Inventory

| Component                                            | Algorithm in use                            | Purpose                                            | PQ-vulnerable?                                                                                  |
| ---------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Stellar wallet signing (user keys)                   | Ed25519                                     | User authenticates oracle requests                 | Yes                                                                                             |
| TEE oracle attestation signing                       | Ed25519 (Nitro Enclave internal)            | Enclave signs verification result                  | Yes                                                                                             |
| On-chain signature verification (`contracts/oracle`) | Ed25519 via `env.crypto().ed25519_verify()` | Contract verifies oracle attestation               | Yes                                                                                             |
| Content hash commitment                              | SHA-256                                     | Binds content to certificate                       | Partially (Grover's algo halves effective security; SHA-256 → ~128-bit PQ security, acceptable) |
| Manifest hash commitment                             | SHA-256                                     | Binds manifest to certificate                      | As above                                                                                        |
| Attestation COSE signing (Nitro, PCR verification)   | ECDSA/ES384 (P-384)                         | AWS Nitro certificate chain                        | Yes                                                                                             |
| KMS content encryption                               | AES-256-GCM                                 | Encrypts content files (see `kms-architecture.md`) | No — AES-256 is PQ-safe with Grover (256/2 = 128-bit effective)                                 |
| Wrapped CEK                                          | AES-256-KW                                  | Key wrapping                                       | No — same analysis as above                                                                     |
| Application API key hashing                          | SHA-256                                     | Hash stored in `localStorage`                      | As above for hashing                                                                            |
| TLS (transport)                                      | Dependent on deployment (typically ECDHE)   | Frontend ↔ API, API ↔ Stellar RPC                  | Yes — ECDHE key exchange is vulnerable                                                          |

**Summary:** The cryptographic core that actually matters for certificate integrity — Ed25519
signatures on Stellar and in the TEE attestation flow — is PQ-vulnerable. Symmetric
algorithms (AES-256-GCM, SHA-256) are PQ-adequate at current key/digest sizes.

---

## 3. Risk Assessment

### 3.1 High Risk: On-Chain Ed25519 Signatures

**Risk:** An adversary with a CRQC could forge an oracle attestation signature, causing
`contracts/oracle.verify_attestation` to accept a fabricated verification result. This would
allow minting fraudulent provenance certificates.

**Current mitigations:** None PQ-specific. The registry's approved TEE code hash list adds a
second trust layer, but the registry itself relies on the same Ed25519-based auth model.

**Timeline concern:** Certificates minted today will remain on-chain indefinitely. If a
CRQC arrives in 10–20 years, historical certificates signed with Ed25519 would be
retroactively forgeable. This is the "harvest now, attack later" threat applied to
provenance claims.

### 3.2 High Risk: AWS Nitro Attestation Certificate Chain (ECDSA/P-384)

**Risk:** The Nitro attestation chain uses P-384. If this chain is compromised, PCR
validation in `frontend/services/teeAttestationService.ts` would accept attestations from
unauthorized enclaves.

**Mitigating factor:** AWS controls the root CA rotation. StellarVeriphy must track AWS's
PQC migration timeline and update the pinned root certificate when AWS migrates.

### 3.3 Medium Risk: Ed25519 User Wallet Keys (Freighter)

**Risk:** User wallet keys are Ed25519. A CRQC could derive private keys from public keys,
enabling an adversary to impersonate a creator and authorize fraudulent verification requests.

**Mitigating factor:** Freighter and Stellar core would need to migrate first; StellarVeriphy
would follow. This is a platform-level dependency, not something this project can solve
unilaterally.

### 3.4 Low Risk: SHA-256 Hash Commitments

**Risk:** Grover's algorithm reduces SHA-256's collision resistance to ~128 bits effective.
This is still considered secure for current threat models.

**Action required:** None at this time. Monitor NIST guidance. If standards move to SHA-3
or SHA-512, update the hashing utilities in `packages/shared/utils/hash.ts` and
`frontend/utils/hashing.ts`.

### 3.5 Low Risk: TLS

**Risk:** ECDHE key exchange in TLS is vulnerable. However, TLS secures data in transit
only — it does not affect the integrity of on-chain records. Modern TLS stacks (OpenSSL
3.2+, BoringSSL) are already beginning to deploy hybrid PQC key exchange (X25519Kyber768).

**Action required:** Ensure the deployment environment (load balancer, CDN, web server)
uses an up-to-date TLS stack. No application-level changes required.

---

## 4. NIST PQC Standards Reference

The following NIST standards (finalized August 2024) are the migration target:

| Standard | Algorithm          | Type                           | Notes                                                              |
| -------- | ------------------ | ------------------------------ | ------------------------------------------------------------------ |
| FIPS 203 | ML-KEM (Kyber)     | Key encapsulation (KEM)        | Replaces ECDH/RSA for key exchange                                 |
| FIPS 204 | ML-DSA (Dilithium) | Digital signature              | Primary candidate to replace Ed25519                               |
| FIPS 205 | SLH-DSA (SPHINCS+) | Digital signature (hash-based) | Stateless hash-based; larger signatures but no lattice assumptions |

For StellarVeriphy's signature flows, **ML-DSA (FIPS 204)** is the primary migration target.
SLH-DSA is a fallback if concerns arise about lattice-based assumptions.

---

## 5. Migration Sequencing

Migration cannot happen in a single step because it depends on upstream platform support.
The recommended sequence:

### Stage 0 — Monitor and Prepare (Now → Stellar/Soroban adds PQC support)

1. Track NIST PQC adoption in Stellar core and Soroban SDK. The Stellar Development
   Foundation (SDF) will need to implement PQC signing at the account/signature level before
   on-chain verification of PQ signatures is possible.
2. Track AWS Nitro Enclave's roadmap for PQC attestation signing.
3. Add a feature flag (`pqc_mode`) to `frontend/lib/feature-flags/config.ts` so that PQC
   paths can be gated and tested before activation without shipping dead code unconditionally.
4. Document the certificate schema version that will be used for PQC certificates
   (`schemaVersion` field in `ContentManifest` — already present in
   `packages/shared/types/index.ts`). Reserve version `3.0.0` for PQC-signed certificates.

### Stage 1 — Off-Chain Hybrid Signatures (Available when: TEE SDK supports ML-DSA)

1. Update the Nitro Enclave image to sign attestations with a hybrid Ed25519 + ML-DSA
   signature (both algorithms sign the same payload). This allows the on-chain contract to
   continue verifying Ed25519 while off-chain consumers can additionally verify ML-DSA.
2. Update `frontend/services/teeAttestationService.ts` to extract and log the ML-DSA
   signature field, even if it is not yet verified on-chain.
3. Store the ML-DSA signature in the attestation document retained off-chain, so future
   on-chain verifiers can back-verify historical attestations once the contract is upgraded.

### Stage 2 — On-Chain PQC Verification (Available when: Soroban SDK supports PQC)

1. Update `contracts/oracle.verify_attestation` to accept and verify ML-DSA signatures via
   the Soroban crypto API (when available).
2. Update `contracts/registry` to store the ML-DSA public key alongside the Ed25519 key for
   each approved oracle provider.
3. Set a deprecation date for Ed25519-only attestations. New certificates after this date
   require a PQC signature to be minted.

### Stage 3 — Full PQC and Historical Certificate Review (Available when: Stage 2 complete)

1. Disable Ed25519-only attestation acceptance in `contracts/oracle`.
2. For historically minted certificates (pre-Stage 2), issue supplemental on-chain records
   affirming that the original certificate was valid at the time of issuance and the
   Ed25519 signing key has not been compromised to date. (This is a best-effort provenance
   extension, not a certificate replacement.)
3. Communicate the migration status to certificate holders.

---

## 6. Operational Readiness Checklist

The following items are not yet implemented and should be addressed during Stage 0:

- [ ] Create `pqc_mode` feature flag in `frontend/lib/feature-flags/config.ts`
- [ ] Reserve `schemaVersion: "3.0.0"` for PQC certificates in schema documentation
      (`docs/manifest-schema/README.md`)
- [ ] Add ML-DSA signature field to `AttestationEvidence` type in
      `packages/shared/types/index.ts` (as optional, so it does not break existing flows)
- [ ] Subscribe to SDF developer newsletter and AWS Nitro PQC announcements
- [ ] Add a recurring review item (suggested: annual) to reassess CRQC timeline estimates
      and upgrade the risk classification in this document if the timeline shortens materially
- [ ] Confirm AES-256 key sizes in `kms-architecture.md` (AES-256 is PQ-safe; no action
      required, but confirming reduces future ambiguity)
- [ ] Verify TLS deployment uses a stack that supports hybrid PQC key exchange

---

## 7. What This Document Does Not Claim

- It does not claim a CRQC will arrive on any specific timeline. Current NIST guidance
  targets "crypto-agile" preparedness, not imminent threat response.
- It does not claim ML-DSA or SLH-DSA are free of all vulnerabilities. Post-quantum
  algorithms are newer and have had less real-world scrutiny than Ed25519.
- It does not claim full quantum-safety is achievable for historical on-chain data — it
  is not. Once something is on a public blockchain, the risk window for future quantum
  attacks cannot be closed retroactively.
- It does not prescribe a specific migration date. That depends on upstream Stellar and AWS
  timelines, not StellarVeriphy's roadmap alone.

---

## 8. Related Documents and References

- [`docs/security/key-management.md`](../security/key-management.md) — current key inventory
- [`docs/security/kms-architecture.md`](../security/kms-architecture.md) — encryption key details
- [`docs/security/tee-attestation-service.md`](../security/tee-attestation-service.md) — attestation verification details
- [`docs/adr/0004-tee-oracle-trust-model.md`](../adr/0004-tee-oracle-trust-model.md) — TEE trust model
- [`contracts/oracle/src/lib.rs`](../../contracts/oracle/src/lib.rs) — `verify_attestation()`
- [`frontend/services/teeAttestationService.ts`](../../frontend/services/teeAttestationService.ts) — off-chain attestation validation
- [`packages/shared/types/index.ts`](../../packages/shared/types/index.ts) — `AttestationEvidence`, `ContentManifest`
- [NIST FIPS 203/204/205](https://csrc.nist.gov/publications/fips) — Post-quantum standards
- [Stellar Developer Documentation](https://developers.stellar.org) — Soroban SDK cryptography
