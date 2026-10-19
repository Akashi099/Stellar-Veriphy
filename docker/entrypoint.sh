#!/bin/sh
# Container entrypoint: prints startup diagnostics, fails fast on fatal
# misconfiguration, then hands PID 1 over to the app server.
set -eu

log() {
  printf '%s [startup] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

fail() {
  log "FATAL: $1"
  log "Remediation: $2"
  log "See DOCKER.md#startup-diagnostics"
  exit 1
}

NETWORK="${NEXT_PUBLIC_NETWORK:-${NEXT_PUBLIC_STELLAR_NETWORK:-}}"
DATA_DIR="${VERIPHY_DATA_DIR:-/app/frontend/.data}"

log "Stellar-Veriphy container starting"
log "node=$(node --version) user=$(id -un) pid=$$"
log "NODE_ENV=${NODE_ENV:-unset} PORT=${PORT:-3000} HOSTNAME=${HOSTNAME:-unset}"
log "NEXT_PUBLIC_NETWORK=${NETWORK:-unset}"

case "$NETWORK" in
  testnet|mainnet|futurenet) ;;
  "") fail "NEXT_PUBLIC_NETWORK is not set" "Pass -e NEXT_PUBLIC_NETWORK=testnet (or mainnet/futurenet)." ;;
  *) fail "NEXT_PUBLIC_NETWORK=$NETWORK is not supported" "Use testnet, mainnet or futurenet." ;;
esac

if [ -z "${NEXT_PUBLIC_NETWORK:-}" ]; then
  log "WARN: network read from legacy NEXT_PUBLIC_STELLAR_NETWORK; rename it to NEXT_PUBLIC_NETWORK"
fi

RPC_VAR="NEXT_PUBLIC_$(echo "$NETWORK" | tr '[:lower:]' '[:upper:]')_RPC_URL"
RPC_URL="$(printenv "$RPC_VAR" || true)"
if [ -z "$RPC_URL" ]; then
  log "WARN: $RPC_VAR is not set; contract reads will fail until it is configured"
else
  log "$RPC_VAR=$RPC_URL"
fi

for id in ORACLE PROVENANCE REGISTRY; do
  value="$(printenv "NEXT_PUBLIC_${id}_CONTRACT_ID" || true)"
  if [ -z "$value" ]; then
    log "WARN: NEXT_PUBLIC_${id}_CONTRACT_ID is not set"
  fi
done

if ! mkdir -p "$DATA_DIR" 2>/dev/null || ! touch "$DATA_DIR/.startup-probe" 2>/dev/null; then
  fail "data directory $DATA_DIR is not writable by $(id -un)" \
    "Mount a volume owned by appuser, or set VERIPHY_DATA_DIR to a writable path."
fi
rm -f "$DATA_DIR/.startup-probe"
log "data dir $DATA_DIR is writable"

if [ ! -d /app/frontend/.next ]; then
  fail "frontend build output (/app/frontend/.next) is missing" "Rebuild the image: docker build --no-cache -t stellarveriphy ."
fi

log "pre-flight checks passed; starting app (readiness: GET /api/health/ready)"
exec "$@"
