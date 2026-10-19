# Deployment Log

This file records every contract deployment for StellarVeriphy. Keeping it accurate is the single most important prerequisite for a safe rollback: you cannot revert consumers to an old contract ID you didn't write down.

**Rules:**
- Add an entry **immediately** after every `stellar contract deploy`, before doing anything else.
- Never delete old entries — they are the rollback record.
- For mainnet deployments, include the second-approver's GitHub handle.

---

## Format

```
## <contract> — <network> — <date>

- **Contract ID:** C...
- **WASM hash:** (output of `stellar contract info --id <id>`, or git commit)
- **Deployed by:** @github-handle
- **Approved by:** @github-handle (mainnet only)
- **Reason:** Brief description of why this deploy happened
- **Migration doc:** docs/operations/migration-<contract>.md (or "N/A — initial deploy")
- **Status:** Active | Superseded by <later entry date>
- **Notes:** Anything relevant — e.g. consumer configs updated, data migrated
```

---

## Entries

### oracle — testnet — 2026-09-27

- **Contract ID:** *(to be filled in on first deploy)*
- **WASM hash:** *(to be filled in)*
- **Deployed by:** *(deployer)*
- **Reason:** Initial testnet deployment
- **Migration doc:** N/A — initial deploy
- **Status:** Active
- **Notes:** First deployment of the oracle contract to testnet. No prior contract ID to record as predecessor.

---

### provenance — testnet — 2026-09-27

- **Contract ID:** *(to be filled in on first deploy)*
- **WASM hash:** *(to be filled in)*
- **Deployed by:** *(deployer)*
- **Reason:** Initial testnet deployment
- **Migration doc:** N/A — initial deploy
- **Status:** Active
- **Notes:** First deployment of the provenance contract to testnet.

---

### registry — testnet — 2026-09-27

- **Contract ID:** *(to be filled in on first deploy)*
- **WASM hash:** *(to be filled in)*
- **Deployed by:** *(deployer)*
- **Reason:** Initial testnet deployment
- **Migration doc:** N/A — initial deploy
- **Status:** Active
- **Notes:** First deployment of the registry contract to testnet. Note the registry admin gap documented in `docs/deployment.md#contract-initialization` — resolve before mainnet.

---

<!-- Add new entries above this line, most recent first -->
