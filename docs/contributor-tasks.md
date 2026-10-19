# Common contributor tasks

Commands run from the repository root. Choose checks for the area you change.

| Task | Command or reference |
| --- | --- |
| First setup | [Onboarding](onboarding.md) |
| Run frontend | `pnpm dev:frontend` → `http://localhost:3000` |
| Run backend | Export settings from [backend/.env.example](../backend/.env.example), start MongoDB, then `pnpm dev:backend` |
| Frontend checks | `pnpm check:frontend`, `pnpm --filter frontend typecheck`, `pnpm --filter frontend test --runInBand`, `pnpm build:frontend` |
| Shared tests | `pnpm --filter @stellarveriphy/shared test` |
| Backend checks | `pnpm build:backend`, `pnpm --filter backend test:retention`, `pnpm --filter backend test:seed` |
| Browser tests | `pnpm test:e2e`; see [Playwright configuration](../frontend/playwright.config.ts) for browser/server requirements |
| Contract tests | `cargo test --manifest-path contracts/oracle/Cargo.toml`; repeat for `provenance` and `registry` |
| Build contracts | `pnpm build:contracts` |
| Documentation | Review links, heading anchors, examples, and `git diff --check`; `pnpm format:check` checks repository formatting |
| Prepare a PR | [Contribution process](../CONTRIBUTING.md#pull-request-process) |

`pnpm test` runs workspace scripts named `test`; it does not include Cargo or the backend's separately named suites. Record actual results and blocked checks in your PR. See the [testing index](testing/README.md) for additional guidance.

## Issue triage

1. Search open and closed issues for duplicates and link related reports.
2. Capture expected/actual behavior, minimal reproduction, affected route/component, OS, and tool versions. Include sanitized [request IDs](api/request-ids.md) for API errors.
3. Identify area and type using the [labeling guide](../CONTRIBUTING.md#issue-labeling-guide); suggest labels if you cannot apply them.
4. Separate setup problems from reproducible defects. Request missing evidence without requesting keys or tokens.
5. Before recommending `good-first-issue`, describe scope, relevant files, acceptance criteria, and verification steps.

## Release validation

1. Review the candidate revision, release notes, configuration changes, migrations, and rollback plan.
2. Run relevant checks above for every changed workspace and inspect required [CI jobs](../.github/workflows/ci.yml). Include backend and Cargo checks explicitly when affected.
3. Exercise creator submission, status tracking, and file comparison in staging using the [user guide examples](user-guide.md#practical-workflow-examples) and [preview deployment guide](deployment/preview-deployments.md).
4. Check frontend health and backend readiness where deployed. For contract changes confirm network, contract IDs, initialization, and chain records using the [deployment guide](deployment.md).
5. Record revision, environment, results, and unresolved blockers before promotion through the [CI/CD process](deployment/ci-cd-pipeline.md).

A local job marked certified does not prove an on-chain certificate exists. `pnpm release` invokes semantic-release and can publish artifacts; it is not a validation command.
