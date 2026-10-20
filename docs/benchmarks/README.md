# Contract performance benchmark

This benchmark measures the cost of the most-used oracle, provenance and registry contract calls so we can plan optimization work from data instead of guesses (#807, #793).

## What is measured

`contracts/<contract>/src/benchmark.rs` runs each call on a fresh Soroban environment and reads the budget counters. Operation names are prefixed with the contract:

| Operation                            | Why it is in the set                                  |
| ------------------------------------ | ----------------------------------------------------- |
| `oracle.submit_request:normal`       | The main write path every verification goes through   |
| `oracle.submit_request:high`         | Priority path; checks that priority does not add cost |
| `oracle.get_request`                 | The read path used by status checks                   |
| `oracle.cancel_request`              | Storage update on an existing request                 |
| `oracle.add_provider`                | Provider onboarding                                   |
| `oracle.get_next_available_provider` | Provider selection; cost grows with the provider list |
| `oracle.update_ttl_config`           | Verification policy change (#792)                     |
| `provenance.mint`                    | Certificate issue, once per verified asset            |
| `provenance.mint_batch:5`            | Batch issue; compare per-item cost with `mint`        |
| `provenance.get_certificate`         | The read path used by status checks                   |
| `provenance.transfer_certificate`    | Ownership change                                      |
| `provenance.revoke_certificate`      | Moderation and legal path                             |
| `provenance.set_verification_level`  | Badge level update by the oracle                      |
| `provenance.add_tag`                 | Index write on an existing certificate                |
| `registry.add_tee_hash`              | Enclave build approval                                |
| `registry.is_tee_hash_approved`      | Checked on every attestation                          |
| `registry.add_provider`              | Provider key approval                                 |
| `registry.is_provider`               | Checked on every attestation                          |
| `registry.is_provider_authorized`    | Provider check including the blacklist                |
| `registry.rotate_tee_hash`           | Enclave rotation                                      |

The report also adds these calls up into **common flows** (see `COMMON_FLOWS` in `scripts/lib/contract-benchmark.mjs`) and converts CPU instructions into an **estimated compute fee** in stroops. See [Benchmarked common flows](../gas-costs.md#benchmarked-common-flows) for how to use the numbers.

For each operation the benchmark records **CPU instructions** and **memory bytes**. Soroban's budget model counts these deterministically, so a given SDK version produces the same numbers on every run. A change in the numbers means the contract or the SDK changed.

## Running it

```bash
pnpm bench:contracts                      # run the benchmark and write the report
pnpm bench:contracts --contracts oracle   # run a subset of contracts
pnpm bench:contracts --update-baseline    # also store these numbers as the new baseline
pnpm bench:contracts --from-results <f>   # render an existing results file without running cargo
```

Requirements: a Rust toolchain with the `wasm32` target, as used by `pnpm build:contracts`.

The script does not need a Stellar network or a running node. It is a unit-level measurement inside the contract test harness.

## Files

| Path                                      | Contents                                                             |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `docs/benchmarks/results/latest.json`     | Raw numbers from the most recent run                                 |
| `docs/benchmarks/results/baseline.json`   | The numbers the next run is compared against                         |
| `docs/benchmarks/contract-performance.md` | The rendered report: results, regressions, improvement opportunities |

All three are committed so contributors can read them without running the benchmark.

## Reading the report

- **Δ CPU** is the change against the baseline. Anything above +10% is marked `regression`. The threshold is `DEFAULT_TOLERANCE` in `scripts/lib/contract-benchmark.mjs`.
- **Improvement opportunities** ranks the costliest operations by share of total CPU. Start optimization work there.
- A baseline entry with no matching result shows up under **Regressions** as a missing operation, so a benchmark that silently stopped running is visible.

## Updating the baseline

Update the baseline only after you have reviewed why the numbers moved. A regression you accept (for example, a new check that is required for safety) should go into the baseline with the reason in the pull request description. Do not update the baseline just to make CI pass.

## Testing the tooling

The report renderer and comparison logic have their own unit tests, which do not need cargo:

```bash
pnpm test:bench-tools
```

## Adding an operation

1. Add a `measure(&env, "<contract>.<name>", || { ... })` call in `benchmark_most_used_calls` in `contracts/<contract>/src/benchmark.rs`. Create any state it needs outside the closure so only the target call is measured.
2. If the call is part of a user-facing flow, add it to `COMMON_FLOWS` in `scripts/lib/contract-benchmark.mjs`.
3. Run `pnpm bench:contracts --update-baseline` and commit the three files.
