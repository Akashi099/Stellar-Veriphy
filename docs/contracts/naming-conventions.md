# Contract Function Naming Conventions (#791)

This page sets the naming rules for public methods on the `oracle`, `provenance`
and `registry` contracts, lists the names that did not follow them, and records
what was done about each one. Read it before adding a new public method.

## Conventions

| Pattern | Use for | Examples |
|---|---|---|
| `init` | One-time setup. Fails or panics on a second call. | `oracle.init`, `registry.init`, `provenance.init` |
| `get_<noun>` | Read one record by key. Returns `Option<T>` or `Result<T, Error>`, never panics on a missing key. | `get_certificate`, `get_dispute`, `get_provider_sla` |
| `get_<plural>_by_<field>` | Read an index. Returns `Vec<T>`, empty when nothing matches. | `get_providers_by_tier`, `get_certificates_by_tag` |
| `is_<adjective>` / `has_<noun>` | Boolean checks. Never write state. | `is_paused`, `is_provider`, `has_capacity` |
| `add_<noun>` / `remove_<noun>` | Insert into / delete from a set the contract owns. | `add_provider`, `remove_tag` |
| `set_<noun>` | Replace a per-entity value. | `set_provider_tier`, `set_expiration` |
| `update_<noun>` | Change a contract-wide setting or policy. | `update_ttl_config`, `update_warning_threshold` |
| `record_<event>` | Append an observation (metrics, audit trails). | `record_verification`, `record_rollback` |
| `<verb>_<noun>` | State transitions on one entity. | `revoke_certificate`, `resolve_dispute`, `cancel_request` |

Other rules:

- **Name by what is returned.** A getter is named after the type it returns. `get_provider_metrics` returning `ProviderSLA` is the failure this rule prevents.
- **Same concept, same name across contracts.** If two contracts expose the same operation, they use the same name (`init`, `get_admin`, `is_provider`).
- **No bare verbs.** `get`, `register` and `submit` alone are ambiguous once a contract has more than one entity type. Always include the noun.
- **Soroban limit.** Function names must be at most 32 characters.

## Deprecation policy

Renaming a public contract method is a breaking change for every deployed caller, so names are never removed in place. Instead:

1. Add the canonical name with the real implementation.
2. Turn the old name into a thin alias that calls the canonical one, and mark its doc comment `Deprecated (#issue)` with the replacement.
3. Update in-repo callers, docs and examples to the canonical name.
4. Remove the alias only in a release that also redeploys the contract, and list the removal in `CHANGELOG.md`.

## Inventory

| Contract | Old name | Problem | Canonical name | Status |
|---|---|---|---|---|
| oracle | `get_provider_metrics` | Returns `ProviderSLA`, while `ProviderMetrics` is returned by `get_verification_metrics`. | `get_provider_sla` | Alias kept, deprecated |
| provenance | `get` | Bare verb; panics on a missing id. | `get_certificate` (returns `CertificateNotFound`) | Kept, deprecated |
| provenance | `initialize` | Oracle and registry use `init`. | `init` | Alias kept |
| registry | `register` | Bare verb; does not check the stored admin; writes a key that `is_tee_hash_approved` never reads. | `add_tee_hash` | Kept, deprecated |
| registry | `is_approved` | Only sees hashes written by the legacy `register`. | `is_tee_hash_approved` | Kept, deprecated |

Known overlaps that are **intentional** and stay as they are:

- `is_provider` exists on both oracle (keyed by `Address`) and registry (keyed by the provider's `BytesN<32>` public key). The oracle calls the registry's version by name during attestation, so the two must not be merged.
- `check_expiration_warning` exists on both oracle (requests) and provenance (certificates). Each one acts on the only expiring entity in its contract.
- `get_admin` exists on registry and provenance with the same signature.

## Downstream caller review

Callers checked for each changed name:

| Caller | Uses | Action |
|---|---|---|
| `contracts/oracle/src/lib.rs` (cross-contract) | `registry.is_tee_hash_approved`, `registry.is_provider` | None — canonical names, unchanged. |
| `contracts/registry/src/lib.rs` (`ProvenanceClient`) | `provenance.mint` | None. |
| `contracts/oracle/src/test.rs` | `get_provider_metrics` | Still compiles via the alias; new test asserts the alias matches `get_provider_sla`. |
| `contracts/provenance/src/*tests.rs`, `deploy.sh` | `initialize` | Still works; new test asserts `init` and `initialize` share the one-time guard. |
| `backend/`, `frontend/`, `packages/shared/` | None of the changed names | None — off-chain code reads events, not these getters. |
| `docs/deployment.md`, `docs/deployment-guide.md` | `register`, `is_approved`, `get` | Updated to point at the canonical names. |

## Adding a new method

Checklist for reviewers:

- [ ] Name matches one of the patterns above.
- [ ] Getter name matches the returned type.
- [ ] Missing keys return `Option` / `Result`, not a panic.
- [ ] If the same operation exists on another contract, the name matches.
- [ ] Name is 32 characters or fewer.
