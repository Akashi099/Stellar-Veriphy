# Architecture Decision Records

This directory records the significant architectural decisions made in StellarVeriphy, using the [ADR](https://adr.github.io/) format.

An ADR captures a decision, the context that drove it, and its consequences — so future contributors understand _why_ the system looks the way it does, not just _what_ it looks like today. Reading the code tells you the current state; ADRs tell you the reasoning that got it there.

## When to write one

Write an ADR when a decision:

- Is hard or expensive to reverse (choice of blockchain, storage model, trust model).
- Affects multiple parts of the system (contracts, frontend, oracle).
- Was debated — there were real alternatives, and someone reading the code later would reasonably ask "why not X?"

Small, easily-reversible implementation details (variable naming, a single function's internal structure) don't need an ADR.

## Process

1. Copy [`template.md`](template.md) to `NNNN-short-title.md`, using the next sequential number (zero-padded to 4 digits) and a kebab-case title.
2. Fill in Context, Decision, and Consequences. Open it as a PR so the decision gets reviewed like code.
3. Set **Status** to `Proposed` while under discussion, `Accepted` once merged.
4. If a later decision replaces this one, don't delete it — set its status to `Superseded by ADR-NNNN` and link the new record. The old ADR stays as history.

## Index

| ADR                                           | Title                                               | Status   |
| --------------------------------------------- | --------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions                       | Accepted |
| [0002](0002-soroban-on-stellar.md)            | Use Soroban smart contracts on Stellar              | Accepted |
| [0003](0003-pnpm-monorepo.md)                 | Use a pnpm workspaces monorepo                      | Accepted |
| [0004](0004-tee-oracle-trust-model.md)        | TEE-based oracle for trusted off-chain verification | Accepted |
| [0005](0005-pluggable-storage-layer.md)       | Pluggable storage layer (IPFS or MongoDB)           | Accepted |
| [0006](0006-oracle-request-routing.md)        | Rate-limited oracle request router                  | Accepted |
| [0007](0007-contract-upgrade-model.md)        | Contract upgrade model — redeploy with ID rotation  | Accepted |
| [0008](0008-multi-anchor-provenance.md)        | Multi-anchor provenance                             | Accepted |
| ADR                                              | Title                                               | Status   |
| ------------------------------------------------ | --------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md)    | Record architecture decisions                       | Accepted |
| [0002](0002-soroban-on-stellar.md)               | Use Soroban smart contracts on Stellar              | Accepted |
| [0003](0003-pnpm-monorepo.md)                    | Use a pnpm workspaces monorepo                      | Accepted |
| [0004](0004-tee-oracle-trust-model.md)           | TEE-based oracle for trusted off-chain verification | Accepted |
| [0005](0005-pluggable-storage-layer.md)          | Pluggable storage layer (IPFS or MongoDB)           | Accepted |
| [0006](0006-oracle-request-routing.md)           | Rate-limited oracle request router                  | Accepted |
| [0007](0007-end-to-end-observability.md)         | End-to-end tracing and structured observability     | Accepted |
| [0008](0008-ai-content-labeling.md)              | AI-generated content labeling                       | Accepted |
| [0009](0009-compliance-policy-engine.md)         | Configurable compliance policy engine               | Accepted |
| [0010](0010-verification-job-recovery.md)        | Verification job recovery                           | Accepted |
| [0011](0011-cross-tenant-data-segregation.md)    | Cross-tenant data segregation model                 | Accepted |
| [0012](0012-attestation-oracle-failover.md)      | Resilient failover for attestation and oracle       | Accepted |
| [0013](0013-oracle-anomaly-detection.md)         | Anomaly detection for suspicious oracle activity    | Accepted |
| [0014](0014-dynamic-provenance-access-policy.md) | Dynamic policy engine for provenance access         | Accepted |
| [0015](0015-key-rotation-revocation-framework.md) | Cryptographic key rotation and revocation framework | Accepted |
| [0016](0016-multi-tenant-registry-governance.md)  | Multi-tenant registry governance model              | Accepted |
| [0017](0017-tee-remote-attestation-pipeline.md)   | Hardened TEE remote attestation pipeline            | Accepted |
| [0018](0018-verifier-reputation-network.md)       | Decentralised verifier reputation network           | Accepted |
| [0019](0019-autonomous-governance-framework.md)   | Autonomous governance and policy review framework   | Accepted |
