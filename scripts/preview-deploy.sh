#!/bin/bash
# Branch preview deployments (docs/deployment/preview-deployments.md).
#
# Usage:
#   scripts/preview-deploy.sh up       [branch]   build and start the preview for a branch
#   scripts/preview-deploy.sh validate [branch]   health, drift and smoke checks for QA
#   scripts/preview-deploy.sh status   [branch]   show URL, commit and health
#   scripts/preview-deploy.sh down     [branch]   stop and remove the preview and its data
#   scripts/preview-deploy.sh list                list every running preview on this host
#
# [branch] defaults to the current git branch.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMMAND="${1:-}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"
PREVIEW_HOST="${PREVIEW_HOST:-localhost}"
PREVIEW_PORT_BASE="${PREVIEW_PORT_BASE:-4100}"

# feature/Upload-Fix_2 -> feature-upload-fix-2 (max 40 chars, safe for compose and DNS)
SLUG="$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40)"
# Stable port per branch in [base, base+899], so a branch always gets the same URL
PORT=$(( PREVIEW_PORT_BASE + $(echo -n "$BRANCH" | cksum | cut -d' ' -f1) % 900 ))
PROJECT="veriphy-preview-${SLUG}"
URL="${PREVIEW_URL:-http://${PREVIEW_HOST}:${PORT}}"

export COMPOSE_PROJECT_NAME="$PROJECT"
export PREVIEW_SLUG="$SLUG" PREVIEW_PORT="$PORT" PREVIEW_URL="$URL" PREVIEW_BRANCH="$BRANCH"
export PREVIEW_COMMIT="$(git rev-parse --short "$BRANCH" 2>/dev/null || git rev-parse --short HEAD)"

compose() { docker compose -f docker-compose.preview.yml "$@"; }
container() { compose ps -q app 2>/dev/null; }

case "$COMMAND" in
  up)
    if [[ "$BRANCH" == "main" ]]; then
      echo "✗ Previews are for feature branches; main is deployed to staging (pnpm deploy:staging)."
      exit 1
    fi
    if [[ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]]; then
      echo "✗ Check out '$BRANCH' first: the image is built from the working tree."
      exit 1
    fi
    if [[ -n "$(git status --porcelain)" ]]; then
      echo "⚠️  Working tree has uncommitted changes; the preview will not match commit $PREVIEW_COMMIT."
    fi
    echo "Building preview for $BRANCH ($PREVIEW_COMMIT) as $PROJECT on port $PORT..."
    compose up -d --build
    bash scripts/check-container-health.sh "$(container)" 300
    echo ""
    echo "✓ Preview ready: $URL"
    echo "  Next: scripts/preview-deploy.sh validate $BRANCH"
    ;;

  validate)
    id="$(container)"
    if [[ -z "$id" ]]; then
      echo "✗ No preview running for $BRANCH. Start it with: scripts/preview-deploy.sh up $BRANCH"
      exit 1
    fi
    failed=0
    step() { echo ""; echo "== $1"; }

    step "1. Container health"
    bash scripts/check-container-health.sh "$id" 60 || failed=1

    step "2. Configuration drift (config/environments/preview.json)"
    node scripts/env-drift.mjs --env preview --url "$URL" || failed=1

    step "3. Smoke checks"
    for path in / /api/health /api/health/ready /verify; do
      code=$(curl -s -o /dev/null -w '%{http_code}' "$URL$path" || echo 000)
      if [[ "$code" =~ ^(200|307|308)$ ]]; then echo "✓ $path -> $code"; else echo "✗ $path -> $code"; failed=1; fi
    done

    step "4. Upload flow (k6 smoke)"
    if command -v k6 >/dev/null; then
      k6 run -q -e PROFILE=smoke -e BASE_URL="$URL" load-tests/upload-heavy-load.js || failed=1
    else
      echo "- skipped: k6 not installed"
    fi

    echo ""
    if [[ $failed -eq 0 ]]; then
      echo "✓ Preview $URL passed automated validation. Continue with the manual QA checklist."
    else
      echo "✗ Preview $URL failed validation (see above)."
    fi
    exit $failed
    ;;

  status)
    id="$(container)"
    if [[ -z "$id" ]]; then echo "No preview running for $BRANCH ($PROJECT)."; exit 0; fi
    echo "Branch:  $BRANCH"
    echo "Commit:  $(docker inspect --format '{{index .Config.Labels "veriphy.preview.commit"}}' "$id")"
    echo "URL:     $URL"
    echo "Health:  $(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$id")"
    echo "Started: $(docker inspect --format '{{.State.StartedAt}}' "$id")"
    ;;

  down)
    echo "Removing preview $PROJECT (container, image and stored data)..."
    compose down --volumes --rmi local
    echo "✓ Removed"
    ;;

  list)
    docker ps --filter label=veriphy.preview=true \
      --format 'table {{.Label "veriphy.preview.branch"}}\t{{.Label "veriphy.preview.commit"}}\t{{.Ports}}\t{{.Status}}'
    ;;

  *)
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
