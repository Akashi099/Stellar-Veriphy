# Environment drift detection

Drift is when the configuration a deployment runs with is different from the configuration we expect it to have. A common example is a staging container that points at mainnet RPC, or a production host that still has `NEXT_PUBLIC_MOCK_WALLET=true` from a debugging session. `scripts/env-drift.mjs` finds these differences and explains each one.

## How it works

```
config/environments/<env>.json         live values
 (expected, reviewed in PRs)    ──►  ┌──────────────────────────┐
                                     │ GET /api/health/ready    │  running deployment
                                     │   .config                │
                                     ├──────────────────────────┤
                                     │ --env-file <file>        │  env file before deploy
                                     ├──────────────────────────┤
                                     │ --from-process           │  current shell / CI job
                                     └──────────────────────────┘
                                                  │
                                       detectDrift(baseline, live)
                                                  │
                         table or --json report, exit 0 (clean) / 1 (drift) / 2 (error)
```

1. **Baseline.** `config/environments/{staging,production,preview}.json` hold the expected values. They are code: a change to an environment's config is made in a PR that updates the baseline, so the change is reviewed.
2. **Live values.** For a running deployment, the script reads the `config` block of `GET /api/health/ready` (`frontend/app/api/health/ready/route.ts`). That block only exposes public `NEXT_PUBLIC_*` values plus `NODE_ENV`. These values are already shipped to the browser. Secrets are never exposed or compared.
3. **Normalization.** Every source is reduced to the same keys. `NEXT_PUBLIC_RPC_URL` is derived: it is the RPC URL of the active network, so a correct `NEXT_PUBLIC_MAINNET_RPC_URL` on a testnet deployment does not hide a wrong testnet URL. The legacy `NEXT_PUBLIC_STELLAR_NETWORK` is read when `NEXT_PUBLIC_NETWORK` is missing, the same way the app reads it.
4. **Rules.** Each baseline has three rule sets:

| Rule          | Baseline field | Finding     | Meaning                                                                                  |
| ------------- | -------------- | ----------- | ---------------------------------------------------------------------------------------- |
| Exact value   | `expected`     | `mismatch`  | Live value differs from the expected value                                               |
| Must be set   | `required`     | `missing`   | Value is empty. Used for values that differ per deploy, such as contract IDs             |
| Must never be | `forbidden`    | `forbidden` | Value is never allowed here, for example mock wallet in production. Treat as an incident |

Findings are always printed in the same order (`mismatch`, `missing`, `forbidden`; baseline key order within each), so two runs on the same state give the same output and can be diffed.

## Running it

```bash
# Running deployment (URL from the baseline's "url", or override)
pnpm drift:check -- --env staging
node scripts/env-drift.mjs --env staging --url https://staging.stellarveriphy.io

# Before deploying: check the env file you are about to ship
node scripts/env-drift.mjs --env production --env-file .env.production

# Inside a CI job or container shell
node scripts/env-drift.mjs --env preview --from-process

# Review the intended differences between two environments
node scripts/env-drift.mjs --compare staging production

# Machine-readable (dashboards, alerts, PR comments)
node scripts/env-drift.mjs --env staging --json
```

Example output:

```
✗ Drift detected in staging (live deployment http://localhost:3000): 2 finding(s)

kind      key                  expected               actual
--------  -------------------  ---------------------  -------
mismatch  NEXT_PUBLIC_NETWORK  testnet                mainnet
missing   NEXT_PUBLIC_API_URL  <any non-empty value>

mismatch: Update the deployment's env (compose file / host secrets) to the expected value, or update the baseline in the same PR if the change is intended.
missing: Set the variable in the deployment environment and redeploy.
```

| Exit code | Meaning                                                           | Action in automation                |
| --------- | ----------------------------------------------------------------- | ----------------------------------- |
| `0`       | No drift                                                          | none                                |
| `1`       | Drift found                                                       | fail the job / raise an alert       |
| `2`       | Check could not run (unreachable URL, missing baseline, bad args) | alert separately. This is not drift |

## Acting on findings

| Finding                               | First step                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mismatch` on network or RPC URL      | Stop: the deployment may be writing to the wrong chain. Fix the env and redeploy. Then check `docs/operations/deployment-log.md` for when it changed |
| `mismatch` that is an intended change | Update `config/environments/<env>.json` in the same PR as the config change                                                                          |
| `missing` contract ID                 | Set it from the latest entry in `docs/operations/deployment-log.md`                                                                                  |
| `forbidden`                           | Treat as an incident: roll back or fix the env immediately                                                                                           |

## Where it runs

- **Deploy gate:** `scripts/deploy-helper.sh` (`pnpm deploy:check`, `pnpm deploy:staging`, `pnpm deploy:production`) runs the `--env-file` check against `frontend/.env.<environment>` and stops the deploy on drift.
- **After deploy:** `scripts/preview-deploy.sh validate` runs the live check for preview environments (see [preview deployments](../deployment/preview-deployments.md)).
- **Scheduled:** run the live check from cron or a scheduled CI job every 15 minutes per environment. Alert on exit code `1` and, separately, on `2`:

```cron
*/15 * * * * cd /opt/stellar-veriphy && node scripts/env-drift.mjs --env staging --json > /var/log/veriphy/drift-staging.json || logger -t veriphy-drift "staging drift (exit $?)"
```

## Adding a key

1. Expose it in `configSnapshot()` in `frontend/app/api/health/ready/route.ts`. Only add public values.
2. Add it to `snapshotFromEnv()` in `scripts/env-drift.mjs`, so file and process sources match.
3. Add it to `expected`, `required` or `forbidden` in each baseline that cares about it.
