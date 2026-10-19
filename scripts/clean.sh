#!/bin/bash

# Clean Script for Stellar Veriphy Development Environment
# This script removes build artifacts and temporary files to reset the project

set -e

echo "🧹 Cleaning Stellar Veriphy"
echo "============================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to remove directory
clean_dir() {
    if [ -d "$1" ]; then
        rm -rf "$1"
        echo -e "${GREEN}✓ Removed $1${NC}"
    fi
}

# Function to remove file
clean_file() {
    if [ -f "$1" ]; then
        rm -f "$1"
        echo -e "${GREEN}✓ Removed $1${NC}"
    fi
}

echo -e "${BLUE}Cleaning build artifacts...${NC}"
clean_dir frontend/.next
clean_dir frontend/out
clean_dir frontend/dist
clean_dir frontend/coverage
clean_dir frontend/.turbo
clean_dir frontend/playwright-report
clean_dir frontend/.bundle-reports

echo -e "${BLUE}Cleaning Rust/Soroban build artifacts...${NC}"
clean_dir contracts/oracle/target
clean_dir contracts/provenance/target
clean_dir contracts/registry/target

echo -e "${BLUE}Cleaning test artifacts...${NC}"
clean_dir test-results
clean_dir coverage
clean_dir reports

echo -e "${BLUE}Cleaning temporary files...${NC}"
find . -name "*.tsbuildinfo" -type f -exec rm -f {} + 2>/dev/null || true
find . -name "*.log" -type f -exec rm -f {} + 2>/dev/null || true
find . -name ".DS_Store" -type f -exec rm -f {} + 2>/dev/null || true

# Optional: Clean node_modules (commented out by default)
# echo -e "${BLUE}Cleaning node_modules...${NC}"
# clean_dir node_modules
# clean_dir frontend/node_modules

echo ""
echo -e "${GREEN}✓ Clean complete!${NC}"
echo ""
echo "To reinstall dependencies, run:"
echo -e "  ${BLUE}pnpm install${NC}"
