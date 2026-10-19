#!/usr/bin/env bash
# =============================================================================
# upgrade-safety-check.test.sh (#806)
#
# Self-test for the upgrade safety tooling. It runs the real scripts in a
# temporary repository, applies one change at a time to the registry baseline,
# and checks the exit code and key output. Each failure class the checker claims
# to catch has a scenario here, so a regression in the checker fails this test.
#
# Usage: bash scripts/tests/upgrade-safety-check.test.sh
# Exit code: 0 when every scenario behaves as expected, 1 otherwise.
# =============================================================================

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
PASSED=0
FAILED=0

# ---------------------------------------------------------------------------
# Fixture repository: scripts, the real registry source, and a deployment log
# ---------------------------------------------------------------------------
ROOT="$WORK/repo"
mkdir -p "$ROOT/scripts" "$ROOT/contracts/registry/src" "$ROOT/docs/operations"
cp "$REPO/scripts/contract-surface.sh" "$REPO/scripts/snapshot-contract-state.sh" \
   "$REPO/scripts/upgrade-safety-check.sh" "$ROOT/scripts/"
cp "$REPO/contracts/registry/src/lib.rs" "$ROOT/contracts/registry/src/lib.rs"
head -c 2048 /dev/urandom > "$ROOT/new.wasm"
printf '## registry — testnet — 2026-10-01\n\n- **Contract ID:** CTEST\n' > "$ROOT/docs/operations/deployment-log.md"

cd "$ROOT" || exit 1

# Restores the baseline from the source, and removes any migration doc from a previous scenario.
reset_state() {
  rm -f docs/operations/migration-registry.md
  bash scripts/snapshot-contract-state.sh registry >/dev/null 2>&1
}

# Writes a migration doc that has every required section and names each given token.
write_migration_doc() {
  {
    echo "# Migration Plan: registry — test"
    echo
    echo "## Storage compatibility analysis"
    echo
    for token in "$@"; do echo "- \`$token\`: reviewed"; done
    echo
    echo "## Pre-migration"; echo; echo "Snapshot taken."; echo
    echo "## Migration steps"; echo; echo "Redeploy."; echo
    echo "## Post-migration"; echo; echo "Verify."; echo
    echo "## Rollback"; echo; echo "Repoint consumers."
  } > docs/operations/migration-registry.md
}

# Runs the checker and records its output and exit code in LAST_OUT and LAST_EXIT.
run_check() {
  if LAST_OUT=$(bash scripts/upgrade-safety-check.sh registry - new.wasm "$@" 2>&1); then
    LAST_EXIT=0
  else
    LAST_EXIT=$?
  fi
  LAST_OUT=$(sed 's/\x1b\[[0-9;]*m//g' <<<"$LAST_OUT")
}

# expect <description> <expected exit> <grep pattern or -> [network args...]
expect() {
  local description="$1" expected="$2" pattern="$3"
  shift 3
  run_check "$@"

  local ok=1
  [[ "$LAST_EXIT" -eq "$expected" ]] || ok=0
  if [[ "$pattern" != "-" ]] && ! grep -qF -- "$pattern" <<<"$LAST_OUT"; then ok=0; fi

  if [[ "$ok" -eq 1 ]]; then
    echo -e "${GREEN}ok${NC}    $description"
    PASSED=$((PASSED+1))
  else
    echo -e "${RED}FAIL${NC}  $description (exit $LAST_EXIT, expected $expected; pattern: $pattern)"
    sed 's/^/        /' <<<"$LAST_OUT" | tail -25
    FAILED=$((FAILED+1))
  fi
}

echo "Upgrade safety self-test (registry fixture)"
echo ""

# 1. Unchanged source passes.
reset_state
expect "unchanged source passes on testnet" 0 "ALL CHECKS PASSED" testnet

# 2. A removed DataKey variant is a risk and needs a migration doc.
reset_state
printf 'GhostKey\n' >> docs/operations/storage-keys-registry.txt
expect "removed DataKey variant is flagged and blocks without a migration doc" 1 "DataKey::GhostKey" testnet
expect "  ...and the block is for the missing migration doc" 1 "Migration doc REQUIRED because risky changes were found" testnet

reset_state
printf 'GhostKey\n' >> docs/operations/storage-keys-registry.txt
write_migration_doc "DataKey::GhostKey"
expect "removed DataKey variant passes once documented" 0 "ALL CHECKS PASSED" testnet

# 3. A removed or changed persisted struct field is a risk.
reset_state
printf 'ProviderInfo\tpub ghost_field: u32\n' >> docs/operations/struct-snapshot-registry.txt
expect "removed struct field is flagged" 1 "ProviderInfo.ghost_field" testnet

reset_state
printf 'ProviderInfo\tpub ghost_field: u32\n' >> docs/operations/struct-snapshot-registry.txt
write_migration_doc "ProviderInfo.ghost_field"
expect "removed struct field passes once documented" 0 "ALL CHECKS PASSED" testnet

# 4. A new required field is a risk. A new Option field is not.
reset_state
sed -i '/^ProviderInfo\tpub name: String$/d' docs/operations/struct-snapshot-registry.txt
expect "new required struct field is flagged" 1 "ProviderInfo.name is a new required field" testnet

reset_state
sed -i '/^ProviderInfo\tpub website: Option<String>$/d' docs/operations/struct-snapshot-registry.txt
expect "new optional struct field is allowed" 0 "ALL CHECKS PASSED" testnet

# 5. A removed public entry point is a risk.
reset_state
printf 'ghost_fn\n' >> docs/operations/api-registry.txt
expect "removed entry point is flagged" 1 "public function ghost_fn was removed" testnet

reset_state
printf 'ghost_fn\n' >> docs/operations/api-registry.txt
write_migration_doc "ghost_fn"
expect "removed entry point passes once documented" 0 "ALL CHECKS PASSED" testnet

# 6. A risk that the migration doc does not name blocks, even when the doc exists.
reset_state
printf 'GhostKey\n' >> docs/operations/storage-keys-registry.txt
write_migration_doc "something-else"
expect "undocumented risk blocks even with a migration doc" 1 "Risk not documented: DataKey::GhostKey" testnet

# 7. A missing baseline blocks. Storage compatibility cannot be checked without one.
reset_state
rm -f docs/operations/storage-keys-registry.txt
expect "missing storage key baseline blocks" 1 "No storage key baseline" testnet

reset_state
rm -f docs/operations/api-registry.txt
expect "missing entry point baseline blocks" 1 "No entry point baseline" testnet

# 8. Mainnet needs a migration doc and an explicit --confirm.
reset_state
write_migration_doc
expect "mainnet without --confirm is blocked" 1 "requires explicit confirmation" mainnet
expect "mainnet with --confirm and a migration doc passes" 0 "ALL CHECKS PASSED" mainnet --confirm

reset_state
expect "mainnet without a migration doc is blocked" 1 "Migration doc REQUIRED for mainnet" mainnet --confirm

# 9. An unknown contract name is a usage error (exit 2).
reset_state
if LAST_OUT=$(bash scripts/upgrade-safety-check.sh nonsense - new.wasm testnet 2>&1); then
  LAST_EXIT=0
else
  LAST_EXIT=$?
fi
if [[ "$LAST_EXIT" -eq 2 ]] && grep -qF "Unknown contract" <<<"$LAST_OUT"; then
  echo -e "${GREEN}ok${NC}    unknown contract is a usage error"
  PASSED=$((PASSED+1))
else
  echo -e "${RED}FAIL${NC}  unknown contract should exit 2 (exit $LAST_EXIT)"
  FAILED=$((FAILED+1))
fi

echo ""
echo "Passed: $PASSED  Failed: $FAILED"
[[ "$FAILED" -eq 0 ]]
