#!/usr/bin/env bash
#
# Runs the `smoke_*` tests for the Soroban contracts and reports one line per
# contract. Each contract's full cargo output is kept in contracts/target/smoke-logs/
# so a failure can be inspected without rerunning.
#
# Usage:
#   scripts/contracts-smoke.sh                 # all contracts
#   scripts/contracts-smoke.sh oracle          # a subset
#
# Exit status is non-zero if any contract's smoke tests fail or do not build.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/contracts/target/smoke-logs"
ALL_CONTRACTS=(oracle provenance registry)

if [ "$#" -gt 0 ]; then
  CONTRACTS=("$@")
else
  CONTRACTS=("${ALL_CONTRACTS[@]}")
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "error: cargo not found. Install Rust (https://rustup.rs) and try again." >&2
  exit 2
fi

mkdir -p "$LOG_DIR"

# Prints the failing test names and the panic messages from a cargo log.
print_failures() {
  local log=$1
  grep -E "^test .* \.\.\. FAILED$" "$log" | sed 's/^/    /'
  grep -E -A2 "panicked at" "$log" | sed 's/^/    /' | head -40
}

overall=0
echo "Contract smoke tests"
echo "--------------------"

for name in "${CONTRACTS[@]}"; do
  if [ ! -f "$ROOT/contracts/$name/Cargo.toml" ]; then
    echo "$name: unknown contract (expected one of: ${ALL_CONTRACTS[*]})"
    overall=1
    continue
  fi

  log="$LOG_DIR/$name.log"
  (cd "$ROOT/contracts/$name" && cargo test --lib smoke_ >"$log" 2>&1)
  status=$?

  summary=$(grep -E "^test result:" "$log" | tail -1)
  if [ "$status" -eq 0 ]; then
    echo "PASS  $name  ${summary:-no tests matched smoke_}"
  else
    overall=1
    if grep -q "^error" "$log" && ! grep -q "^test result:" "$log"; then
      echo "FAIL  $name  build or manifest error (see $log)"
      grep -E "^error" -A4 "$log" | head -20 | sed 's/^/    /'
    else
      echo "FAIL  $name  ${summary:-tests failed} (log: $log)"
      print_failures "$log"
    fi
  fi
done

echo "--------------------"
if [ "$overall" -eq 0 ]; then
  echo "All contract smoke tests passed."
else
  echo "Contract smoke tests failed. Full output: $LOG_DIR"
fi
exit "$overall"
