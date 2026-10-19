# Contributing to Stellar-Veriphy

Thank you for your interest in contributing to Stellar-Veriphy! We are building a decentralized content verification and provenance platform on the Stellar blockchain with Soroban smart contracts.

This document provides complete guidelines and standards for contributing to the project.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [How to Report Bugs](#how-to-report-bugs)
3. [How to Suggest Features](#how-to-suggest-features)
4. [Development Setup](#development-setup)
   - [Prerequisites](#prerequisites)
   - [Environment Setup](#environment-setup)
   - [Running the Project](#running-the-project)
5. [Coding Standards](#coding-standards)
   - [TypeScript & React Standards](#typescript--react-standards)
   - [Rust & Soroban Contract Standards](#rust--soroban-contract-standards)
   - [Formatting and Linting](#formatting-and-linting)
6. [Commit Message Guidelines](#commit-message-guidelines)
7. [Branch Naming Conventions](#branch-naming-conventions)
8. [Pull Request Process](#pull-request-process)
9. [Issue Labeling Guide](#issue-labeling-guide)
10. [Project Structure](#project-structure)
11. [Getting Help](#getting-help)
12. [License](#license)

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone, regardless of background, experience level, gender identity, sexual orientation, disability, personal appearance, race, ethnicity, age, religion, or nationality.

### Our Standards

- **Be respectful and inclusive**: Use welcoming and inclusive language. Respect differing viewpoints and constructive criticism.
- **Collaborate with empathy**: Focus on what is best for the community and users. Show empathy towards fellow contributors.
- **Maintain professionalism**: Keep discussions productive and focused on technical merit and project goals.

### Reporting Unacceptable Behavior

If you experience or witness unacceptable behavior, please contact the maintainers or report it via repository channels. All reports will be reviewed promptly and treated confidentially.

---

## How to Report Bugs

Bug reports help us maintain high quality and reliability. When reporting a bug, follow these steps:

### 1. Before Submitting

- **Search Existing Issues**: Check existing open and closed GitHub issues to see if the bug has already been reported.
- **Verify on Latest Main**: Ensure the bug reproduces on the latest commit of the `main` branch.

### 2. Submitting a Bug Report

Open a new issue using the **Bug Report** template and provide the following details:

- **Clear Title**: A concise, descriptive summary of the problem (e.g., `[Bug]: Manifest hash calculation fails on empty metadata`).
- **Description**: A clear summary of the bug and the context in which it occurs.
- **Steps to Reproduce**: Detailed step-by-step instructions to reproduce the issue:
  1. Go to '...'
  2. Click on '....'
  3. Scroll down to '....'
  4. See error
- **Expected Behavior**: What you expected to happen.
- **Actual Behavior**: What actually happened, including exact error messages and stack traces.
- **Environment**:
  - OS & Version (e.g., Ubuntu 22.04, macOS Sonoma 14.5, Windows 11 WSL2)
  - Node.js & pnpm versions (`node -v`, `pnpm -v`)
  - Rust & Stellar CLI versions (`rustc -v`, `stellar --version`)
  - Browser & Wallet extension version (e.g., Chrome 128, Freighter 6.0.1)
- **Screenshots / Recordings**: Visual evidence if the bug is UI-related.

---

## How to Suggest Features

We welcome ideas for new features and enhancements! To submit a feature proposal:

### 1. Before Submitting

- Search existing issues and discussions to avoid duplicate suggestions.
- Ensure the proposal aligns with Stellar-Veriphy's mission of decentralized content provenance and verification.

### 2. Submitting a Feature Request

Open a new issue using the **Feature Request** template including:

- **Feature Title**: A clear, concise name for the proposed feature.
- **Problem Statement**: What problem does this solve? What use cases does it address?
- **Proposed Solution**: A detailed description of how the feature should work, including suggested UI flows or API/contract changes.
- **Alternatives Considered**: Other approaches or workarounds you considered and why the proposed solution is preferred.
- **Additional Context**: Any mockups, diagrams, code snippets, or reference links.

---

## Development Setup

### Prerequisites

Ensure you have the following tools installed:

| Tool                 | Required Version                           | Purpose                                           |
| -------------------- | ------------------------------------------ | ------------------------------------------------- |
| **Node.js**          | `>= 20.0.0`                                | Frontend and shared tooling                       |
| **pnpm**             | `>= 10.18.2`                               | Workspace package manager                         |
| **Rust**             | `stable` (`wasm32-unknown-unknown` target) | Soroban smart contracts                           |
| **Stellar CLI**      | `latest`                                   | Contract compilation and deployment               |
| **Freighter Wallet** | `latest`                                   | Browser extension for Stellar wallet interactions |

Install Rust WASM target:

```bash
rustup target add wasm32-unknown-unknown
```

Install Stellar CLI:

```bash
cargo install --locked stellar-cli --features opt
```

### Environment Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Stellar-Veriphy/Stellar-Veriphy.git
   cd Stellar-Veriphy
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

3. **Configure environment variables**:

   ```bash
   cd frontend
   cp .env.local.example .env.local
   ```

   Update `.env.local` with the appropriate network RPC URLs and contract IDs.

### Running the Project

#### Frontend

```bash
# Start development server
pnpm dev:frontend

# Build for production
pnpm build:frontend

# Run linting
pnpm check:frontend
```

The frontend will run at `http://localhost:3000`.

#### Smart Contracts

```bash
# Build all contracts (oracle, provenance, registry)
pnpm build:contracts

# Run contract tests
cd contracts/oracle && cargo test
cd ../provenance && cargo test
cd ../registry && cargo test
```

---

## Coding Standards

For detailed conventions, please consult [STYLE-GUIDE.md](./STYLE-GUIDE.md).

### TypeScript & React Standards

- **Strict Typing**: TypeScript strict mode is enabled. **Do not use `any`**. Use `unknown` with type guards, specific interfaces, or generics instead.
- **Naming Conventions**:
  - **PascalCase**: Components (`CertificateCard.tsx`), Interfaces/Types (`ContentManifest`, `VerificationResult`), Enums.
  - **camelCase**: Functions (`verifyManifest`), variables, custom hooks (`useWallet`), service files (`transactionService.ts`).
  - **UPPER_SNAKE_CASE**: Constants (`DEFAULT_TIMEOUT_MS`).
- **Component Design**:
  - Place hooks first, followed by derived state, event handlers, and finally return JSX.
  - Explicitly type component props using `interface Props` or `type Props`.
  - Use Tailwind CSS for utility-first styling.
  - Ensure accessibility: use semantic HTML, ARIA attributes, keyboard navigation support, and descriptive alt text.
- **Imports**: Group imports cleanly:
  1. Framework / Next / React imports
  2. External dependencies (`lucide-react`, `zustand`, etc.)
  3. Internal aliases (`@/...`, `@stellarveriphy/shared/...`)
  4. Relative imports (`./`, `../`)
  5. Type-only imports with `import type { ... }`

### Rust & Soroban Contract Standards

- **Safety & Quality**: All Soroban contracts must avoid unsafe blocks, unhandled panics, and arithmetic overflows (use checked or saturating math).
- **Naming Conventions**:
  - **PascalCase**: Structs, enums, traits (`OracleContract`, `AttestationRecord`).
  - **snake_case**: Functions, module names, variables (`verify_proof`, `token_id`).
  - **UPPER_SNAKE_CASE**: Module constants (`MAX_EXPIRY_LEDGERS`).
- **Documentation**: Document all public contract functions and data structures with Rustdoc `///` comments.
- **Gas & Footprint Optimization**: Keep state storage footprints minimal and avoid unbounded loops.

### Formatting and Linting

We enforce automatic formatting and linting via pre-commit hooks (`husky` + `lint-staged`):

- **Frontend**: [Prettier](https://prettier.io/) for formatting, then ESLint with TypeScript rules.
- **Contracts**: `rustfmt --edition 2021` and `cargo clippy`.

**Import sorting**: The frontend ESLint config includes `eslint-plugin-simple-import-sort`, which automatically groups and alphabetizes imports and exports (`simple-import-sort/imports`, `simple-import-sort/exports`). This runs as part of `pnpm --filter frontend exec eslint --fix` and the pre-commit hook, so imports are sorted automatically whenever you commit or run lint with `--fix`.
Prettier's config lives at the repo root (`.prettierrc.json`, `.prettierignore`) and covers the
whole workspace — TypeScript/JavaScript, JSON, CSS, and Markdown. Rust contracts are excluded and
formatted with `rustfmt` instead.

Run manual checks before submitting:

```bash
# Format the whole repo
pnpm format

# Check formatting without writing changes (used in CI)
pnpm format:check

# Check frontend lint
pnpm check:frontend

# Check Rust formatting
cd contracts/oracle && cargo fmt -- --check
```

Staged files are auto-formatted on commit, so running `pnpm format` manually is mostly useful for
formatting a whole directory at once or verifying CI will pass.

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Structure

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type       | Description                                               |
| ---------- | --------------------------------------------------------- |
| `feat`     | A new feature or capability                               |
| `fix`      | A bug fix                                                 |
| `docs`     | Documentation changes only                                |
| `style`    | Code style/formatting changes (no logic change)           |
| `refactor` | Code refactoring without fixing a bug or adding a feature |
| `perf`     | Performance improvement                                   |
| `test`     | Adding or updating tests                                  |
| `build`    | Changes to build system or dependencies                   |
| `ci`       | Changes to CI/CD workflows and configuration              |
| `chore`    | Routine maintenance tasks                                 |
| `revert`   | Reverting a previous commit                               |

### Scopes (Optional)

Common scopes include:

- `frontend`
- `oracle`
- `provenance`
- `registry`
- `shared`
- `ui`
- `wallet`
- `docs`

### Examples

```
feat(ui): add loading spinner component with size and color props
fix(oracle): validate attestation expiration before signature check
docs(readme): add build, license, and version badges
refactor(frontend): enable typescript strict mode and eliminate any types
```

---

## Branch Naming Conventions

Prefix branch names with the type of change and reference the relevant issue number:

| Branch Type   | Pattern                                 | Example                            |
| ------------- | --------------------------------------- | ---------------------------------- |
| Feature       | `feature/<issue-number>-<description>`  | `feature/364-loading-spinner`      |
| Bugfix        | `fix/<issue-number>-<description>`      | `fix/367-strict-ts-warnings`       |
| Documentation | `docs/<issue-number>-<description>`     | `docs/366-contributing-guidelines` |
| Refactor      | `refactor/<issue-number>-<description>` | `refactor/120-wallet-context`      |
| Hotfix        | `hotfix/<issue-number>-<description>`   | `hotfix/911-security-patch`        |

---

## Pull Request Process

### 1. Create a Topic Branch

Always create a new branch from an up-to-date `main`:

```bash
git checkout main
git pull origin main
git checkout -b feature/364-loading-spinner
```

### 2. Implement Changes

- Follow the coding standards and commit guidelines.
- Keep commits granular and focused on single logical changes.

### 3. Pre-PR Checklist

Before opening your pull request, verify:

- [ ] Code builds without errors (`pnpm build:frontend`, `pnpm build:contracts`)
- [ ] Type checks pass without warnings
- [ ] Linting checks pass
- [ ] No `console.log` or temporary debug code left behind
- [ ] Documentation updated where relevant
- [ ] For frontend UI changes, review the [Accessibility Review Checklist](./docs/testing/accessibility-review-checklist.md) and note any follow-up items
- [ ] Branch is rebased or merged with latest `main`

### 4. Submitting the PR

1. Push your branch to your remote repository:
   ```bash
   git push origin feature/364-loading-spinner
   ```
2. Open a Pull Request on GitHub against `main`.
3. Fill out the PR template completely:
   - Provide a clear title using Conventional Commits.
   - Describe what changed and why.
   - Link related issues (e.g., `Closes #364`).
   - Include screenshots or GIFs for UI changes.

### 5. Review & Merging

- Maintainers and reviewers will review your PR and may suggest improvements.
- Address comments promptly by pushing additional commits to the same branch.
- Once all reviews and CI checks pass, a maintainer will merge the PR.

---

## Issue Labeling Guide

We use GitHub labels to categorize issues and pull requests:

### Type Labels

| Label           | Description                                       |
| --------------- | ------------------------------------------------- |
| `bug`           | Something isn't working as expected               |
| `enhancement`   | New feature or improvement proposal               |
| `documentation` | Improvements or additions to documentation        |
| `refactor`      | Code restructuring without behavioral changes     |
| `security`      | Vulnerabilities or security improvements          |
| `question`      | Inquiries regarding setup, architecture, or usage |

### Area Labels

| Label        | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `frontend`   | Web UI, Next.js components, styling                          |
| `contracts`  | Soroban smart contracts (`oracle`, `provenance`, `registry`) |
| `shared`     | Shared TypeScript library (`@stellarveriphy/shared`)         |
| `UI`         | User interface and visual design                             |
| `typescript` | TypeScript types, strictness, compiler config                |
| `ci/cd`      | GitHub Actions, deployment workflows, scripts                |

### Contributor Experience

| Label              | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `good-first-issue` | Great for newcomers; well-scoped with clear requirements |
| `help-wanted`      | Tasks where extra community assistance is welcomed       |

### Priority Labels

| Label              | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `priority: high`   | Critical bugs, security issues, or release blockers  |
| `priority: medium` | Normal priority features and bug fixes               |
| `priority: low`    | Minor enhancements, cosmetic fixes, non-urgent tasks |

---

## Project Structure

```
Stellar-Veriphy/
├── contracts/                  # Soroban smart contracts (Rust)
│   ├── oracle/                 # TEE attestation verification oracle
│   ├── provenance/             # Content provenance certificate minting
│   └── registry/               # Provider and algorithm registry
├── frontend/                   # Next.js 15 web application (React, Tailwind)
│   ├── app/                    # Next.js App Router pages and routes
│   ├── components/             # Reusable UI components
│   │   └── ui/                 # Core design system components
│   ├── context/                # React context providers
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Helper libraries and utilities
│   ├── services/               # Blockchain and backend services
│   └── types/                  # TypeScript type definitions
├── packages/
│   └── shared/                 # Shared TypeScript types and validators
├── docs/                       # Project architecture and technical documentation
├── CONTRIBUTING.md             # Contribution guidelines (this file)
├── STYLE-GUIDE.md              # Code style reference
├── DEPLOYMENT.md               # Smart contract deployment guide
├── README.md                   # Project overview and badges
└── package.json                # Root monorepo configuration
```

---

## Getting Help

- **Documentation**: Explore guides in the [`docs/`](./docs/) directory.
- **Discussions & Issues**: Check [GitHub Issues](https://github.com/Stellar-Veriphy/Stellar-Veriphy/issues) for ongoing discussions.
- **Maintainers**: Tag `@Stellar-Veriphy/maintainers` in issues or PR comments when you need assistance.

---

## License

By contributing to Stellar-Veriphy, you agree that your contributions are licensed under the [MIT License](./LICENSE) (or repository root license).
