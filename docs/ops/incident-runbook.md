# Production Incident Runbook

Written so an on-call engineer without deep platform knowledge can act.

## Roles

| Role                    | Owner                            | Responsibility                              |
| ----------------------- | -------------------------------- | ------------------------------------------- |
| Incident Commander (IC) | On-call engineer                 | Declares severity, coordinates, makes calls |
| Communications          | Product/maintainer on duty       | Status updates to users and stakeholders    |
| Subject Expert          | Contracts or frontend maintainer | Diagnoses and fixes                         |
| Scribe                  | Anyone available                 | Keeps the timeline in the incident issue    |

## Severity

- **SEV1** – Verification or issuance down for all users, or security breach. Respond immediately.
- **SEV2** – Major feature degraded, workaround exists. Respond within 1 hour.
- **SEV3** – Minor bug, cosmetic. Next business day.

## First 15 minutes

1. Acknowledge the alert; open a GitHub issue labelled `incident`.
2. Assign IC; set severity.
3. Check what changed: `git log -5 origin/main`, recent deploys, recent config changes (`scripts/ops/config-audit.sh show`).
4. If a recent deploy is the likely cause, **roll back first, debug later** (`scripts/deploy/blue-green-deploy.sh` switch back).
5. Post first status update.

## Common incidents

### Frontend down / 5xx

- Check hosting status page and container health: `docker compose ps`, `docker compose logs --tail=100`.
- Run `scripts/ci/smoke-test.sh <url>` to confirm.
- Roll back to the previous blue/green slot.

### Contract calls failing

- Check Stellar network status (status.stellar.org) and RPC endpoint reachability.
- Confirm contract IDs in env config match deployed contracts.
- If caused by a contract upgrade, follow rollback in `docs/deployment/migration-safety.md`.

### Wrong/missing configuration

- Diff current config with the audit log: `scripts/ops/config-audit.sh show`.
- Restore previous values; record the change with `config-audit.sh record`.

### Suspected key compromise / security incident

- Escalate to SEV1. Follow `docs/security/key-management.md` (rotate keys) and `docs/security/smart-contract-audit-runbook.md`.
- Do not discuss details in public channels.

### Failed migration

- Stop further deploys. Run rollback scripts or restore the snapshot (see migration safety doc).

## Resolution

1. Confirm recovery with smoke tests.
2. Post final status update.
3. Within 3 business days: blameless postmortem (timeline, root cause, action items) linked in the incident issue.
