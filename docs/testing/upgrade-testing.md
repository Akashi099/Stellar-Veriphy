# Contract Upgrade Testing

This repository intentionally does not implement a Soroban in-place contract upgrade mechanism today. The deployment docs explicitly note that the deployed contracts are immutable and that rollback means redeploying a new contract instance and repointing consumers, not mutating the original contract in place.

That means the upgrade-safety tests here validate the operational invariants that matter even without a true upgrade hook:

- state remains readable across admin-driven changes,
- authorization is enforced for privileged transitions,
- historical certificate data remains stable after reconfiguration,
- rollback is handled as a redeploy + migration process rather than an in-place revert.

## Test coverage

### State migration

The test suite verifies that existing certificate records survive later administrative changes and continue to be readable after configuration updates. This is the closest equivalent to a migration safety test in a contract model that lacks an upgrade entry point.

### Backward compatibility

The tests confirm that previously minted certificate data remains valid and accessible after a new admin is set. In a real upgradeable contract, this corresponds to ensuring old data keys and stored objects remain readable by the new logic.

### Upgrade authorization

The contract requires an authenticated oracle for privileged admin transitions. Tests assert that unauthorized callers cannot set the admin and that the state remains unchanged when authorization fails.

### Rollback scenarios

Because Soroban contracts here are immutable, rollback is modelled as a redeploy strategy rather than a contract rollback. The documentation and tests intentionally treat rollback as:

1. fix the bug,
2. deploy a fresh contract instance,
3. migrate or reissue state where needed,
4. repoint the application to the new contract ID.

This avoids false assumptions that an in-place revert is possible.

## Why these tests are relevant

Even without contract upgrade hooks, the application still needs to reason about:

- identity and auth boundaries,
- state continuity over time,
- clear rollback strategy for production incidents,
- operational discipline when a contract fix requires a new deployment.

These tests codify that operational model and make the repository’s current risk posture explicit.
