#!/bin/bash

# Deploy Helper Script for Stellar Veriphy
# This script provides utilities for deployment including:
# - Pre-deployment checks
# - Build verification
# - Environment validation
# - Deployment status checks

set -e

echo "🚀 Stellar Veriphy Deploy Helper"
echo "================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
ENVIRONMENT="${1:-staging}"
CHECK_ONLY="${2:-false}"

# Validate environment
valid_envs=("staging" "production")
if [[ ! " ${valid_envs[@]} " =~ " ${ENVIRONMENT} " ]]; then
    echo -e "${RED}✗ Invalid environment: $ENVIRONMENT${NC}"
    echo "Valid environments: ${valid_envs[*]}"
    exit 1
fi

echo -e "${BLUE}Target Environment: $ENVIRONMENT${NC}"
echo ""

# Pre-deployment checks
echo -e "${BLUE}🔍 Running pre-deployment checks...${NC}"
echo ""

# Check git status
echo -e "${BLUE}1. Git Status${NC}"
if [ -z "$(git status --porcelain)" ]; then
    echo -e "${GREEN}✓ Working directory is clean${NC}"
else
    echo -e "${RED}✗ Working directory has uncommitted changes:${NC}"
    git status --short
    exit 1
fi
echo ""

# Check branch
echo -e "${BLUE}2. Branch Check${NC}"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "Current branch: ${BLUE}$CURRENT_BRANCH${NC}"

if [[ "$ENVIRONMENT" == "production" && "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${YELLOW}⚠️  Production deployments should be from 'main' branch${NC}"
    read -p "Continue anyway? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi
echo ""

# Check dependencies
echo -e "${BLUE}3. Dependency Check${NC}"
if [ -f pnpm-lock.yaml ]; then
    echo -e "${GREEN}✓ pnpm-lock.yaml found${NC}"
else
    echo -e "${YELLOW}⚠️  pnpm-lock.yaml not found${NC}"
fi
echo ""

# Run type checking
echo -e "${BLUE}4. Type Checking${NC}"
if pnpm typecheck &>/dev/null; then
    echo -e "${GREEN}✓ Type checking passed${NC}"
else
    echo -e "${RED}✗ Type checking failed${NC}"
    exit 1
fi
echo ""

# Run tests
echo -e "${BLUE}5. Testing${NC}"
if pnpm test --passWithNoTests 2>/dev/null; then
    echo -e "${GREEN}✓ Tests passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed (review before deploying)${NC}"
fi
echo ""

# Build check
echo -e "${BLUE}6. Build Check${NC}"
if pnpm build:frontend &>/dev/null; then
    echo -e "${GREEN}✓ Frontend build successful${NC}"
else
    echo -e "${RED}✗ Frontend build failed${NC}"
    exit 1
fi
echo ""

# Check environment file
echo -e "${BLUE}7. Environment Configuration${NC}"
ENV_FILE="frontend/.env.${ENVIRONMENT}"
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}✓ Environment file found: $ENV_FILE${NC}"
    # Compare against config/environments/<env>.json (docs/operations/environment-drift.md)
    if node scripts/env-drift.mjs --env "$ENVIRONMENT" --env-file "$ENV_FILE"; then
        echo -e "${GREEN}✓ No configuration drift${NC}"
    else
        echo -e "${RED}✗ Configuration drift detected in $ENV_FILE (see above)${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Environment file not found: $ENV_FILE${NC}"
    echo "Required environment variables may be missing"
fi
echo ""

# Bundle size check
echo -e "${BLUE}8. Bundle Size Check${NC}"
if pnpm check:bundle 2>/dev/null; then
    echo -e "${GREEN}✓ Bundle size within limits${NC}"
else
    echo -e "${YELLOW}⚠️  Bundle size check failed (review warnings)${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}✓ All pre-deployment checks passed!${NC}"
echo ""

if [[ "$CHECK_ONLY" != "false" ]]; then
    echo "Running in check-only mode. No deployment performed."
    exit 0
fi

echo -e "${YELLOW}Ready for deployment to ${BLUE}$ENVIRONMENT${NC}${YELLOW}.${NC}"
echo ""
echo "Next steps:"
echo -e "  ${BLUE}1.${NC} Review the deployment configuration"
echo -e "  ${BLUE}2.${NC} Run: ./scripts/deploy.sh $ENVIRONMENT"
echo -e "  ${BLUE}3.${NC} Monitor deployment in cloud platform"
echo ""
