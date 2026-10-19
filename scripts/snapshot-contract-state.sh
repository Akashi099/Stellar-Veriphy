#!/usr/bin/env bash
# =============================================================================
# snapshot-contract-state.sh
#
# Captures a point-in-time snapshot of a contract's storage keys, persisted
# struct fields and public entry points. Run this against the version that is
# currently deployed, before an upgrade. upgrade-safety-check.sh diffs the new
# source against these baselines.
#
# Usage:
#   ./scripts/snapshot-contract-state.sh <contract>
#
# Outputs (to docs/operations/):
#   storage-keys-<contract>.txt    — DataKey variant names, one per line
#   struct-snapshot-<contract>.txt — "<Struct><TAB>pub field: Type" per persisted field
#   api-<contract>.txt             — public entry point names, one per line
#
# Format is defined by scripts/contract-surface.sh, which the checker also uses.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=contract-surface.sh
source "$SCRIPT_DIR/contract-surface.sh"

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
pass() { echo -e "${GREEN}[OK]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <contract>"
  exit 2
fi

CONTRACT="$1"
case "$CONTRACT" in
  oracle|provenance|registry) ;;
  *) fail "Unknown contract '$CONTRACT'. Must be one of: oracle provenance registry" ;;
esac

SRC="contracts/${CONTRACT}/src/lib.rs"
OUT_DIR="docs/operations"

if [[ ! -f "$SRC" ]]; then
  fail "Contract source not found: $SRC"
fi

mkdir -p "$OUT_DIR"

KEYS_FILE="$OUT_DIR/storage-keys-${CONTRACT}.txt"
STRUCT_FILE="$OUT_DIR/struct-snapshot-${CONTRACT}.txt"
API_FILE="$OUT_DIR/api-${CONTRACT}.txt"
GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

{
  echo "# DataKey variants for $CONTRACT — $GENERATED_AT"
  surface_datakeys "$SRC"
} > "$KEYS_FILE"
pass "Storage key snapshot: $KEYS_FILE ($(grep -vc '^#' "$KEYS_FILE" || true) variants)"

{
  echo "# Persisted struct fields for $CONTRACT — $GENERATED_AT"
  surface_struct_fields "$SRC"
} > "$STRUCT_FILE"
pass "Struct snapshot: $STRUCT_FILE ($(grep -vc '^#' "$STRUCT_FILE" || true) fields)"

{
  echo "# Public entry points for $CONTRACT — $GENERATED_AT"
  surface_entry_points "$SRC"
} > "$API_FILE"
pass "Entry point snapshot: $API_FILE ($(grep -vc '^#' "$API_FILE" || true) functions)"

echo ""
echo "Snapshots written. Commit these files before upgrading:"
echo "  git add $KEYS_FILE $STRUCT_FILE $API_FILE"
echo "  git commit -m 'chore: pre-upgrade storage snapshot for $CONTRACT'"
echo ""
echo "Snapshot the version that is currently deployed. A snapshot of unreleased code"
echo "does not describe what consumers and stored data depend on."
