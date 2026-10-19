# Deployment rollback checklist

Use this when a deployment or configuration change has made things worse and the fastest safe fix is to go back. Work top to bottom and tick each box; don't skip the verification section, because a rollback that wasn't checked is just a second unverified deploy.

Background reading, if you have time: [CI/CD pipeline rollback](../deployment/ci-cd-pipeline.md#rollback) (frontend blue/green), [contract rollback procedures](../deployment.md#rollback-procedures), and the [deployment log](deployment-log.md).

## 0. Decide: roll back or fix forward?

Roll back when **any** of these is true:

- [ ] Users are affected now (errors, failed verifications, broken pages) and the cause isn't understood within ~15 minutes.
- [ ] `/health/ready` is returning `503`, or the [infrastructure health dashboard](infrastructure-dashboard.md) shows an app service DOWN since the deploy.
- [ ] The change touched configuration or secrets and you can't tell which value is wrong.

Fix forward instead when the fix is a one-line, already-reviewed change **and** the previous version is known to be incompatible with data written since the deploy.

## 1. Before touching anything

- [ ] Announce in the team channel: what's broken, what you're about to roll back, who is driving. One driver at a time.
- [ ] Pause further merges to `main` so CD doesn't redeploy the bad version over your rollback.
- [ ] Identify what changed, using the deploy that started the incident:
  - Frontend/API image: CD workflow run, image tag, and the currently active color (`cat /opt/stellarveriphy/active_color` on the host).
  - Configuration: which env vars / secrets changed and their previous values.
  - Contracts: the new and previous contract IDs from [deployment-log.md](deployment-log.md).
  - Database: whether the deploy ran a migration, and whether it's reversible (see [migration-template.md](migration-template.md)).
- [ ] Capture evidence while it exists: failing request IDs, `GET /health` output, error-tracker links, container logs (`docker logs <container> --since 30m > incident.log`).

## 2. Roll back, in this order

Go back in the reverse order things were changed. Skip sections that don't apply.

### 2a. Configuration

- [ ] Restore previous values for every env var / secret changed in the deploy (GitHub **Settings → Secrets and variables → Actions** for CI-held secrets; the host's env file for runtime ones).
- [ ] Restart only the affected service so it re-reads its environment.
- [ ] If a Stellar network URL or passphrase changed, confirm `GET /health` no longer reports `reason: misconfigured`.

### 2b. Frontend / API (blue-green)

- [ ] Confirm the previous color's container is still running: `docker ps --filter name=stellarveriphy-`. Rollback can only go one step back; if it was stopped, redeploy the last good image tag with `blue-green-deploy.sh deploy <image>` instead.
- [ ] Flip traffic: run the **CD** workflow via `workflow_dispatch` with `rollback_environment` = `staging` or `production`. On the host, the equivalent is `scripts/deploy/blue-green-deploy.sh rollback`.
- [ ] Confirm `active_color` now names the previous color and nginx reloaded without errors.

### 2c. Database

- [ ] If the deploy ran a reversible migration and the old code can't read the new schema, run the down migration. Take a backup first (`pg_dump` / `mongodump`) even if you have scheduled backups.
- [ ] If the migration isn't reversible, **stop** and restore from the pre-deploy backup only with a second operator's agreement. Data written since the deploy will be lost; record what was lost.
- [ ] Staging only: if the data is junk anyway, `scripts/reset-staging.sh --yes` gets you back to a known state.

### 2d. Contracts

Soroban contracts here are immutable, so "rollback" means pointing consumers back at the previous contract ID, not undeploying.

- [ ] Look up the previous contract ID in [deployment-log.md](deployment-log.md) and confirm it's still live: `stellar contract info --id <previous-id> --network <network>`.
- [ ] Repoint consumers (frontend config, oracle worker, backend) to the previous ID and redeploy/restart them.
- [ ] Note in the deployment log that the new ID is no longer active and why. Never delete the entry.
- [ ] Decide what happens to state written to the new contract while it was live (it stays on-chain; reissuing under the old contract is an app-level migration).

## 3. Verify after rollback

Don't close the incident until every box here is ticked.

- [ ] `GET /health/live` returns `200` and `GET /health/ready` returns `200`.
- [ ] `GET /health` overall status is `up` (or `degraded` only for a dependency that was already degraded before the deploy).
- [ ] `curl -f $DEPLOY_URL/api/health` passes from outside the host (proves the proxy is routing to the right color).
- [ ] [Infrastructure health dashboard](infrastructure-dashboard.md): every tile UP, consecutive failures back to 0, no new failure reasons in the last 5 minutes.
- [ ] Walk the critical path by hand: open the home page, verify an existing certificate, and (on staging) submit a new verification.
- [ ] For a contract rollback: run `scripts/verify-deployment.sh <contract> <previous-id> <network>` against the restored contract ID (see also [Verification process](../deployment.md#verification-process)).
- [ ] Error rate in the error tracker is back to the pre-deploy baseline.
- [ ] Watch for 15 minutes before declaring it resolved.

## 4. Afterwards

- [ ] Announce that the rollback is complete and verified, with the version now live.
- [ ] Re-enable merges only once the bad change is reverted on `main` (or a fix is merged), so the next CD run doesn't reintroduce it.
- [ ] Stop the bad color's container once you're confident you won't need to flip forward again.
- [ ] Update [deployment-log.md](deployment-log.md) for any contract changes.
- [ ] Open an issue for the root cause and write a short incident note: timeline, impact, what the rollback did, and what would have caught it earlier.
