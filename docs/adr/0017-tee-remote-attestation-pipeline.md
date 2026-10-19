# ADR-0017: Hardened TEE Remote Attestation Pipeline

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** Security, Blockchain, Oracle

## Context

The existing TEE attestation flow (`frontend/services/teeAttestationService.ts`, `contracts/oracle`) performs Ed25519 signature verification on-chain and code hash validation against `contracts/registry`.  However, the off-chain validation layer before the on-chain submission was not formalised into a typed, testable pipeline with:

- Explicit check ordering and failure codes.
- PCR measurement validation (platform state check).
- Nonce and user-data binding (replay / substitution prevention).
- Staleness enforcement.
- Structured admin alerts for each failure mode.
- Adversarial test vectors for CI coverage.

Alternatives considered:

- **Rely entirely on on-chain verification** — simpler, but on-chain resources are limited; exhaustive policy checks (staleness, nonce binding, user-data) are cheaper to implement off-chain.
- **Generic attestation library** — no existing library covers StellarVeriphy's specific integration with `contracts/registry` for code hash approval.
- **Typed TypeScript pipeline with pure functions** — the chosen approach: each check is independently testable, failure codes map directly to operator runbook actions, and the `buildAdversarialScenarios` export provides test vectors.

## Decision

Implement `packages/shared/tee-attestation/index.ts` — a typed attestation pipeline that:

- Defines `NitroAttestationDocument` as the canonical parsed attestation type.
- Defines `ExpectedMeasurements` as the admin-configurable policy for PCR and code hash approval.
- Implements `evaluateAttestationPipeline` — a pure function that runs nine sequential checks and returns a typed `AttestationValidationResult` with `primaryFailureCode` and per-check diagnostics.
- Implements `buildAdminAlert` — converts a failed result into a structured `AttestationAdminAlert` with severity and recommended action.
- Implements `buildAdversarialScenarios` — generates test vectors for every `AttestationFailureCode`.

The on-chain contract (`contracts/oracle.verify_attestation`) remains the authoritative trust enforcement point.  This pipeline performs complementary off-chain checks before the transaction is submitted.

## Consequences

- Attestation failures are now classifiable by typed `AttestationFailureCode`, enabling automated triage and alerting.
- PCR measurement validation confirms platform integrity before accepting attestations — not just code hash approval.
- Nonce and user-data binding prevent replay and job-substitution attacks.
- Admin alerts with severity and recommended action reduce incident response time.
- Adversarial test vectors allow CI to verify the pipeline rejects all documented hostile inputs.
- Full Ed25519 signature verification and X.509 certificate chain validation require a crypto library; this pipeline performs structural and policy checks.  Callers must run low-level crypto separately.  See `docs/security/tee-attestation-service.md`.
