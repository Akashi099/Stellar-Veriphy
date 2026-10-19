# Branch preview deployments

A preview deployment runs a feature branch as its own isolated copy of the app, so reviewers and QA can try the change before it is merged. Each branch gets a stable URL, its own container and its own data. Previews always use **testnet**.

- Script: `scripts/preview-deploy.sh` (`pnpm preview <command>`)
- Compose file: `docker-compose.preview.yml`
- Expected config: `config/environments/preview.json`

## Quick start

```bash
git checkout feature/my-change
pnpm preview up          # build and start; waits until the container is healthy
pnpm preview validate    # automated checks for QA
pnpm preview status      # URL, commit, health
pnpm preview down        # remove it when the PR is merged or closed
```

`pnpm preview list` shows every preview running on the host.

## Workflow

```
feature branch pushed
        │
        ▼
1. pnpm preview up ──► image built from the branch, container "veriphy-preview-<slug>"
        │               on port 4100 + hash(branch) % 900, waits for HEALTHCHECK
        ▼
2. pnpm preview validate ──► health · drift check · smoke routes · upload k6 smoke
        │
        ▼
3. Post the preview URL + commit in the PR ──► QA runs the manual checklist below
        │
        ▼
4. New commits: pnpm preview up again (same URL, rebuilt)
        │
        ▼
5. PR merged/closed: pnpm preview down
```

### 1. Create the preview

1. Check out the branch. The image is built from the working tree, so commit your changes first. The script warns if the tree is dirty, because the preview would not match the commit shown in its labels.
2. Run `pnpm preview up`. The script:
   - turns the branch name into a slug (`feature/Upload-Fix_2` → `feature-upload-fix-2`) and uses it as the compose project name, so previews never collide with each other or with `docker-compose.yml`;
   - picks a port from a hash of the branch name. The same branch always gets the same URL, so links in the PR keep working after a rebuild;
   - builds the production `runtime` image stage, starts it, and waits up to 5 minutes for the container to be healthy (`scripts/check-container-health.sh`). On failure it prints the startup diagnostics (see [DOCKER.md](../../DOCKER.md#startup-diagnostics)).
3. `main` is refused: it goes to staging (`pnpm deploy:staging`).

Options (environment variables):

| Variable                                           | Default                       | Purpose                                                                                      |
| -------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| `PREVIEW_HOST`                                     | `localhost`                   | Hostname in the printed URL. Set it to the shared preview host's name                        |
| `PREVIEW_URL`                                      | `http://$PREVIEW_HOST:<port>` | Full URL, for example behind a reverse proxy (`https://feature-x.preview.stellarveriphy.io`) |
| `PREVIEW_PORT_BASE`                                | `4100`                        | First port of the 900-port preview range                                                     |
| `PREVIEW_MOCK_WALLET`                              | `false`                       | `true` lets QA test without a wallet extension                                               |
| `PREVIEW_{ORACLE,PROVENANCE,REGISTRY}_CONTRACT_ID` | empty                         | Testnet contract IDs (see below)                                                             |

### 2. Contracts for a preview

Most previews only change the frontend, and should point at the shared **staging testnet contracts**. Export the IDs from the latest staging entry in [deployment-log.md](../operations/deployment-log.md) before `up`:

```bash
export PREVIEW_ORACLE_CONTRACT_ID=C...
export PREVIEW_PROVENANCE_CONTRACT_ID=C...
export PREVIEW_REGISTRY_CONTRACT_ID=C...
pnpm preview up
```

When the branch changes a contract, deploy the branch's contracts to **testnet** and point the preview at them. Use the steps in [deployment.md](../deployment.md), or `deploy.sh` for the provenance contract:

```bash
STELLAR_NETWORK=testnet STELLAR_ACCOUNT=<your testnet key> ./deploy.sh
```

Never deploy contracts to mainnet for a preview. The drift check fails if the preview's network is `mainnet`.

### 3. Validate (QA)

`pnpm preview validate` runs the automated checks and exits non-zero if any fails:

| Step                | What it checks                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container health    | Container is `healthy`; prints the readiness report                                                                                                                             |
| Configuration drift | Live config matches `config/environments/preview.json`: testnet, `NODE_ENV=production`, `NEXT_PUBLIC_APP_ENV=preview` ([environment drift](../operations/environment-drift.md)) |
| Smoke routes        | `/`, `/api/health`, `/api/health/ready`, `/verify` return 200 (or a redirect)                                                                                                   |
| Upload flow         | k6 `smoke` profile of the [upload load test](../testing/upload-load-baseline.md): session → chunks → resume → register → complete. Skipped when k6 is not installed             |

Then QA works through the manual checklist and records the result in the PR:

- [ ] PR description has the preview URL and the commit it was built from (`pnpm preview status`), and that commit is the PR's head
- [ ] `pnpm preview validate` passed
- [ ] The changed pages and flows work as the PR describes
- [ ] Wallet connect works on testnet (Freighter set to Testnet), or `PREVIEW_MOCK_WALLET=true` is noted in the PR
- [ ] Upload a file end to end: hash, manifest, verification job queued, certificate page renders
- [ ] Interrupt an upload (reload the tab mid-way) and resume it
- [ ] Error states: invalid file type, oversize file, wallet rejected
- [ ] Mobile width (~400 px) and dark mode for changed UI
- [ ] No new errors in the browser console or in `docker logs veriphy-preview-<slug>-app-1`

### 4. Update and tear down

- New commits: run `pnpm preview up` again. It rebuilds the image in place, and the URL stays the same. Data from earlier runs is lost, because preview data lives inside the container.
- PR merged or closed: run `pnpm preview down`. It removes the container and the preview image. Run `pnpm preview list` regularly on shared hosts and remove stale previews.

## How a preview differs from other environments

|                       | Local dev                                   | **Preview**                                                   | Staging                                              | Production               |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| Built from            | working tree, hot reload                    | feature branch, production build                              | `main`                                               | release tag              |
| Started with          | `pnpm dev:frontend` / compose `dev` profile | `pnpm preview up`                                             | `pnpm deploy:staging` / `docker-compose.staging.yml` | `pnpm deploy:production` |
| `NODE_ENV`            | `development`                               | `production`                                                  | `staging`                                            | `production`             |
| `NEXT_PUBLIC_APP_ENV` | unset                                       | `preview`                                                     | `staging`                                            | unset                    |
| Network               | testnet                                     | **testnet only**                                              | testnet                                              | mainnet                  |
| Contracts             | any                                         | staging testnet contracts, or the branch's own testnet deploy | staging testnet contracts                            | mainnet contracts        |
| Database / cache      | file store (`.data`)                        | file store inside the container; reset on rebuild             | Postgres + Redis                                     | managed                  |
| Data lifetime         | until deleted                               | until rebuild or `down`                                       | persistent volume                                    | persistent               |
| Mock wallet           | allowed                                     | off by default, opt in                                        | off                                                  | forbidden                |
| URL                   | `localhost:3000`                            | `<host>:<4100–4999>`, stable per branch                       | staging domain                                       | public domain            |
| Drift baseline        | none                                        | `preview.json`                                                | `staging.json`                                       | `production.json`        |
| Who uses it           | the author                                  | reviewers, QA                                                 | QA, release checks                                   | users                    |

Differences that matter when testing a preview:

- **Production build.** Previews run `next build` + `next start` like production, so they catch build-only failures and production-only behavior that `pnpm dev` hides.
- **No Postgres or Redis.** Features that need the staging services can only be checked on staging after merge. Note this in the PR.
- **Shared testnet contracts.** Data written to the staging contracts from a preview is visible on staging. Use throwaway test accounts.
- **Ephemeral data.** Do not rely on uploads surviving a rebuild.

## Troubleshooting

| Symptom                               | Fix                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `up` stops at the health wait         | Read the `[startup]` lines it prints. See [DOCKER.md](../../DOCKER.md#startup-diagnostics)                                |
| `port is already allocated`           | Another branch hashed to the same port. Run `pnpm preview list`, then remove the stale preview or set `PREVIEW_PORT_BASE` |
| Drift: `NEXT_PUBLIC_NETWORK` mismatch | An exported variable overrode the compose file. Unset it and run `up` again                                               |
| Preview shows old code                | You ran `up` on a different branch. Check `pnpm preview status` for the commit                                            |
