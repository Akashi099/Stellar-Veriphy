# Contract Smoke Tests

A small suite that walks the main flow of each Soroban contract on a local test
environment. It is meant to run on every change, so it stays fast and each
failure points at one readable flow.

Issue: #800 — _Add a contract integration smoke test suite_.

## Running it

```bash
pnpm test:contracts:smoke                  # all contracts
bash scripts/contracts-smoke.sh oracle     # one contract
```

Requires Rust with `cargo` (see [rustup.rs](https://rustup.rs)). The script
runs `cargo test --lib smoke_` in each contract directory.

Output has one line per contract:

```
PASS  oracle  test result: ok. 4 passed; 0 failed; ...
FAIL  registry  test result: FAILED. 2 passed; 1 failed; ... (log: .../contracts/target/smoke-logs/registry.log)
    test smoke_tests::smoke_approved_tee_hash_is_accepted_and_unknown_hash_is_not ... FAILED
    thread '...' panicked at src/smoke_tests.rs:30:5:
    <assertion message>
```

The full cargo output for each contract is kept in
`contracts/target/smoke-logs/<contract>.log`. The script exits non-zero if any
contract fails to build or any smoke test fails.

## What is covered

Every test name starts with `smoke_`, so the filter selects only this suite.
The tests live in `contracts/<contract>/src/smoke_tests.rs`.

| Contract     | Flow                                                                                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `provenance` | Mint and read back; transfer, then lock blocks further transfers; revoke; expiration and renewal                                       |
| `oracle`     | Submit is `Pending`; cancel once, then a second cancel is rejected; pause blocks submissions until unpaused; second `init` is rejected |
| `registry`   | Approved TEE hash is accepted and an unknown hash is not; registered provider is authorized; blacklisted provider is rejected          |

## Adding a test

1. Add a function in the contract's `smoke_tests.rs` whose name starts with
   `smoke_`.
2. Keep it to one flow, using the `setup` helper in that file.
3. Run `scripts/contracts-smoke.sh <contract>` to confirm it passes.

Detailed behaviour (edge cases, error variants) belongs in the contract's
`test.rs` or `integration_tests.rs`, not here.

## CI

The workflow files were removed from this repository (commit `0b2cafb`), so
nothing currently runs this script automatically. To run it in CI, add a job
that installs Rust and runs `pnpm test:contracts:smoke`. The script exits
non-zero on any failure, so the job can gate merges directly.

## Related

- [`docs/ci/CI.md`](../ci/CI.md) — CI overview
- [`docs/testing/contract-property-tests.md`](contract-property-tests.md) — property tests
