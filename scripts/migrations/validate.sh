#!/usr/bin/env bash
# Validates migration ordering, rollback presence, and critical-change review.
# See docs/deployment/migration-safety.md
set -euo pipefail

DIR="${1:-$(dirname "$0")}"
fail=0
expected=1

shopt -s nullglob
for f in "$DIR"/[0-9][0-9][0-9][0-9]_*; do
  name=$(basename "$f")
  [[ "$name" == *.down.* ]] && continue
  num=$((10#${name:0:4}))
  if (( num != expected )); then
    echo "ERROR: $name out of order (expected $(printf %04d $expected))"; fail=1
  fi
  expected=$((num + 1))

  base="${name%.*}"; ext="${name##*.}"
  if [[ ! -f "$DIR/$base.down.$ext" ]] && ! grep -q 'IRREVERSIBLE:' "$f"; then
    echo "ERROR: $name has no rollback ($base.down.$ext) or IRREVERSIBLE header"; fail=1
  fi

  if grep -Eiq 'DROP |TRUNCATE|ALTER .* TYPE|RENAME|update_current_contract_wasm|upgrade' "$f" \
     && ! grep -q 'REVIEWED-BY:' "$f"; then
    echo "ERROR: $name contains a critical change without REVIEWED-BY header"; fail=1
  fi
done

if (( fail )); then
  echo "Migration validation failed. Fix: see docs/deployment/migration-safety.md"
  exit 1
fi
echo "Migrations OK"
