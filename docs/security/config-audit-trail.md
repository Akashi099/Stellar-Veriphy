# Environment Configuration Audit Trail

`scripts/ops/config-audit.sh` records every environment configuration change with timestamp (UTC) and owner.

- **Format**: JSON Lines (`logs/config-audit.jsonl`, override with `CONFIG_AUDIT_LOG`) — greppable and ingestible by log tooling.
- **Owner**: `CONFIG_AUDIT_OWNER`, else git email, else OS user.
- **Masking**: keys matching `SECRET|KEY|TOKEN|PASSWORD|PRIVATE|CREDENTIAL` are fully redacted; other values longer than 8 chars are truncated (`abcd…yz`).
- **Retention**: keep at least 1 year; ship to central log storage or archive monthly. Do not commit the log to git.

```bash
scripts/ops/config-audit.sh record STELLAR_NETWORK mainnet production
scripts/ops/config-audit.sh diff .env.old .env production
scripts/ops/config-audit.sh show 50
```
