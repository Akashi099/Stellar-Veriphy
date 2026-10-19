# CI caching

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) reuses three kinds of cache across runs and branches. This page lists what each one holds, when it is invalidated, and why it is safe.

## What is cached

| Cache         | Path                                                | Key                                                                                                            | Restore fallback                                 | Saved from  |
| ------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------- |
| pnpm store    | pnpm's content-addressable store                    | OS + hash of `pnpm-lock.yaml` (via `actions/setup-node` `cache: pnpm`)                                         | none                                             | any branch  |
| Next.js build | `frontend/.next/cache`                              | `nextjs-<CACHE_VERSION>-<os>-<lockfile hash>-<source hash>`                                                    | latest cache for the same lockfile               | any branch  |
| Rust          | `~/.cargo` registry/git + `contracts/<name>/target` | `<CACHE_VERSION>-rust` + contract name + rustc version + `Cargo.lock`/`Cargo.toml` (via `Swatinem/rust-cache`) | latest cache for the same contract and toolchain | `main` only |

`node_modules` is **not** cached. It contains symlinks and platform-specific binaries that break in confusing ways when restored over a different lockfile. Caching the pnpm store gives most of the speed-up: `pnpm install --frozen-lockfile` becomes a linking step instead of a download.

## When caches are invalidated

| Change                                                    | Effect                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-lock.yaml` changes                                  | New pnpm store key and new Next.js key prefix; both start cold.                                                                         |
| Frontend or `packages/*` source changes                   | Exact Next.js key misses; restores the newest cache for the same lockfile. Next.js checks each cached module and rebuilds what changed. |
| `Cargo.lock`, `Cargo.toml`, or the Rust toolchain changes | New rust-cache key for that contract; cold build. Other contracts are unaffected.                                                       |
| `CACHE_VERSION` is bumped in `ci.yml`                     | Every cache above is invalidated on the next run.                                                                                       |

Unused caches are evicted by GitHub after 7 days, and the oldest ones go first when the repository passes 10 GB.

### Forcing a clean build

If you suspect a stale cache (a failure that disappears locally on a clean checkout):

1. Bump `CACHE_VERSION` in `.github/workflows/ci.yml` (`v1` → `v2`) in your PR. This is the intentional, reviewable way to invalidate everything.
2. For a one-off, a maintainer can delete specific entries under **Actions → Caches**, or run `gh cache delete --all`.

Don't add `restore-keys` that drop the lockfile hash. That is what lets a dependency upgrade build against old artifacts.

## Why this is safe

- **Branch scoping.** GitHub only lets a run restore caches from its own branch or the base branch. A PR can read `main`'s cache, but `main` never reads a PR's cache, so a PR can't plant artifacts into `main`'s builds.
- **Rust caches are written from `main` only** (`save-if`). PRs still restore `main`'s cache, but don't fill the 10 GB quota with short-lived entries that evict the useful ones.
- **No secrets in caches.** Only dependency stores and build output are cached; no `.env` files, credentials, or deploy artifacts. The workflow runs with `contents: read`.
- **Lockfiles are enforced.** `pnpm install --frozen-lockfile` fails if the lockfile and `package.json` disagree, so a restored store can never satisfy a different dependency set than the one checked in.
- **Correctness doesn't depend on a cache hit.** Every cache is an optimisation: a miss means a slower run, never a different result.

## Other speed-ups

- `concurrency` with `cancel-in-progress` stops superseded runs on the same PR or branch, so they don't use runners or write caches the newer run would replace.
- The contract matrix uses `fail-fast: false`, so one contract's failure doesn't throw away the other contracts' warm builds.
