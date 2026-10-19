# Contract performance benchmark

This benchmark measures the cost of the most-used oracle contract calls so we can plan optimization work from data instead of guesses (#807).

## What is measured

`contracts/oracle/src/benchmark.rs` runs each call on a fresh Soroban environment and reads the budget counters:

| Operation               | Why it is in the set                                  |
| ----------------------- | ----------------------------------------------------- |
| `submit_request:normal` | The main write path every verification goes through   |
| `submit_request:high`   | Priority path; checks that priority does not add cost |
| `get_request`           | The read path used by status checks                   |
| `cancel_request`        | Storage update on an existing request                 |

For each operation the benchmark records **CPU instructions** and **memory bytes**. Soroban's budget model counts these deterministically, so a given SDK version produces the same numbers on every run. A change in the numbers means the contract or the SDK changed.

## Running it

```bash
pnpm bench:contracts                      # run the benchmark and write the report
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

1. Add a `measure(&env, "<name>", || { ... })` call in `benchmark_most_used_calls` in `contracts/oracle/src/benchmark.rs`. Create any request it needs outside the closure so only the target call is measured.
2. Run `pnpm bench:contracts --update-baseline` and commit the three files.
