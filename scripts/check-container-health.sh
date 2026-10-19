#!/bin/bash
# Waits for a container to become healthy and explains why it did not.
#
# Usage:
#   scripts/check-container-health.sh [container] [timeout_seconds]
#
# Examples:
#   scripts/check-container-health.sh stellarveriphy-app
#   scripts/check-container-health.sh stellar-veriphy-staging-frontend 180

set -euo pipefail

CONTAINER="${1:-stellarveriphy-app}"
TIMEOUT="${2:-120}"
PORT="${PORT:-3000}"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "✗ Container '$CONTAINER' does not exist. Running containers:"
  docker ps --format '  {{.Names}}\t{{.Status}}'
  exit 1
fi

echo "Waiting up to ${TIMEOUT}s for $CONTAINER to become healthy..."
deadline=$((SECONDS + TIMEOUT))
status="unknown"
while (( SECONDS < deadline )); do
  state=$(docker inspect --format '{{.State.Status}}' "$CONTAINER")
  status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CONTAINER")
  if [[ "$state" != "running" ]]; then
    echo "✗ Container is $state (exit code $(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER"))."
    echo "--- startup log ---"
    docker logs --tail 40 "$CONTAINER" 2>&1
    exit 1
  fi
  [[ "$status" == "healthy" || "$status" == "none" ]] && break
  [[ "$status" == "unhealthy" ]] && break
  sleep 3
done

echo "Health status: $status"
echo "--- last health probe results ---"
docker inspect --format '{{if .State.Health}}{{range .State.Health.Log}}{{.End}} exit={{.ExitCode}} {{.Output}}{{end}}{{end}}' "$CONTAINER" | tail -n 5

echo "--- readiness report ---"
docker exec "$CONTAINER" node -e "
  require('http').get('http://127.0.0.1:${PORT}/api/health/ready', (r) => {
    let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { console.log(b); });
  }).on('error', (e) => console.log('readiness endpoint unreachable:', e.message));
" || true

if [[ "$status" != "healthy" && "$status" != "none" ]]; then
  echo "--- startup log ---"
  docker logs --tail 40 "$CONTAINER" 2>&1 | grep -E '\[startup\]|readiness|error|Error' || docker logs --tail 40 "$CONTAINER" 2>&1
  echo "✗ $CONTAINER is $status. See DOCKER.md#startup-diagnostics for common causes."
  exit 1
fi
echo "✓ $CONTAINER is healthy"
