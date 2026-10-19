#!/bin/bash

# Setup Script for Stellar Veriphy Development Environment
# This script sets up the complete development environment including:
# - Dependencies installation
# - Environment configuration
# - Database setup
# - Mock data generation

set -e

echo "🚀 Stellar Veriphy Development Setup"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js is not installed. Please install Node.js 20 or higher.${NC}"
    exit 1
fi

echo -e "${BLUE}Node version: $(node --version)${NC}"

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}Installing pnpm...${NC}"
    npm install -g pnpm@10.18.2
fi

echo -e "${BLUE}pnpm version: $(pnpm --version)${NC}"

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

# Setup environment variables
echo -e "${BLUE}⚙️  Setting up environment variables...${NC}"
if [ ! -f frontend/.env.local ]; then
    if [ -f frontend/.env.local.example ]; then
        cp frontend/.env.local.example frontend/.env.local
        echo -e "${GREEN}✓ Created frontend/.env.local from template${NC}"
    fi
else
    echo -e "${GREEN}✓ frontend/.env.local already exists${NC}"
fi

# Build contracts (if needed)
echo -e "${BLUE}🔨 Building Soroban contracts...${NC}"
if command -v stellar &> /dev/null; then
    pnpm build:contracts 2>/dev/null || echo -e "${YELLOW}⚠️  Contract build skipped (Stellar CLI not available)${NC}"
else
    echo -e "${YELLOW}⚠️  Stellar CLI not found. Skipping contract builds.${NC}"
fi

# Generate mock data
echo -e "${BLUE}🎲 Generating mock data...${NC}"
if [ -f scripts/generate-mock-data.js ]; then
    node scripts/generate-mock-data.js || echo -e "${YELLOW}⚠️  Mock data generation failed (optional)${NC}"
else
    echo -e "${YELLOW}⚠️  Mock data generator not found (optional)${NC}"
fi

echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo -e "  ${BLUE}Development:${NC}    pnpm dev:frontend"
echo -e "  ${BLUE}Run tests:${NC}      pnpm test"
echo -e "  ${BLUE}Format code:${NC}    pnpm format"
echo -e "  ${BLUE}Type check:${NC}     pnpm typecheck"
echo ""
