# Verification Policy Governance (#792)

> **See also:** [`governance-framework.md`](./governance-framework.md) (off-chain review process), [`registry-governance.md`](./registry-governance.md) (registry multisig), `contracts/oracle/src/lib.rs`

This page describes who may change the oracle's **verification policy** on-chain, how a change is authorised, and how each change can be audited afterwards.

## What counts as verification policy

| Policy                       | Entry point                                                       | Event topic 2       | Validation      |
| ---------------------------- | ----------------------------------------------------------------- | ------------------- | --------------- |
| Request TTLs per priority    | `update_ttl_config(default, high, low)`                           | `request_ttl`       | every value > 0 |
| Expiration warning threshold | `update_warning_threshold(ledgers)`                               | `warning_threshold` | > 0             |
| Provider SLA targets         | `set_provider_sla(provider, response_s, uptime_pct, success_pct)` | `provider_sla`      | none            |

These settings decide when requests expire, when callers are warned, and when providers are suspended for missing their SLA. A change to any of them changes verification outcomes, so they all go through the same authority check.

**Not policy, stays with the admin:** `pause` / `unpause` (an incident circuit breaker that must act at once), provider registration, staking, disputes and the delegate flows.

## Roles

| Role                  | Stored at                        | Can                                                                                                                      |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Admin**             | `DataKey::Admin` (set by `init`) | Change policy _only while no governance address is set_. Make the first `set_policy_governance` hand-off. Pause/unpause. |
| **Policy governance** | `DataKey::PolicyGovernance`      | Change policy. Hand governance to a new address.                                                                         |

The **policy authority** is the governance address if one is set, otherwise the admin. Each policy entry point calls `require_policy_authority`, which resolves this address and calls `require_auth()` on it. No other address is accepted. The rule is the same for every policy entry point.

The governance address is any Soroban `Address`, so it can be a multisig account, the registry's proposal flow, or a dedicated governance contract. Contract addresses authorise through their own `__check_auth`, so the oracle does not need to know how governance decides.

## Flows

### 1. Before governance is set (default after `init`)

```
admin ──update_ttl_config──▶ oracle
        require_auth(admin) ✓
        write RequestTTL
        PolicyVersion += 1
        emit policy_changed(request_ttl) → (version, admin)
```

### 2. Hand-off to governance

```
admin ──set_policy_governance(G)──▶ oracle
        require_auth(admin) ✓
        PolicyGovernance = G
        emit policy_gov_set → (admin, G)
```

After this the admin can no longer change policy. A call signed only by the admin fails authorisation and leaves state untouched.

### 3. Policy change under governance

```
G ──update_warning_threshold(40)──▶ oracle
    require_auth(G) ✓
    write ExpirationWarningLedgers
    PolicyVersion += 1
    emit policy_changed(warning_threshold) → (version, G)
```

### 4. Rotating governance

`set_policy_governance(G2)` must be signed by the current governance `G`. Handing governance to the current holder returns `PolicyGovernanceUnchanged` (error 23). No call returns control to the admin, so moving governance back to the admin's address has to be a deliberate governance decision.

## Determinism and auditability

- **One authority per call.** The authority is read from instance storage, with no time, ledger or caller-dependent branches. The same state and inputs always give the same result.
- **Validation before writes.** Invalid inputs return `InvalidState` before any write, so a rejected change never bumps the version or emits an event.
- **Monotonic version.** `get_policy_version()` counts every applied change since `init`. Indexers can spot a missed event because the version in each `policy_changed` payload increases by exactly 1.
- **Attributed events.** Every change emits `("policy_changed", <policy>)` with data `(version: u32, authority: Address)`, and every hand-off emits `("policy_gov_set",)` with data `(previous_authority, new_governance)`. Replaying these events in ledger order rebuilds the full history of who changed what.

Reading the current state:

```bash
stellar contract invoke --id <ORACLE_ID> --network testnet -- get_policy_governance
stellar contract invoke --id <ORACLE_ID> --network testnet -- get_policy_version
```

## Operational guidance

1. Deploy and `init` the oracle with an operator admin. Tune policy during bring-up.
2. Before production traffic, call `set_policy_governance` with the multisig or governance contract address. Record the `policy_gov_set` event in the release notes.
3. From then on, raise policy changes through the review path in [`governance-framework.md`](./governance-framework.md). Critical impact applies to any change that shortens TTLs or lowers SLA targets. Execute the change only after it is approved.
4. Alert on any `policy_changed` event whose authority is not the expected governance address, and on any gap in the version sequence.

## Tests

`contracts/oracle/src/test.rs`, section "#792 verification policy governance":

- the admin is the authority by default and each change bumps the version
- after hand-off, changes are authorised by governance
- an admin-only signature is rejected after hand-off and state is unchanged
- handing governance to the current holder is rejected
- an invalid change does not bump the version
