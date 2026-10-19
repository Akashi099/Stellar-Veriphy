#!/usr/bin/env bash
# =============================================================================
# upgrade-safety-check.sh
#
# Pre-upgrade safety validation for StellarVeriphy Soroban contracts.
#
# Usage:
#   ./scripts/upgrade-safety-check.sh <contract> <old_wasm> <new_wasm> [network] [--confirm]
#
#   old_wasm   — path to the currently-deployed WASM, or "-" to skip the compatibility check
#   new_wasm   — path to the candidate WASM
#   network    — testnet | mainnet (default: testnet)
#
# Exit codes:
#   0  — all checks passed; safe to proceed
#   1  — one or more checks failed; do NOT deploy until resolved
#   2  — usage error
#
# The source is compared with the baselines written by snapshot-contract-state.sh
# (docs/operations/{storage-keys,struct-snapshot,api}-<contract>.txt). Each change
# that could break existing data or existing callers is flagged as RISK:
#   - a removed DataKey variant (stored data under it becomes unreachable)
#   - a removed or changed persisted struct field, or a non-Option field added
#   - a removed public entry point (existing clients fail)
# Every RISK must be named in the migration doc, and a migration doc is required
# whenever RISK is present, on both networks.
#
# What it checks:
#   1. WASM file existence and size
#   2. Storage keys: baseline present; removed DataKey variants are RISK
#   3. Persisted struct fields: baseline present; removed, changed and added fields are RISK
#   4. Entry points: baseline present; removed public functions are RISK
#   5. Migration doc: required on mainnet and whenever RISK is found; sections present;
#      every RISK named in it
#   6. Rollback feasibility (deployment log and rollback procedure)
#   7. Admin / initialise guard present in new contract source
#   8. Network-specific safety gate (mainnet requires --confirm)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=contract-surface.sh
source "$SCRIPT_DIR/contract-surface.sh"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'

pass()  { echo -e "${GREEN}[PASS]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; FAILED=$((FAILED+1)); }
info()  { echo -e "       $*"; }

FAILED=0
# Tokens for each risky change, e.g. "DataKey::Old", "ProviderInfo.field", "fn old_entry".
RISK_TOKENS=()
risk() {
  local token="$1" message="$2"
  RISK_TOKENS+=("$token")
  warn "RISK  $message  [$token]"
}

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <contract> <old_wasm|-> <new_wasm> [network] [--confirm]"
  exit 2
fi

CONTRACT="$1"
OLD_WASM="$2"
NEW_WASM="$3"
NETWORK="${4:-testnet}"
CONFIRM="${5:-}"

case "$CONTRACT" in
  oracle|provenance|registry) ;;
  *) echo "Unknown contract '$CONTRACT'. Must be one of: oracle provenance registry"; exit 2 ;;
esac

CONTRACT_SRC="contracts/${CONTRACT}/src/lib.rs"
MIGRATION_DOC="docs/operations/migration-${CONTRACT}.md"
DEPLOYMENT_LOG="docs/operations/deployment-log.md"
KEYS_BASELINE="docs/operations/storage-keys-${CONTRACT}.txt"
STRUCT_BASELINE="docs/operations/struct-snapshot-${CONTRACT}.txt"
API_BASELINE="docs/operations/api-${CONTRACT}.txt"

echo ""
echo "================================================================"
echo "  StellarVeriphy Contract Upgrade Safety Check"
echo "  Contract : $CONTRACT"
echo "  Network  : $NETWORK"
echo "  New WASM : $NEW_WASM"
echo "================================================================"
echo ""

# ---------------------------------------------------------------------------
# Check 1 — WASM file existence
# ---------------------------------------------------------------------------
echo "--- Check 1: WASM file existence ---"

if [[ ! -f "$NEW_WASM" ]]; then
  fail "New WASM not found at: $NEW_WASM"
  info "Build with: cd contracts/$CONTRACT && stellar contract build"
else
  SIZE=$(wc -c < "$NEW_WASM")
  if [[ "$SIZE" -lt 100 ]]; then
    fail "New WASM is suspiciously small ($SIZE bytes) — likely an empty file"
  else
    pass "New WASM found ($SIZE bytes)"
  fi
fi

if [[ "$OLD_WASM" != "-" ]]; then
  if [[ ! -f "$OLD_WASM" ]]; then
    fail "Old WASM not found at: $OLD_WASM (pass \"-\" to skip compatibility check)"
  else
    pass "Old WASM found ($(wc -c < "$OLD_WASM") bytes)"
  fi
fi

# ---------------------------------------------------------------------------
# Check 2 — Storage keys
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 2: Storage key compatibility (DataKey diff) ---"

if [[ ! -f "$CONTRACT_SRC" ]]; then
  fail "Contract source not found at $CONTRACT_SRC"
elif [[ ! -f "$KEYS_BASELINE" ]]; then
  fail "No storage key baseline at $KEYS_BASELINE — storage compatibility cannot be verified"
  info "Check out the currently-deployed version, then run: ./scripts/snapshot-contract-state.sh $CONTRACT"
else
  CURRENT_KEYS=$(surface_datakeys "$CONTRACT_SRC")
  pass "Found $(grep -c . <<<"$CURRENT_KEYS" || true) DataKey variants in $CONTRACT source"

  REMOVED_KEYS=0
  while IFS= read -r key; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    if ! grep -qx "$key" <<<"$CURRENT_KEYS"; then
      REMOVED_KEYS=$((REMOVED_KEYS+1))
      risk "DataKey::$key" "DataKey::$key is missing from the new source; stored data under it becomes unreachable"
    fi
  done < "$KEYS_BASELINE"
  [[ "$REMOVED_KEYS" -eq 0 ]] && pass "All storage keys in the baseline are still present"
fi

# ---------------------------------------------------------------------------
# Check 3 — Persisted struct fields
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 3: Persisted struct fields ---"

if [[ ! -f "$CONTRACT_SRC" ]]; then
  fail "Contract source not found at $CONTRACT_SRC"
elif [[ ! -f "$STRUCT_BASELINE" ]]; then
  fail "No struct baseline at $STRUCT_BASELINE — storage layout cannot be verified"
  info "Check out the currently-deployed version, then run: ./scripts/snapshot-contract-state.sh $CONTRACT"
else
  CURRENT_FIELDS=$(surface_struct_fields "$CONTRACT_SRC")
  BASE_FIELDS=$(grep -v '^#' "$STRUCT_BASELINE" | grep . || true)
  FIELD_RISKS_BEFORE=${#RISK_TOKENS[@]}

  # A line in the baseline that is not in the source is removed or changed.
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    grep -qxF "$line" <<<"$CURRENT_FIELDS" && continue
    struct=$(surface_struct_name "$line")
    field=$(surface_field_name "$line")
    risk "$struct.$field" "$struct.$field was removed or changed; existing entries may not deserialise"
  done <<<"$BASE_FIELDS"

  # A line in the source that is not in the baseline is new. Optional fields are safe,
  # because existing entries read them as None.
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    grep -qxF "$line" <<<"$BASE_FIELDS" && continue
    struct=$(surface_struct_name "$line")
    field=$(surface_field_name "$line")
    if [[ "$line" == *"Option<"* ]]; then
      info "New optional field $struct.$field (existing entries read it as None)"
    else
      risk "$struct.$field" "$struct.$field is a new required field; existing entries must be migrated"
    fi
  done <<<"$CURRENT_FIELDS"

  [[ ${#RISK_TOKENS[@]} -eq "$FIELD_RISKS_BEFORE" ]] && pass "Persisted struct fields match the baseline"
fi

# ---------------------------------------------------------------------------
# Check 4 — Public entry points
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 4: Public entry points ---"

if [[ ! -f "$CONTRACT_SRC" ]]; then
  fail "Contract source not found at $CONTRACT_SRC"
elif [[ ! -f "$API_BASELINE" ]]; then
  fail "No entry point baseline at $API_BASELINE — removed functions cannot be detected"
  info "Check out the currently-deployed version, then run: ./scripts/snapshot-contract-state.sh $CONTRACT"
else
  CURRENT_API=$(surface_entry_points "$CONTRACT_SRC")
  API_RISKS_BEFORE=${#RISK_TOKENS[@]}
  while IFS= read -r fn; do
    [[ -z "$fn" || "$fn" == \#* ]] && continue
    if ! grep -qx "$fn" <<<"$CURRENT_API"; then
      risk "$fn" "public function $fn was removed; existing clients calling it will fail"
    fi
  done < "$API_BASELINE"
  [[ ${#RISK_TOKENS[@]} -eq "$API_RISKS_BEFORE" ]] && pass "All public entry points in the baseline are still present"
fi

# ---------------------------------------------------------------------------
# Check 5 — Migration doc
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 5: Migration documentation ---"

UNIQUE_RISKS=()
if [[ ${#RISK_TOKENS[@]} -gt 0 ]]; then
  mapfile -t UNIQUE_RISKS < <(printf '%s\n' "${RISK_TOKENS[@]}" | sort -u)
  info "Risky changes found: ${#UNIQUE_RISKS[@]} (listed in the summary below)"
fi

if [[ -f "$MIGRATION_DOC" ]]; then
  pass "Migration doc found: $MIGRATION_DOC"

  REQUIRED_SECTIONS=("Pre-migration" "Migration steps" "Post-migration" "Rollback")
  for SECTION in "${REQUIRED_SECTIONS[@]}"; do
    if grep -qi "## $SECTION" "$MIGRATION_DOC" 2>/dev/null; then
      pass "  Section present: '$SECTION'"
    elif [[ "$NETWORK" == "mainnet" ]]; then
      fail "  Missing section on mainnet: '## $SECTION' in $MIGRATION_DOC"
    else
      warn "  Missing section: '## $SECTION' (required before mainnet)"
    fi
  done

  for TOKEN in "${UNIQUE_RISKS[@]}"; do
    if grep -qF -- "$TOKEN" "$MIGRATION_DOC"; then
      pass "  Risk documented: $TOKEN"
    else
      fail "  Risk not documented: $TOKEN — name it in the storage compatibility analysis of $MIGRATION_DOC"
    fi
  done
else
  if [[ "$NETWORK" == "mainnet" ]]; then
    fail "Migration doc REQUIRED for mainnet upgrades: $MIGRATION_DOC"
    info "Create it from the template: cp docs/operations/migration-template.md $MIGRATION_DOC"
  elif [[ ${#UNIQUE_RISKS[@]} -gt 0 ]]; then
    fail "Migration doc REQUIRED because risky changes were found (even on testnet): $MIGRATION_DOC"
    info "Create it from the template: cp docs/operations/migration-template.md $MIGRATION_DOC"
  else
    warn "No migration doc at $MIGRATION_DOC"
    info "This is acceptable for testnet with no risky changes, but required before mainnet."
  fi
fi

# ---------------------------------------------------------------------------
# Check 6 — Rollback feasibility
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 6: Rollback feasibility ---"

if [[ -f "$DEPLOYMENT_LOG" ]]; then
  if grep -qi "$CONTRACT" "$DEPLOYMENT_LOG" 2>/dev/null; then
    pass "Deployment log found and contains entries for '$CONTRACT'"
    info "Verify that the CURRENT contract ID is recorded before proceeding."
  else
    warn "Deployment log exists but has no entries for '$CONTRACT'"
    info "Record the current contract ID before upgrading so rollback is possible."
  fi
else
  fail "No deployment log found at $DEPLOYMENT_LOG"
  info "Create and populate it before upgrading. Rolling back requires the old contract ID."
  info "Template: docs/operations/deployment-log.md (see migration-template.md for structure)"
fi

if grep -qi "rollback" "docs/deployment.md" 2>/dev/null; then
  pass "Rollback procedures present in docs/deployment.md"
else
  warn "No 'rollback' section in docs/deployment.md"
fi

# ---------------------------------------------------------------------------
# Check 7 — Admin / initialise guard
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 7: Contract admin / initialise guard ---"

if [[ ! -f "$CONTRACT_SRC" ]]; then
  warn "Source not found — skipping admin check"
else
  if grep -q 'require_admin\|require_auth.*admin\|Admin.*require_auth\|oracle.require_auth' "$CONTRACT_SRC" 2>/dev/null; then
    pass "Admin authorisation guard found in contract source"
  else
    warn "No admin auth pattern found — confirm the contract has access control before deploying"
  fi

  if grep -qE 'AlreadyInitialized|Already initialized|already_init|Contract already initialized' "$CONTRACT_SRC" 2>/dev/null; then
    pass "Double-initialise guard found"
  else
    warn "No double-initialise guard detected — verify the contract cannot be re-initialised"
  fi
fi

# ---------------------------------------------------------------------------
# Check 8 — Network safety gate
# ---------------------------------------------------------------------------
echo ""
echo "--- Check 8: Network safety gate ---"

if [[ "$NETWORK" == "mainnet" ]]; then
  if [[ "$CONFIRM" != "--confirm" ]]; then
    fail "Mainnet deployment requires explicit confirmation."
    info "Re-run with --confirm once all other checks pass:"
    info "  $0 $CONTRACT $OLD_WASM $NEW_WASM mainnet --confirm"
  else
    pass "Mainnet confirmation flag present"
  fi
else
  pass "Network is '$NETWORK' — no confirmation gate"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
if [[ ${#UNIQUE_RISKS[@]} -gt 0 ]]; then
  echo "Risky changes (${#UNIQUE_RISKS[@]}):"
  for TOKEN in "${UNIQUE_RISKS[@]}"; do info "  - $TOKEN"; done
  echo ""
fi

if [[ "$FAILED" -eq 0 ]]; then
  echo -e "${GREEN}ALL CHECKS PASSED — safe to proceed with deployment${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Run the pre-deploy integration tests:"
  echo "     cd contracts/$CONTRACT && cargo test --release"
  echo "  2. Deploy: stellar contract deploy --wasm $NEW_WASM --source deployer --network $NETWORK"
  echo "  3. Record the new contract ID in $DEPLOYMENT_LOG"
  echo "  4. Update consumer configs to use the new contract ID"
  echo "  5. Run post-deploy verification: ./scripts/verify-deployment.sh $CONTRACT <new-id> $NETWORK"
  exit 0
else
  echo -e "${RED}$FAILED CHECK(S) FAILED — do NOT deploy until resolved${NC}"
  echo ""
  echo "Fix the failures above, then re-run this script."
  exit 1
fi
