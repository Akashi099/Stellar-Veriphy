#!/bin/bash

# Database Reset Script for Stellar Veriphy
# This script resets the database to initial state and optionally loads seed data

set -e

echo "🔄 Resetting Database"
echo "===================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check for required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}✗ DATABASE_URL is not set${NC}"
    echo "Please set the DATABASE_URL environment variable in .env.local"
    exit 1
fi

# Parse arguments
LOAD_SEED_DATA=true
if [ "$1" == "--no-seed" ]; then
    LOAD_SEED_DATA=false
fi

echo -e "${BLUE}Database URL: ${DATABASE_URL:0:50}...${NC}"
echo ""

# Confirm destructive operation
echo -e "${YELLOW}⚠️  This will DELETE all data from the database!${NC}"
read -p "Are you sure? Type 'yes' to continue: " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo -e "${BLUE}Dropping and recreating database...${NC}"

# Run database migrations
if command -v prisma &> /dev/null; then
    echo -e "${BLUE}Running Prisma migrations...${NC}"
    pnpm prisma migrate reset --force 2>/dev/null || echo -e "${YELLOW}⚠️  Prisma migrations not available${NC}"
elif [ -f backend/package.json ] && grep -q "typeorm" backend/package.json; then
    echo -e "${BLUE}Running TypeORM migrations...${NC}"
    cd backend && pnpm typeorm migration:run || echo -e "${YELLOW}⚠️  TypeORM migrations failed${NC}" && cd ..
else
    echo -e "${YELLOW}⚠️  No database migration tool found (optional)${NC}"
fi

# Load seed data if available
if [ "$LOAD_SEED_DATA" = true ]; then
    echo -e "${BLUE}Loading seed data...${NC}"
    if [ -f scripts/seed-data.js ]; then
        node scripts/seed-data.js
        echo -e "${GREEN}✓ Seed data loaded${NC}"
    elif [ -f "backend/scripts/seed.ts" ]; then
        cd backend && pnpm ts-node scripts/seed.ts && cd ..
        echo -e "${GREEN}✓ Seed data loaded${NC}"
    else
        echo -e "${YELLOW}⚠️  No seed data script found (optional)${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✓ Database reset complete!${NC}"
