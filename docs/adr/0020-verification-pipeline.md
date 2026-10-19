# ADR-0020: Separate verification orchestration from on-chain evidence

- **Status:** Proposed (documents the existing implementation; pending maintainer review)
- **Date:** 2026-10-19

## Context

Media can be large and private, while on-chain execution and storage are constrained. Upload validation, durable processing, attestation authorization, and certificate issuance have different failure modes and trust boundaries. Contributors need to distinguish implemented checks from the intended end-to-end integration.

## Decision

Keep media and manifests off-chain and represent provenance through hashes and storage references. Use shared validation/hashing definitions, asynchronous jobs for processing, a registry for provider/code authorization, an oracle for attestation verification, and a provenance contract for certificate records.

The current implementation has separate paths:

- [Frontend jobs](../../frontend/lib/server/jobs.ts) validate stored upload metadata and recompute the manifest hash. The worker returns `manifestHash` and marks the job `certified`; on-chain anchoring is explicitly not wired into this worker.
- [Backend](../../backend/src/index.ts) runs a MongoDB-backed queue and workers. Its operational persistence is separate from the frontend job implementation; do not assume they share a queue.
- [Oracle](../../contracts/oracle/src/lib.rs) exposes `submit_request` and `verify_attestation`. The latter checks the registry's provider and TEE code allowlists and verifies an Ed25519 signature over the supplied payload. It returns success without minting a certificate or consuming a request ID in that call.
- [Provenance](../../contracts/provenance/src/lib.rs) implements certificate operations separately. Orchestration must explicitly connect successful evidence validation to issuance before claiming end-to-end chain verification.

The [pipeline guide](../verification_pipeline.md) describes the intended complete flow. This record captures implementation boundaries, not proof of a production enclave deployment or automatic minting.

## Alternatives and trade-offs

| Alternative | Reason for current separation |
| --- | --- |
| Store/process full media on-chain | Raises storage and execution costs and exposes content; references and hashes are smaller, but require external data availability. |
| Synchronous upload-to-certificate request | Couples user latency to storage, oracle, and network failures; jobs permit status tracking and recovery, at the cost of state coordination. |
| Centralized verification database only | Simpler operations, but lacks independently readable chain evidence. Off-chain job success remains weaker than chain confirmation. |
| Fully on-chain media verification | Cannot directly execute the external media/TEE processing required by this design; oracle trust introduces provider and code governance obligations. |
| One combined verification contract | Fewer cross-contract calls, but couples provider governance, request handling, and certificate lifecycle changes. |

## Consequences and constraints

- Hash agreement establishes integrity of the compared inputs, not factual truth, ownership, or accuracy of creator-supplied metadata.
- A valid provider signature is not by itself proof that its payload binds the right request, file, and manifest. Future integration must define and enforce that binding and replay protection explicitly.
- Recovery must account for process crashes and ambiguous chain outcomes; reconcile existing chain records before retrying issuance. See [ADR-0010](0010-verification-job-recovery.md).
- Off-chain storage availability, registry governance, key security, and network configuration remain operational dependencies.
- Changes that connect these paths must test invalid signatures/providers, mismatched manifests, interrupted jobs, duplicate issuance, and chain confirmation separately.

## References

- [TEE trust model](0004-tee-oracle-trust-model.md)
- [Storage decision](0005-pluggable-storage-layer.md)
- [Remote attestation design](0017-tee-remote-attestation-pipeline.md)
- [User workflows](../user-guide.md)
