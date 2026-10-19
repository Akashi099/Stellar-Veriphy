# Provenance contract stress test findings

## Scope

This document captures the expected stress-test coverage for the provenance contract and the bottlenecks that the tests are designed to surface.

## Batch operation limits

- `mint_batch` is capped at 50 entries by `BatchSizeExceeded`.
- The contract validates every manifest hash in order and aborts the full batch if a duplicate is encountered.
- This means the batch path is safest for moderate loads and becomes a single-failure point when passing large or partially duplicate inputs.

## Storage limits

- Every certificate creates persistent storage entries for the certificate payload, creator index, manifest hash mapping, history, and counters.
- As certificate count grows, the number of secondary index entries grows linearly, which makes large-scale minting and query pagination more expensive in storage footprint.
- The main pressure point is the per-certificate history and creator lookup index because they are appended on every mutation.

## Computation limits

- Pagination methods iterate through total certificate sets and stop at the requested `limit`.
- The maximum effective working set in time-range and creator queries is bounded by the number of stored certificate records and secondary indexes.
- This keeps the code linear in certificate count but makes bulk listing and large offsets more expensive as the dataset grows.

## Concurrent access

- The contract performs append-only updates to persistent storage through sequential ledger execution, so concurrent writes are naturally serialized by the chain.
- The main contention risk is on creator/history/index keys when many users update the same certificate or frequently mint from the same owner.
- Because each operation writes multiple keys, a hot owner or popular certificate can amplify storage churn and increase latency.

## Bottlenecks identified

1. `mint_batch` is a single transaction with a fixed upper bound of 50 certificates; higher volume requires multiple batches.
2. Creator and time-range queries are linear scans over stored IDs and can degrade as the dataset grows.
3. History entries grow forever with each metadata update or transfer, creating a write amplification path.
4. Duplicate checks and secondary indexing mean the cost of minting scales with the number of keys written, not just the number of certificates.
5. Large multi-owner workloads are dominated by index writes rather than the certificate payload itself.

## Recommended follow-up

- add explicit storage caps or warnings before a batch crosses the contract’s practical threshold;
- optimize hot-path queries with compressed or paginated index structures;
- consider bounds on history growth for long-lived certificates;
- benchmark the actual per-operation cost under realistic certificate volumes before production deployment.
