# Data Retention Policy

Companion to [`privacy-policy.md`](privacy-policy.md). States how long each category of data StellarVeriphy touches is retained, and why.

## Local browser data (client-side, `localStorage`)

| Data                                                                                         | Retention                                                              | Enforced by                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Security audit log entries                                                                   | 90 days, then auto-pruned on next app load                             | `RETENTION_DAYS` in `frontend/lib/security/auditLogger.ts` (`pruneExpiredEntries`)                                                      |
| Mock API keys (hash + prefix only, see [`key-management.md`](../security/key-management.md)) | Until the user revokes/deletes it, or its configured expiration passes | User action in `frontend/components/APIKeyManagement.tsx`; expired keys are not auto-purged from storage today, only treated as invalid |
| Form drafts (manifest builder, issue report)                                                 | Until the form is submitted or the user clears browser storage         | `frontend/hooks/useAutoSave.ts`                                                                                                         |
| Theme / keyboard-shortcut / notification preferences                                         | Indefinite, until changed or storage is cleared                        | Respective context/hook                                                                                                                 |
| Consent banner acknowledgment                                                                | Indefinite, until storage is cleared                                   | `frontend/components/ConsentBanner.tsx`                                                                                                 |

All of the above is deletable on demand via "Delete all my data" on [`/privacy`](../../frontend/app/privacy/page.tsx), which clears this origin's entire `localStorage` — see [`privacy-policy.md`](privacy-policy.md#manage-your-data).

## On-chain data

Verification requests, provenance certificates, and registry entries are retained **permanently** on the Stellar ledger once confirmed — this is inherent to a public blockchain and cannot be shortened by StellarVeriphy or the user. See [`privacy-policy.md`](privacy-policy.md#blockchain-data-is-public).

## CI/CD and infrastructure logs

- **GitHub Actions workflow logs and artifacts:** retained per the `retention-days` set on each `actions/upload-artifact` step in `.github/workflows/*.yml` (7–30 days depending on the artifact — see [`docs/ci/CI.md`](../ci/CI.md)) plus GitHub's own default workflow-run log retention (90 days on public repos, configurable in repo settings).
- **Deployment records** (who approved a production deploy, when): retained as long as GitHub retains the Environment's deployment history — see [`docs/deployment/ci-cd-pipeline.md`](../deployment/ci-cd-pipeline.md).

## Reviewing this policy

Revisit retention windows whenever a new persistent data category is added to the app (a new `localStorage` key, a new CI artifact, a new backend data store) — this table should stay a complete inventory, not just the categories that existed when it was written.

## Compliance audit trail

Compliance-relevant actions (GDPR/CCPA data subject rights, content disputes, DMCA notices, policy changes) are logged in a separate compliance audit trail (`frontend/lib/compliance/complianceAuditTrail.ts`). These entries are retained for **7 years** (`COMPLIANCE_RETENTION_YEARS = 7`) to satisfy typical legal and regulatory record-keeping obligations. See [`compliance-audit-trail.md`](compliance-audit-trail.md) for full details.
