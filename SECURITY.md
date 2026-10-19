# Security Policy

This document describes StellarVeriphy's vulnerability disclosure process, security scope, known risk areas, and how we handle security reports. For implementation-level security controls (rate limiting, input validation, key management, HTTP headers, smart contract audit procedures), see the detailed guides in [`docs/security/`](./docs/security/).

---

## Table of Contents

1. [Reporting a Vulnerability](#1-reporting-a-vulnerability)
2. [Response Timeline](#2-response-timeline)
3. [Scope](#3-scope)
4. [Out of Scope](#4-out-of-scope)
5. [Smart Contract Security Model](#5-smart-contract-security-model)
6. [TEE and Oracle Trust Model](#6-tee-and-oracle-trust-model)
7. [Known Risks and Accepted Limitations](#7-known-risks-and-accepted-limitations)
8. [Security Controls Summary](#8-security-controls-summary)
9. [Dependency Security](#9-dependency-security)
10. [Responsible Disclosure Policy](#10-responsible-disclosure-policy)
11. [Security Documentation Index](#11-security-documentation-index)

---

## 1. Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.** Public disclosure before a fix is available puts users at risk.

### How to report

Send your report to the maintainers via one of these channels:

- **GitHub private security advisory** (preferred): [Security Advisories](https://github.com/Stellar-Veriphy/Stellar-Veriphy/security/advisories/new)
- **Email**: security@stellarveriphy.com

### What to include

A useful report includes:

- A clear description of the vulnerability and the affected component (`oracle`, `provenance`, `registry`, frontend, shared package).
- The potential impact: what an attacker could accomplish by exploiting it.
- Step-by-step reproduction instructions, including any prerequisite state (e.g., a deployed contract, a funded wallet address).
- Any proof-of-concept code or scripts — these are welcome and speed up triage.
- The commit hash or version where you confirmed the issue.
- Your preferred contact method for follow-up questions.

Partial reports are still useful — if you are unsure of the full impact, report what you know and we will investigate together.

---

## 2. Response Timeline

| Milestone | Target |
|---|---|
| Acknowledgement | Within 48 hours of receipt |
| Initial triage (severity classification) | Within 5 business days |
| Fix timeline communicated | Within 10 business days for Critical/High; 30 days for Medium/Low |
| Patch released (Critical/High) | Within 30 days where technically feasible |
| Public disclosure | Coordinated with reporter; default 90 days from initial report |

For vulnerabilities in deployed smart contracts on mainnet, timelines may need to compress significantly due to the immutable nature of on-chain code. We will communicate urgency to the reporter as soon as we assess the severity.

---

## 3. Scope

The following are in scope for security reports:

### Smart Contracts
- `contracts/oracle/src/lib.rs` — verification request orchestration, staking, SLA enforcement, disputes, attestation verification
- `contracts/provenance/src/lib.rs` — provenance certificate minting, transfer, revocation, locking, and lifecycle management
- `contracts/registry/src/lib.rs` — TEE code hash registry, provider management, multisig governance, reputation, blacklist

Particularly relevant contract security areas:
- Authentication and authorization bypasses (`require_auth` / admin checks)
- Integer overflow or underflow in staking, stake slashing, or fee calculations
- Logic errors in the SLA suspension threshold or dispute resolution
- Cross-contract call manipulation (Oracle ↔ Registry ↔ Provenance)
- TEE hash expiry or rotation bypass
- Reentrancy or state corruption patterns

### Frontend and API
- `frontend/app/api/` — all Next.js API routes, especially the verification endpoint
- Input validation and sanitization logic (`frontend/lib/security/inputValidation.ts`)
- Rate limiting logic and bypass (`frontend/app/api/verification/route.ts`)
- Wallet interaction and transaction signing (`frontend/context/WalletContext.tsx`)
- API key management and storage (`frontend/components/APIKeyManagement.tsx`)
- Content Security Policy configuration (`frontend/next.config.ts`)
- Audit log tamper resistance (`frontend/lib/security/auditLogger.ts`)

### Shared Package
- `packages/shared/utils/hash.ts` — hash computation correctness and collision resistance

### Deployment and Infrastructure
- `deploy.sh` and `scripts/deploy/blue-green-deploy.sh` — command injection, unsafe environment variable handling
- `Dockerfile` and `docker-compose.yml` — privilege escalation, secret leakage, insecure defaults
- GitHub Actions workflows (`.github/workflows/`) — secret exposure, workflow injection

---

## 4. Out of Scope

The following are not eligible for security reports:

- Vulnerabilities in third-party dependencies where no proof of exploitability in StellarVeriphy's specific context exists. Report those to the upstream maintainer.
- Bugs in the Stellar network or Soroban runtime itself — report those to the [Stellar Development Foundation](https://stellar.org/vulnerability-disclosure-policy).
- Social engineering attacks targeting StellarVeriphy contributors.
- Physical attacks against infrastructure.
- Denial-of-service attacks that require flooding the network with legitimate but excessive requests at significant cost to the attacker.
- Issues that require a compromised end-user device or browser.
- Missing security headers on pages the CSP already covers (see [`docs/security/security-headers.md`](./docs/security/security-headers.md) for the current header set).
- Self-XSS attacks that require a user to execute code in their own browser console.

---

## 5. Smart Contract Security Model

StellarVeriphy's Soroban contracts follow a layered security model. Understanding this model helps contextualize the risk surface.

### Authentication and authorization

Every privileged operation requires explicit authorization:

- **Admin-gated functions** (adding providers, registering TEE hashes, pausing the oracle, slashing stakes, resolving disputes) require the stored `Admin` address to call `require_auth()` before any state mutation occurs.
- **Owner-gated functions** (withdrawing stake, canceling a verification request, transferring a certificate) require the calling address to match the recorded owner and call `require_auth()`.
- **Oracle-gated functions** (minting a provenance certificate, revoking a certificate, setting verification level) require the Provenance contract's stored oracle address to authenticate.

There is no role-based access control library — all access control is implemented inline with explicit address comparisons against state stored at initialization time.

### Initialization guard

All three contracts check for prior initialization at the start of their `init` / `initialize` entrypoints and return an error (`AlreadyInitialized` / `panic!("Already initialized")`) if called again. A contract that is not yet initialized returns `NotInitialized` errors rather than operating with an empty-state default that could be exploited.

### Error enum stability

Error discriminants are explicitly numbered starting from 1 and must not be renumbered between deployments. Renumbering would cause off-chain clients to misinterpret error codes from existing contract instances.

### Storage and TTL

Verification requests are stored in *temporary* storage with a TTL (default 100 ledgers, configurable by admin). This means unprocessed requests expire automatically — they do not accumulate indefinitely and cannot be used to inflate state size without cost.

Long-lived records (certificates, provider registrations, stakes) use *persistent* storage. There is no automatic expiration for these by design — a provider's stake or a provenance certificate is intended to persist indefinitely unless explicitly acted upon.

### Arithmetic safety

Staking and fee calculations use Rust's `saturating_add` and `saturating_sub` to prevent integer overflow and underflow. All token amounts are represented as `u128` to accommodate the full range of Stellar Lumens in stroops.

### Multisig governance (Registry)

The Registry contract supports a multisig approval mechanism for adding providers and TEE hashes. The threshold (minimum approvals required) is configurable by the admin. For mainnet deployments, the threshold should be set above 1 to prevent a single compromised admin key from approving malicious providers or TEE code hashes without co-signers.

### Known gap: admin address check in Registry

The Registry contract's `add_tee_hash` function currently has a code path where the admin check is performed inline rather than through the centralized `require_admin()` helper. This is a tracked issue. Until resolved, the admin address should be treated as a high-value secret on any deployment where Registry outputs are trusted for real verification decisions.

---

## 6. TEE and Oracle Trust Model

The attestation verification flow relies on the following trust chain:

```
AWS Nitro Enclave (generates attestation signature)
        │
        │  provider public key registered in Registry contract
        ▼
Oracle contract (verifies ed25519 signature + TEE code hash)
        │
        │  cross-calls Registry.is_tee_hash_approved()
        │  cross-calls Registry.is_provider()
        ▼
Provenance contract (mints certificate if verification passes)
```

Key trust properties:

- **TEE keys never leave the enclave.** The attestation key pair is generated inside the AWS Nitro Enclave at boot and is not exportable. Only signed attestation documents exit the enclave boundary.
- **On-chain code hash pinning.** The Registry contract stores a SHA-256 hash of the approved enclave image. An attestation from an enclave running a different (unapproved or modified) image will be rejected by `is_tee_hash_approved()`.
- **TEE hash expiry.** Approved TEE code hashes carry a 180-day validity window. Hashes nearing expiry emit a warning (14-day window). Hashes must be rotated before expiry or verifications will start failing.
- **Provider authorization.** Only providers explicitly added by an admin to the Registry can submit valid attestations. Adding a provider requires admin authority (and multisig approval when the threshold is > 1).

A full description of this trust model is in [`docs/adr/0004-tee-oracle-trust-model.md`](./docs/adr/0004-tee-oracle-trust-model.md).

---

## 7. Known Risks and Accepted Limitations

The following are documented, tracked risks that have been deliberately accepted or are pending remediation:

| Risk | Area | Status |
|---|---|---|
| Registry admin check inconsistency in `add_tee_hash` | `contracts/registry` | Tracked — pending fix before mainnet |
| Client-side-only API key management (no server verification) | Frontend | Accepted for current stage; server-side validation required before production API launch |
| In-memory rate limiter resets on process restart | Frontend API | Accepted for current stage; persistent rate limiting store required for multi-instance production |
| Three contracts use different `soroban-sdk` versions (21.0.0, 21.7.7, 23.0.0) | Contracts | Tracked — should be unified to reduce ABI risk |
| Duplicate constant and function definitions in `oracle/src/lib.rs` | `contracts/oracle` | Tracked — code quality issue that may cause compilation errors; requires deduplication |
| No upgrade path for deployed contracts | All contracts | By design for Soroban — bugs require deploying a new instance and migrating consumers |
| Stellar deployer key not hardware-backed on testnet | Deployment | Acceptable for testnet; mainnet deployments must use a hardware wallet or HSM |

---

## 8. Security Controls Summary

| Control | Location |
|---|---|
| HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) | `frontend/next.config.ts` — documented in [`docs/security/security-headers.md`](./docs/security/security-headers.md) |
| Input validation and sanitization | `frontend/lib/security/inputValidation.ts` |
| Per-address rate limiting with progressive backoff | `frontend/app/api/verification/route.ts` — documented in [`docs/security/verification-service-security.md`](./docs/security/verification-service-security.md) |
| CSP violation reporting | `frontend/app/api/csp-report/route.ts` |
| Hash-chained tamper-evident audit log | `frontend/lib/security/auditLogger.ts` |
| API key hash-only storage (no plaintext persistence) | `frontend/components/APIKeyManagement.tsx` |
| ed25519 attestation signature verification | `contracts/oracle/src/lib.rs` — `verify_attestation()` |
| TEE code hash expiry and rotation | `contracts/registry/src/lib.rs` — `is_tee_hash_approved()`, `rotate_tee_hash()` |
| Provider reputation tracking and auto-suspension | `contracts/oracle/src/lib.rs` — SLA enforcement, `SLA_SUSPENSION_THRESHOLD = 70%` |
| Provider blacklist | `contracts/registry/src/lib.rs` — `blacklist_provider()`, `is_provider_authorized()` |
| Stake slashing for malicious providers | `contracts/oracle/src/lib.rs` — `slash_stake()` |
| Circuit breaker (pause/unpause) | `contracts/oracle/src/lib.rs` — `pause()` / `unpause()` |
| Multisig governance for admin operations | `contracts/registry/src/lib.rs` — `propose_operation()`, `approve_proposal()`, `execute_proposal()` |
| Non-root container user | `Dockerfile` — `appuser` |
| Production-only dependency install | `Dockerfile` — `pnpm install --prod` in runtime stage |
| Cryptographic key management | Documented in [`docs/security/key-management.md`](./docs/security/key-management.md) |
| Smart contract audit process | Documented in [`docs/security/smart-contract-audit-runbook.md`](./docs/security/smart-contract-audit-runbook.md) |

---

## 9. Dependency Security

### Rust contracts

All three contracts are `#![no_std]` with minimal, pinned dependencies:
- `soroban-sdk` (versions 21.0.0–23.0.0 across the three contracts) — the only runtime dependency
- `ed25519-dalek = "2.1.1"` — oracle contract dev dependency (test signature generation only, not in the deployed WASM)

Pin exact versions in `Cargo.lock` and do not accept open ranges for contract dependencies. Run `cargo audit` periodically to check for advisories against pinned crate versions.

### JavaScript / TypeScript

Runtime dependencies are managed through `pnpm` with a lockfile (`pnpm-lock.yaml`). To check for known vulnerabilities:

```bash
pnpm audit
```

Key dependencies to monitor:
- `@stellar/freighter-api` — wallet integration; keep at the version specified in `package.json`
- `next` — Next.js runtime; apply security patches promptly
- `fast-xml-parser` — XML processing; a common target for injection attacks

Do not widen version ranges (e.g., `*` or `>=`) in `package.json`. Use exact or tilde ranges and update intentionally.

### GitHub Actions

Workflow steps pin third-party actions by version tag (e.g., `actions/checkout@v4`). Periodically review workflow files for unpinned or suspicious action references.

---

## 10. Responsible Disclosure Policy

StellarVeriphy follows coordinated vulnerability disclosure:

1. **Reporter submits** a private report via GitHub Security Advisory or email.
2. **Maintainers acknowledge** within 48 hours and request any clarifications.
3. **Triage** — maintainers classify severity (Critical / High / Medium / Low) and assign an internal tracking ID.
4. **Fix development** — maintainers develop and test a patch in a private branch. The reporter is kept informed and may be consulted on the fix approach.
5. **Coordinated release** — the fix is released and the reporter is given advance notice of the release date.
6. **Public disclosure** — after the fix is available, a public security advisory is published. The default embargo period is 90 days from initial report, but the reporter and maintainers may agree on an earlier or later date.
7. **Credit** — reporters are credited in the public advisory unless they prefer to remain anonymous.

We ask that reporters:
- Give us reasonable time to fix the issue before public disclosure.
- Avoid accessing or modifying data beyond what is necessary to demonstrate the vulnerability.
- Avoid disrupting live services or user data.
- Do not publicly disclose details until the coordinated release date is reached.

We commit to:
- Respond promptly and in good faith.
- Not pursue legal action against good-faith security researchers following this policy.
- Credit reporters who wish to be named.
- Keep reporters informed of progress throughout the remediation cycle.

---

## 11. Security Documentation Index

Detailed security implementation guides are in [`docs/security/`](./docs/security/):

| Document | Contents |
|---|---|
| [`docs/security/key-management.md`](./docs/security/key-management.md) | Key inventory, HSM requirements, rotation procedures, backup and recovery, key usage auditing |
| [`docs/security/kms-architecture.md`](./docs/security/kms-architecture.md) | Artifact encryption key generation, wrapping, rotation, access control, and incident response |
| [`docs/security/consent-model.md`](./docs/security/consent-model.md) | Provenance consent and permission model — roles, permission matrix, consent scopes, enforcement points |
| [`docs/security/tee-attestation-service.md`](./docs/security/tee-attestation-service.md) | TEE attestation verification service — trust chain, validation steps, failure handling |
| [`docs/security/smart-contract-audit-runbook.md`](./docs/security/smart-contract-audit-runbook.md) | Audit firm selection, scope definition, finding remediation, report publication, re-audit process |
| [`docs/security/verification-service-security.md`](./docs/security/verification-service-security.md) | Rate limiting configuration, input validation schema, CSP setup, audit logging |
| [`docs/security/security-headers.md`](./docs/security/security-headers.md) | HTTP header set, rationale per header, how to verify, policy change guidance |
| [`docs/security/governance-framework.md`](./docs/security/governance-framework.md) | Autonomous governance — stakeholder roles, review paths, trust thresholds, emergency actions, audit trail |

Related documents:
- [`contracts/IMPLEMENTATION.md`](./contracts/IMPLEMENTATION.md) — storage conventions, cross-contract call patterns, error enum stability rules
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — contract initialization order, admin key handling, rollback procedures
- [`docs/adr/`](./docs/adr/) — architecture decision records including the TEE oracle trust model (ADR-0004)
