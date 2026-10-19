# Continuous Integration

Two workflows cover CI: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
(build/test/lint on every push to `main` and every PR) and
[`.github/workflows/security-scan.yml`](../../.github/workflows/security-scan.yml)
(dependency/vulnerability scanning, on PRs and a daily schedule).

The repository also includes [`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml)
for the home page Playwright smoke test. It installs the Chromium browser,
builds the frontend, starts `next start` through Playwright's `webServer`
configuration, runs `e2e/home.spec.ts`, and uploads the Playwright HTML report.

## Caching

Dependency stores and build output are cached between runs; keys, invalidation rules and the security rationale are in [`caching.md`](caching.md).

## `ci.yml` jobs

| Job                   | What it does                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-unit-tests` | `pnpm check:frontend` (ESLint), `pnpm build:frontend` (Next.js build), then `jest --coverage` with an enforced 80% branches/functions/lines/statements threshold. Coverage `lcov.info` is uploaded as an artifact.                                                                                                           |
| `build-contracts`     | Matrix over `[oracle, provenance, registry]`: `cargo fmt --check`, `cargo clippy --target wasm32-unknown-unknown --release -- -D warnings`, a release Wasm build, `cargo test --lib`, and `cargo test integration_` (only `oracle` has integration tests today). The built `.wasm` is uploaded per contract.                 |
| `contract-coverage`   | Matrix over the same three contracts: `cargo-llvm-cov` generates `lcov.info` per contract (uploaded as an artifact) and prints a summary; runs after `build-contracts`.                                                                                                                                                      |
| `e2e-tests`           | Matrix over `[chromium, firefox, webkit]`: builds the frontend, starts `next start`, and runs Playwright against it. Uploads the HTML report always, and failure-only visual regression snapshots.                                                                                                                           |
| `mutation-testing`    | **Added for #250.** Runs Stryker against `packages/shared` (see [`docs/testing/MUTATION_TESTING.md`](../testing/MUTATION_TESTING.md)) and uploads the HTML report as a build artifact. Runs after `frontend-unit-tests`; **not** in `ci-complete`'s `needs` list, so it's observability-only for now — see that doc for why. |
| `ci-complete`         | Final gate: depends on `frontend-unit-tests`, `build-contracts`, `contract-coverage`, and `e2e-tests`. Downloads all coverage artifacts and prints a pass summary.                                                                                                                                                           |

## `security-scan.yml`

Runs a Trivy filesystem scan (SARIF uploaded to the repo's code-scanning
tab), generates an SPDX SBOM, and uploads it as an artifact. Triggers on PRs
to `main` and daily via cron, independent of `ci.yml`.

## Test result reporting

- **Frontend:** Jest's own console output plus the enforced coverage
  threshold (the `frontend-unit-tests` job fails outright if coverage drops
  below 80%). `lcov.info` is uploaded as an artifact for external tooling
  (e.g. Codecov) to consume if wired up later.
- **Contracts:** `cargo test` output in the `build-contracts` job log per
  contract; `cargo-llvm-cov` coverage summaries in `contract-coverage`.
- **E2E:** Playwright's HTML report, uploaded as an artifact per browser.
  The lightweight home page smoke test is reported by the `E2E Tests` workflow.
- **Mutation:** Stryker's HTML report, uploaded as an artifact (see the
  mutation testing doc for the current score).

There's no unified cross-language test-result check (e.g. a single GitHub
Checks annotation combining Jest + Cargo + Playwright) — each job's own log
and uploaded artifacts are the source of truth today.

## Blocking merges on failure

`ci-complete` only reports status — GitHub doesn't let a workflow enforce
branch protection on itself. To actually block merging on red CI:

1. Repo **Settings → Branches → Branch protection rules** → add a rule for `main`.
2. Enable **"Require status checks to pass before merging"**.
3. Select `ci-complete` (which transitively depends on the other required
   jobs). Leave `mutation-testing` unselected until its Stryker threshold is
   enforced (see the mutation testing doc).

This is a one-time repo setting, not something a workflow file can configure
on your behalf.

## Local equivalents

```bash
pnpm install
pnpm run check:frontend        # ESLint
pnpm run build:frontend        # Next.js build
pnpm --filter frontend test:coverage   # Jest + coverage
pnpm run test:mutation         # Stryker on packages/shared
cargo fmt --check && cargo clippy --target wasm32-unknown-unknown --release -- -D warnings && cargo test --lib
  # ^ run from each contracts/<name> directory; requires the Rust toolchain locally
```

## Known pre-existing issues (not introduced by this PR)

At the time of writing, `frontend-unit-tests` and `build-contracts` are
**already red on `main`**, independent of anything in this change:

- `pnpm build:frontend` failed outright: `components/HeroSection.tsx` imports
  `framer-motion`, which was never declared in `frontend/package.json`. Fixed
  in this PR (pinned to v10.x — v12's stricter `Variants`/`Easing` types don't
  accept the existing untyped `ease: "easeOut"` object literal). With that
  fixed, the build gets further and now fails on a **different**,
  pre-existing type error in `components/Navigation.tsx` (`noUncheckedIndexedAccess`
  — one of upstream's own strict tsconfig flags — catching a possibly-undefined
  array destructure in an `IntersectionObserver` callback). Also out of scope
  here; the point of fixing framer-motion was only to unblock this branch's
  push, not to chase every pre-existing type error transitively.
- `pnpm check:frontend` reports parser errors in `utils/responsive.ts` (JSX
  in a `.ts` file — should be `.tsx`) and `public/widget.js`.
- Several Jest suites (`utils/__tests__/rateLimiter.test.ts`,
  `utils/__tests__/inputValidation.test.ts`, ...) fail to compile because
  `frontend/tsconfig.test.json` restricts `"types"` to `["jest"]`, so
  `process` (a `@types/node` global) isn't visible to `ts-jest`.
- `contracts/oracle/src/lib.rs` has ~12 duplicated function definitions
  interleaved without conflict markers (not a merge conflict in this
  branch — the file itself is malformed on `main`); `cargo build` for the
  oracle contract will not succeed until that's fixed. See the callout at
  the top of [`docs/api/CONTRACTS.md`](../api/CONTRACTS.md).

These were verified against a clean checkout of `upstream/main` (no diff
from this branch), so this PR isn't the cause and fixing them is out of
scope here — flagging them so the red CI on this PR isn't mistaken for a
regression it introduced.
