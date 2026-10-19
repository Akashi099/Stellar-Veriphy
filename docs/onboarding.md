# Developer Onboarding Guide

This guide gets a new contributor from a fresh clone to a running local environment, and explains how day-to-day development, testing, and contribution works in this repository.

StellarVeriphy is a monorepo with two toolchains: **Node.js/pnpm** for the frontend and shared TypeScript packages, and **Rust/Cargo** for the Soroban smart contracts. You'll need both set up, even if you only plan to work on one side.

> Project status: this is an early-stage scaffold. Some of what's described below (automated tests, CI, a configured pre-commit hook) doesn't exist yet — this guide says so explicitly where that's the case, rather than describing an idealized setup you won't find in the repo. See [Common Issues](#common-issues-and-solutions) for the current gaps.

## Table of contents

- [Creator onboarding checklist](#creator-onboarding-checklist)
- [Environment setup](#environment-setup)
- [Dependency installation](#dependency-installation)
- [Local development workflow](#local-development-workflow)
- [Testing](#testing)
- [Code style guidelines](#code-style-guidelines)
- [Contribution process](#contribution-process)
- [Common issues and solutions](#common-issues-and-solutions)

## Creator onboarding checklist

Use this short checklist when helping a creator get started:

1. **Connect a Stellar wallet** — the wallet signs verification records.
2. **Upload an asset** — choose a photo, video, audio file, or document.
3. **Add creator details** — review the public key and optional provenance metadata.
4. **Verify and track it** — submit the asset and follow its status from the jobs list.

Each step leads directly to the next action, so creators can complete setup without reading the full developer guide.

## Environment setup

Install these before touching the repo:

| Tool                                                                                     | Version                                                 | Why                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org/)                                                           | 20+                                                     | Runs the Next.js frontend and shared TS packages                                               |
| [pnpm](https://pnpm.io/installation)                                                     | 10.18.2 (pinned via `packageManager` in `package.json`) | Monorepo package manager — see [ADR-0003](adr/0003-pnpm-monorepo.md) for why pnpm specifically |
| [Rust](https://rustup.rs/)                                                               | latest stable, plus the `wasm32-unknown-unknown` target | Builds the Soroban contracts                                                                   |
| [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) | latest                                                  | Build/deploy/invoke Soroban contracts                                                          |
| [Freighter wallet](https://www.freighter.app/)                                           | latest browser extension                                | Sign transactions against Stellar testnet while testing the frontend                           |

Enable the wasm target once Rust is installed:

```bash
rustup target add wasm32-unknown-unknown
```

Verify everything is on your `PATH`:

```bash
node -v          # v20.x or newer
pnpm -v           # 10.18.2
cargo -v
rustc --version
stellar --version
```

If `pnpm` isn't found, install it via corepack (bundled with Node 20+) rather than a global npm install, so the version stays pinned to what the repo expects:

```bash
corepack enable
corepack prepare pnpm@10.18.2 --activate
```

## Dependency installation

```bash
git clone https://github.com/Stellar-Veriphy/Stellar-Veriphy.git
cd Stellar-Veriphy
pnpm install
```

`pnpm install` at the repo root resolves workspace packages (`frontend`, `packages/shared`) together — you don't need to run it separately inside `frontend/`. This also runs the `prepare` script (`husky`), which wires up the repo's git hooks directory.

Rust dependencies for each contract are fetched automatically the first time you build that contract with Cargo or the Stellar CLI — there's no separate "install" step for the contracts side.

## Local development workflow

**Frontend** (Next.js app in `frontend/`):

```bash
pnpm dev:frontend
# http://localhost:3000
```

This is a root-level script (`package.json`) that proxies to `frontend`'s own `next dev` via pnpm's `--filter`. A basic health check endpoint is available once it's running:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"stellarveriphy"}
```

**Shared package** (`packages/shared/`): types and utilities used by the frontend (e.g. `ContentManifest`, `sha256`). It's consumed directly by workspace linking — edit it in place and the frontend picks up changes on next reload, no build/publish step needed.

**Contracts** (`contracts/oracle`, `contracts/provenance`, `contracts/registry`): build each with the Stellar CLI, or all at once from the root:

```bash
pnpm build:contracts
```

For iterating on a single contract, `cd` into it directly so build output stays scoped to that crate:

```bash
cd contracts/oracle
stellar contract build
```

See the [Contract Deployment Guide](deployment.md) for taking a built contract further — deploying to testnet, initializing it, and verifying the deployment.

## Testing

There is currently **no automated test suite** in this repository — no `pnpm test` script, no Rust `#[test]` modules in the contracts, and no CI configured to run either. If you're adding a feature, treat writing its first tests as part of the change rather than assuming a harness is already there to slot into.

Until a project-wide test setup exists, here's how to verify your changes manually:

- **Frontend**: run `pnpm dev:frontend` and exercise the page/route you changed in a browser. For API routes (e.g. `frontend/app/api/health/route.ts`), hit them directly with `curl` as shown above.
- **Contracts**: Soroban contracts support unit tests in the same crate using `#[cfg(test)]` and `soroban_sdk::testutils` — none exist yet in `contracts/*/src/lib.rs`. If you're changing contract logic, add tests alongside it using `cargo test` inside that contract's directory, following the [Soroban testing docs](https://developers.stellar.org/docs/build/guides/testing).
- **End-to-end**: after building and deploying a contract to testnet (see the [deployment guide](deployment.md)), invoke it with `stellar contract invoke` to confirm behavior against a real network before opening a PR that touches contract logic.

If your change is a good candidate for introducing the first real test harness (e.g. `vitest` for the frontend, `cargo test` wired into a root script), say so in your PR description — that's a welcome contribution, not scope creep.

## Code style guidelines

- **TypeScript**: `strict` mode is enabled repo-wide via `tsconfig.base.json` — don't weaken it locally. The frontend has `next lint` available (`pnpm --filter frontend lint`); there's no custom ESLint config beyond Next's defaults yet. Favor the patterns already in `packages/shared` (small, explicit interfaces; no default exports for types) and `frontend/app` (server components by default; only add `"use client"` when you actually need interactivity or state).
- **Rust**: run `cargo fmt` and `cargo clippy` before committing changes to any `contracts/*` crate — neither is currently enforced by a hook, so this is on you until that's automated (see [Common Issues](#common-issues-and-solutions)). Contracts are `#![no_std]` — don't pull in `std`-only crates.
- **Naming**: match what's already there — `camelCase` for TS values, `PascalCase` for TS types/React components, `snake_case` for Rust. Contract entry points are short verbs (`submit`, `mint`, `register`, `get`, `is_approved`) — keep new ones consistent with that.
- **Commit messages**: this repo's own history uses short, imperative subject lines (`feat: scaffold StellarVeriphy monorepo`) — follow [Conventional Commits](https://www.conventionalcommits.org/) style (`feat:`, `fix:`, `docs:`, `chore:`) where it fits.

## Contribution process

1. **Fork** the repository (or create a branch directly if you have write access).
2. **Branch** off `main`: `git checkout -b feature/short-description`.
3. **Make your change**, keeping it scoped — prefer several small PRs over one large one when the work naturally splits.
4. **Verify manually** per the [Testing](#testing) section above; run `cargo fmt`/`cargo clippy` for contract changes and `pnpm --filter frontend lint` for frontend changes.
5. **Commit** with a clear, imperative message.
6. **Push** and **open a Pull Request** against `main`. Describe _why_ the change is needed, not just what it does — link the issue it closes if there is one.
7. **Respond to review feedback.** For anything architecturally significant (new contract, new trust boundary, new storage backend), consider whether it warrants an [ADR](adr/README.md).

## Common issues and solutions

**`pnpm install` fails or resolves the wrong versions.**
Confirm you're on pnpm 10.18.2 (`pnpm -v`) — the repo pins this via `packageManager` in the root `package.json`. A different major version can resolve the workspace differently. Use corepack (see [Environment setup](#environment-setup)) rather than a global `npm i -g pnpm`.

**Contract build fails with a missing `wasm32-unknown-unknown` target.**
Run `rustup target add wasm32-unknown-unknown`. This is easy to miss if you already had Rust installed for other projects.

**`stellar contract build` succeeds but you don't see a `.wasm` file where you expect.**
Output lands under `contracts/<name>/target/wasm32-unknown-unknown/release/<name>.wasm`. `target/` is gitignored — don't expect build artifacts to show up in `git status`.

**You expected a pre-commit hook to lint/format your changes automatically, and nothing happened.**
`husky` and `lint-staged` are listed as dependencies and `prepare` runs `husky` on install, but no `.husky/pre-commit` hook file or `lint-staged` config exists yet in this repo — so nothing currently runs automatically on commit. Until that's added, run `cargo fmt`/`cargo clippy` and `pnpm --filter frontend lint` manually before pushing.

**Frontend dev server starts but changes to `packages/shared` don't seem to apply.**
Restart `pnpm dev:frontend` — Next's dev server doesn't always pick up changes in a linked workspace package without a restart, since it isn't watching that package's files the same way it watches `frontend/`.

**You're not sure which network you're pointed at when using the Stellar CLI.**
`stellar` commands take an explicit `--network` flag (e.g. `--network testnet`) — there's no repo-level default configured. Always pass it explicitly rather than relying on a previous `stellar config` invocation, especially before anything that costs funds or writes state.

**Where do I ask questions?**
Open a [GitHub issue](https://github.com/Stellar-Veriphy/Stellar-Veriphy/issues) with the `question` label, or comment directly on the issue/PR you're working from.

## Challenge-Response Email Verification Guidance

StellarVeriphy incorporates a challenge-response verification flow (`frontend/components/auth/EmailVerificationChallenge.tsx` & `/verify-email`) to authenticate user emails for identity trust and notification workflows.

### Security Principles
- **One-Time Challenge Tokens**: Codes are 6-digit numeric sequences generated with cryptographic randomness.
- **Short-Lived Expiration**: Tokens expire after 10 minutes. Expired tokens are immediately invalidated.
- **Rate-Limiting & Anti-Brute-Force**: Maximum of 5 verification attempts permitted per challenge session. After 5 failed attempts, the challenge is invalidated and the user must re-request.
- **Anti-Spam Cooldown**: A 60-second cooldown is enforced between challenge request dispatches to prevent mail-bombing and spamming.
- **Input Sanitization**: Email addresses and token codes are normalized, trimmed, and formatted before transmission.

### UX Best Practices
- **Duplicate Submission Prevention**: Form submit controls and resend triggers are disabled while requests are inflight and during cooldown periods.
- **Clear State Transitions**: Distinct UI feedback for challenge request, code input, verification in progress, success confirmation, and specific error states.
- **Direct Focus Management**: Focus automatically shifts to the code input field upon entering the challenge phase.
