# Contract Property Tests

This document describes the property-based coverage added for the Soroban smart contracts. The suite uses `quickcheck` to generate random inputs and assert contract invariants across repeated executions without depending on a full build or test run in this issue branch.

## Oracle properties

The Oracle contract property tests focus on the public request lifecycle and safety checks:

- Request IDs are monotonic across repeated submissions.
- The same provider can be registered repeatedly without creating duplicate entries.
- Pausing the contract prevents new request submissions from being accepted.
- The request metadata remains consistent with the original caller and priority after generation.

These guard against regressions in ID generation, provider deduplication, and pause enforcement.

## Provenance properties

The Provenance contract property tests focus on the certificate lifecycle and duplicate prevention:

- Certificate IDs increase strictly with each minted certificate.
- Duplicate manifest hashes are rejected even when random payloads are used.
- Revocation updates persistent certificate state and preserves the selected reason.
- Repeated mint attempts do not produce duplicate certificate records for the same manifest.

These checks cover the core invariants of minting, uniqueness, and revocation.

## Registry properties

The Registry contract property tests focus on trust registration invariants:

- Re-registering the same TEE hash remains idempotent and does not duplicate entries.
- Re-registering the same provider remains idempotent and keeps a single provider record.
- Adding unique providers preserves monotonic list growth without dropping previously accepted entries.

These properties protect the registry’s core root-of-trust state from accidental duplication and list corruption.

## Coverage intent

The property suite complements the existing example-based Rust tests by stressing:

- uniqueness invariants,
- append-only monotonic counters,
- idempotent registration behavior,
- pause and denial conditions,
- consistent persisted state after mutating operations.

The test cases intentionally use generated inputs to exercise boundaries beyond the handwritten examples.
