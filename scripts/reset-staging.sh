#!/usr/bin/env bash
set -euo pipefail

# Staging environment reset for Stellar Veriphy.
#
# Returns the docker-compose staging stack (docker-compose.staging.yml) to a
# known state: the staging database is dropped and recreated from
# scripts/init-staging-db.sql, and the Redis cache is flushed. Every step is
# safe to rerun; running the script twice in a row leaves the same end state.
#
# After the reset the script verifies the result (database reachable, expected
# tables present, seed rows as requested, cache empty) and exits non-zero if
# anything doesn't match.
#
# Usage:
#   scripts/reset-staging.sh [options]
#
# Options:
#   -y, --yes        Skip the confirmation prompt (required in non-interactive shells)
#   --no-seed        Leave the schema in place but remove the sample rows
#   --keep-cache     Don't flush Redis
#   --verify-only    Only run the post-reset checks; change nothing
#   --dry-run        Print the actions that would run; change nothing
#   -h, --help       Show this help
#
# Environment:
#   STAGING_DB_PASSWORD     Must match the value the stack was started with
#   STAGING_REDIS_PASSWORD  Must match the value the stack was started with
#   COMPOSE_FILE_PATH       Compose file (default: docker-compose.staging.yml)
#
# See STAGING_ENVIRONMENT.md ("Reset the environment") for the full workflow.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE_PATH="${COMPOSE_FILE_PATH:-docker-compose.staging.yml}"
DB_NAME="stellar_veriphy_staging"
DB_USER="staging_user"
INIT_SQL="scripts/init-staging-db.sql"
EXPECTED_TABLES=(content_items verification_proofs provenance_records)
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-60}"

ASSUME_YES=false
SEED=true
FLUSH_CACHE=true
VERIFY_ONLY=false
DRY_RUN=false

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${BLUE}==>${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
die() { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

usage() { sed -n '/^# Usage:/,/^# See /p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) ASSUME_YES=true ;;
    --no-seed) SEED=false ;;
    --keep-cache) FLUSH_CACHE=false ;;
    --verify-only) VERIFY_ONLY=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
  shift
done

# --- Preconditions -----------------------------------------------------------

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose -f "$COMPOSE_FILE_PATH")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose -f "$COMPOSE_FILE_PATH")
else
  die "Docker Compose is required (docker compose or docker-compose)"
fi

[[ -f "$COMPOSE_FILE_PATH" ]] || die "Compose file not found: $COMPOSE_FILE_PATH"
[[ -f "$INIT_SQL" ]] || die "Init script not found: $INIT_SQL"

# This script only ever targets the staging stack. Refuse if the shell looks
# like it is pointed at production, so a stray export can't widen the blast radius.
for var in NODE_ENV ENVIRONMENT DEPLOY_ENV; do
  if [[ "${!var:-}" == "production" ]]; then
    die "$var=production is set; refusing to reset. Unset it and rerun."
  fi
done

run() {
  if $DRY_RUN; then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

psql_exec() {
  local db="$1"
  shift
  "${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$db" "$@"
}

psql_value() {
  psql_exec "$1" -tAc "$2" | tr -d '[:space:]'
}

redis_cli() {
  "${COMPOSE[@]}" exec -T redis sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning "$@"' redis-cli "$@"
}

wait_healthy() {
  local service="$1" container status deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  container="$("${COMPOSE[@]}" ps -q "$service")"
  [[ -n "$container" ]] || die "$service is not running"
  while true; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
    [[ "$status" == "healthy" ]] && return 0
    ((SECONDS < deadline)) || die "$service did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s (status: $status)"
    sleep 2
  done
}

# --- Verification ------------------------------------------------------------

verify() {
  local failures=0 table count

  info "Verifying staging state"

  if [[ "$(psql_value postgres "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" == "1" ]]; then
    ok "Database $DB_NAME exists"
  else
    warn "Database $DB_NAME is missing"
    return 1
  fi

  for table in "${EXPECTED_TABLES[@]}"; do
    if [[ "$(psql_value "$DB_NAME" "SELECT to_regclass('public.$table') IS NOT NULL")" == "t" ]]; then
      ok "Table $table present"
    else
      warn "Table $table missing"
      failures=$((failures + 1))
    fi
  done

  count="$(psql_value "$DB_NAME" "SELECT count(*) FROM content_items")"
  if $SEED && [[ "$count" -ge 1 ]]; then
    ok "Seed data loaded ($count content_items)"
  elif ! $SEED && [[ "$count" -eq 0 ]]; then
    ok "No seed data (content_items is empty)"
  else
    warn "Unexpected content_items row count: $count (seed=$SEED)"
    failures=$((failures + 1))
  fi

  if $FLUSH_CACHE; then
    count="$(redis_cli DBSIZE | tr -d '[:space:]')"
    if [[ "$count" == "0" ]]; then
      ok "Redis cache is empty"
    else
      warn "Redis still holds $count keys"
      failures=$((failures + 1))
    fi
  fi

  ((failures == 0))
}

# --- Main --------------------------------------------------------------------

echo "Stellar Veriphy staging reset"
echo "  compose file: $COMPOSE_FILE_PATH"
echo "  database:     $DB_NAME (recreate from $INIT_SQL)"
echo "  seed data:    $SEED"
echo "  flush redis:  $FLUSH_CACHE"
echo ""

info "Ensuring postgres and redis are running"
run "${COMPOSE[@]}" up -d postgres redis
if ! $DRY_RUN; then
  wait_healthy postgres
  wait_healthy redis
  ok "postgres and redis are healthy"
fi

if $VERIFY_ONLY; then
  verify && ok "Staging environment matches the expected state" || die "Staging environment does not match the expected state"
  exit 0
fi

if ! $ASSUME_YES && ! $DRY_RUN; then
  [[ -t 0 ]] || die "Not running interactively; pass --yes to confirm the reset"
  scope="all data in $DB_NAME"
  $FLUSH_CACHE && scope="$scope and the staging Redis cache"
  echo -e "${YELLOW}This deletes $scope.${NC}"
  read -rp "Type 'reset' to continue: " reply
  [[ "$reply" == "reset" ]] || die "Aborted"
fi

info "Recreating database $DB_NAME"
# Connect to the maintenance database so the target can be dropped. WITH (FORCE)
# terminates open sessions (API, exporters) instead of failing on them, and
# IF EXISTS makes this a no-op on a partially reset environment.
run psql_exec postgres -c "DROP DATABASE IF EXISTS $DB_NAME WITH (FORCE);"
run psql_exec postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

info "Applying $INIT_SQL"
if $DRY_RUN; then
  echo "  [dry-run] psql -d $DB_NAME < $INIT_SQL"
else
  psql_exec "$DB_NAME" -q < "$INIT_SQL"
fi

if ! $SEED; then
  info "Removing sample rows"
  run psql_exec "$DB_NAME" -c "TRUNCATE content_items, verification_proofs, provenance_records;"
fi

if $FLUSH_CACHE; then
  info "Flushing Redis"
  run redis_cli FLUSHALL
fi

if $DRY_RUN; then
  ok "Dry run complete; nothing was changed"
  exit 0
fi

verify || die "Reset finished but verification failed; see warnings above"
echo ""
ok "Staging environment reset complete"
