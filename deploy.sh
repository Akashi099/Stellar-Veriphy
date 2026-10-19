#!/bin/bash
set -euo pipefail

# Provenance Contract Deployment Script
#
# This script builds and deploys the Provenance contract to a Stellar testnet.
#
# Required environment variables:
#   STELLAR_NETWORK: The Stellar network to use (e.g., testnet, futurenet)
#   STELLAR_ACCOUNT: The public key of the account deploying the contract
#
# Optional:
#   STELLAR_SECRET_KEY: The secret key of the deployment account (if not already
#                       configured in the Stellar CLI config)
#
# Usage:
#   STELLAR_NETWORK=testnet STELLAR_ACCOUNT=GDG... ./deploy.sh
#
# For branch preview deployments, only ever use testnet:
# docs/deployment/preview-deployments.md#2-contracts-for-a-preview

# Check required environment variables
if [[ -z "${STELLAR_NETWORK:-}" ]]; then
  echo "Error: STELLAR_NETWORK environment variable is required"
  exit 1
fi

if [[ -z "${STELLAR_ACCOUNT:-}" ]]; then
  echo "Error: STELLAR_ACCOUNT environment variable is required"
  exit 1
fi

# If secret key is provided, add it to the CLI config (if not already present)
if [[ -n "${STELLAR_SECRET_KEY:-}" ]]; then
  echo "Adding secret key to Stellar CLI configuration..."
  stellar config account set "$STELLAR_SECRET_KEY" --global || true
fi

# Change to the contract directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Building Provenance contract..."
cargo build --target wasm32-unknown-unknown --release

WASM_PATH="target/wasm32-unknown-unknown/release/provenance_contract.wasm"
if [[ ! -f "$WASM_PATH" ]]; then
  echo "Error: WASM file not found at $WASM_PATH"
  exit 1
fi

echo "Uploading contract to $STELLAR_NETWORK..."
CONTRACT_OUTPUT=$(stellar contract upload \
  --wasm "$WASM_PATH" \
  --network "$STELLAR_NETWORK" \
  --source "$STELLAR_ACCOUNT" 2>&1)

if [[ $? -ne 0 ]]; then
  echo "Error uploading contract:"
  echo "$CONTRACT_OUTPUT"
  exit 1
fi

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$CONTRACT_OUTPUT" | grep -oP '(?<=Contract ID: )\S+' || echo "$CONTRACT_OUTPUT" | tail -1 | awk '{print $NF}')
if [[ -z "$CONTRACT_ADDRESS" || "$CONTRACT_ADDRESS" == *"Error"* ]]; then
  echo "Could not extract contract address from output:"
  echo "$CONTRACT_OUTPUT"
  exit 1
fi

echo "Contract uploaded successfully. Address: $CONTRACT_ADDRESS"

# Prompt for Oracle contract address
read -rp "Enter the Oracle contract address (for initialization): " ORACLE_ADDRESS

if [[ -z "$ORACLE_ADDRESS" ]]; then
  echo "Error: Oracle contract address is required"
  exit 1
fi

echo "Initializing contract with Oracle address: $ORACLE_ADDRESS..."
INIT_OUTPUT=$(stellar contract invoke \
  --id "$CONTRACT_ADDRESS" \
  --network "$STELLAR_NETWORK" \
  --source "$STELLAR_ACCOUNT" \
  -- \
  initialize \
  --oracle "$ORACLE_ADDRESS" 2>&1)

if [[ $? -ne 0 ]]; then
  echo "Error initializing contract:"
  echo "$INIT_OUTPUT"
  exit 1
fi

echo "Contract initialized successfully."
echo "Deployment complete!"
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Oracle Address: $ORACLE_ADDRESS"
