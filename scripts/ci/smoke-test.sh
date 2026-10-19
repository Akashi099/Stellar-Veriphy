#!/usr/bin/env bash
# Deployment pipeline smoke tests. Usage: smoke-test.sh [BASE_URL]
# Without BASE_URL, only static pipeline checks run.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
URL="${1:-}"
fail=0

check() {
  local name="$1" fix="$2"; shift 2
  if "$@" >/dev/null 2>&1; then echo "PASS: $name"
  else echo "FAIL: $name"; echo "  -> Remediation: $fix"; fail=1; fi
}

check "deploy.sh syntax" "Run 'bash -n deploy.sh' and fix the reported line." bash -n "$ROOT/deploy.sh"
check "blue-green script syntax" "Run 'bash -n scripts/deploy/blue-green-deploy.sh'." bash -n "$ROOT/scripts/deploy/blue-green-deploy.sh"
check "deploy.sh requires STELLAR_NETWORK" "deploy.sh must exit non-zero when STELLAR_NETWORK is unset." \
  bash -c "! env -u STELLAR_NETWORK bash '$ROOT/deploy.sh'"
check "migrations valid" "See docs/deployment/migration-safety.md." bash "$ROOT/scripts/migrations/validate.sh"
check "docker-compose config" "Run 'docker compose config' locally to see the error." \
  bash -c "! command -v docker || docker compose -f '$ROOT/docker-compose.yml' config -q"

if [[ -n "$URL" ]]; then
  check "app responds 2xx at $URL" "Check container logs and roll back the slot (docs/ops/incident-runbook.md)." \
    curl -fsS --max-time 15 "$URL"
fi

(( fail )) && { echo "Smoke tests FAILED"; exit 1; }
echo "All smoke tests passed"
