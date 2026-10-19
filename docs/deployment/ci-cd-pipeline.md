# Continuous Deployment Pipeline

This documents the deployment workflow, which builds and deploys the StellarVeriphy frontend. It's separate from the CI workflow (see [`docs/ci/CI.md`](../ci/CI.md)), which only lints/builds/tests — deployment only runs once CI-equivalent checks on `main` have a green history, and doesn't re-run the test suite itself. Closes #271.

## Pipeline overview

```
push to main
     │
     ▼
build-and-push  ──▶  builds the Dockerfile image, pushes to GHCR tagged
                      with the commit SHA and `latest`
     │
     ▼
deploy-staging  ──▶  blue-green deploy to the "staging" GitHub Environment,
                      smoke-tests /api/health, auto-rolls-back on failure
                      (no approval gate — runs unattended)
     │
     ▼
deploy-production ─▶ same image, deployed to the "production" GitHub
                      Environment — gated by that environment's required-
                      reviewers rule (manual approval)
     │
     ▼
notify  ──▶  writes a job summary; pings Slack if SLACK_WEBHOOK_URL is set
```

A separate `rollback` job runs on `workflow_dispatch` with an `rollback_environment` input, independent of the push-triggered path above — use it to flip live traffic back without deploying anything new.

## Required GitHub configuration (one-time, not in this file)

GitHub Environments and their protection rules are repo settings, not something a workflow file can configure on its own behalf — set these up under **Settings → Environments**:

1. Create environment **`staging`**. No protection rules needed — deploys run unattended on every push to `main`.
2. Create environment **`production`**. Add a **required reviewers** protection rule listing whoever should approve production deploys. This is what makes `deploy-production` pause for manual approval; the workflow itself has no approval logic.
3. For each environment, add these **environment-scoped secrets** (same names in both — GitHub resolves them per-environment automatically based on the job's `environment:` field):
   - `DEPLOY_HOST` — SSH host of that environment's deploy target
   - `DEPLOY_USER` — SSH user
   - `DEPLOY_SSH_KEY` — private key for that user (public half installed on the host)
4. For each environment, optionally add the **environment variable** `DEPLOY_URL` (e.g. `https://staging.example.com`) — used for the environment's "view deployment" link and the post-deploy smoke test. If unset, the smoke test step will fail (empty URL), which surfaces as a deploy failure rather than silently skipping — set it before relying on this pipeline.
5. Optionally add the **repository secret** `SLACK_WEBHOOK_URL` for deployment notifications. If unset, the `notify` job still writes a GitHub Step Summary but skips the Slack call.

No secret is required for pushing to GHCR — `build-and-push` uses the workflow's own `GITHUB_TOKEN` with `packages: write` permission (already granted in the workflow's `permissions:` block).

## Deploy target host requirements

The SSH host referenced by `DEPLOY_HOST` must have:

- Docker installed, with the SSH user able to run `docker` (e.g. in the `docker` group).
- nginx installed and reloadable via `nginx -s reload` (or override `NGINX_RELOAD_CMD` as an env var when invoking the script), proxying public traffic to `stellarveriphy_active` — an upstream block the script writes to `/etc/nginx/conf.d/stellarveriphy_active_upstream.conf`. Your main nginx server block needs `proxy_pass http://stellarveriphy_active;` pointed at that upstream.
- Directory `/opt/stellarveriphy/` writable by `DEPLOY_USER` — this is where the deploy script and blue/green state file (`active_color`) live. The workflow syncs the script here via `scp` before every deploy/rollback, so the host never needs manual updates when the script changes.

## Blue-green strategy

See the blue-green deploy script for the implementation. Summary: two containers, `stellarveriphy-blue` and `stellarveriphy-green`, run on fixed host ports (8081/8082 by default). Each deploy starts the _inactive_ color, waits for Docker's own healthcheck (already defined in the `Dockerfile`, hitting `/api/health`) to report `healthy`, and only then flips the nginx upstream + a state file to point at it. If the health check times out, the new container is torn down and the previously-active color is never touched — so a bad deploy never reaches live traffic in the first place.

## Rollback

The step-by-step operator checklist (decide, roll back, verify) is in [`../operations/rollback-checklist.md`](../operations/rollback-checklist.md).

Two distinct paths:

1. **Automatic, during a deploy:** if the new color passes its Docker healthcheck and gets promoted, but the workflow's own post-deploy smoke test (`curl $DEPLOY_URL/api/health`, 5 attempts) still fails, the workflow immediately calls `blue-green-deploy.sh rollback`, which flips nginx back to the previously-active color. This catches failures the container-internal healthcheck can't see (e.g. the host's reverse proxy misrouting).
2. **Manual, any time:** run the `CD` workflow via `workflow_dispatch`, choosing `staging` or `production` in the `rollback_environment` input. This flips live traffic to whatever color isn't currently active, without deploying anything new — use it if a promoted version turns out to be broken after the fact (a bug that passed both healthchecks but shows up under real traffic).

Rollback only works one step back — it flips to "the other color," which is only meaningful if that container is still running. `blue-green-deploy.sh deploy` does not stop the previous color's container after promoting (see the script's final log line), specifically so this stays possible; stop it manually once you're confident the new version is good, or let the next deploy reuse/replace it.

## Notifications

The `notify` job runs regardless of deploy outcome (`if: always()`), writes a per-run summary (staging/production result) to the workflow's GitHub Step Summary, and posts the same summary to Slack if `SLACK_WEBHOOK_URL` is configured.
