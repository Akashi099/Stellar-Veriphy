# Provenance Contract Deployment Guide

This document provides step-by-step instructions for deploying the Provenance contract to a Stellar testnet.

## Prerequisites

1. [Stellar CLI](https://developers.stellar.org/docs/tools/stellar-cli/) installed
2. Access to a Stellar testnet account with sufficient XLM for deployment
3. Rust and Cargo installed for building the contract

## Environment Variables

The following environment variables must be set before deployment:

- `STELLAR_NETWORK`: The network to deploy to (e.g., `testnet` or `futurenet`)
- `STELLAR_ACCOUNT`: The address of the account that will deploy and initialize the contract

Optionally, you can set:

- `STELLAR_SECRET_KEY`: The secret key of the deployment account (if not using `stellar config`)

## Deployment Steps

### 1. Build the Contract

```bash
cd contracts/provenance
cargo build --target wasm32-unknown-unknown --release
```

The compiled WASM will be available at:
`target/wasm32-unknown-unknown/release/provenance_contract.wasm`

### 2. Deploy the Contract WASM

```bash
stellar contract upload \
  --wasm target/wasm32-unknown-unknown/release/provenance_contract.wasm \
  --network $STELLAR_NETWORK \
  --source $STELLAR_ACCOUNT
```

This command will output a contract address. Save this address for the next step.

### 3. Initialize the Contract

After deployment, initialize the contract with the Oracle contract address:

```bash
stellar contract invoke \
  --id <CONTRACT_ADDRESS_FROM_STEP_2> \
  --network $STELLAR_NETWORK \
  --source $STELLAR_ACCOUNT \
  -- \
  initialize \
  --oracle <ORACLE_CONTRACT_ADDRESS>
```

Replace:

- `<CONTRACT_ADDRESS_FROM_STEP_2>` with the address from step 2
- `<ORACLE_CONTRACT_ADDRESS>` with the address of the deployed Oracle contract

### 4. Verify Deployment

You can verify the initialization by reading the Oracle address:

```bash
stellar contract invoke \
  --id <CONTRACT_ADDRESS> \
  --network $STELLAR_NETWORK \
  --source $STELLAR_ACCOUNT \
  -- \
  --try-read \
  ORACLE
```

(Note: The Read RPC method is not directly available in the CLI; you may need to use a custom script or check via Horizon. Alternatively, you can call a view function if one is added.)

## Deployment Script

For automated deployment, use the provided `deploy.sh` script (see below). The script performs all steps above and requires the same environment variables.

## Troubleshooting

- **Insufficient funds**: Ensure the source account has at least 1 XLM for deployment and transaction fees.
- **Contract size too large**: Optimize the contract code or enable `--release` profile.
- **Network errors**: Verify `STELLAR_NETWORK` is correct and you have horizon access.

## Example

```bash
export STELLAR_NETWORK=testnet
export STELLAR_ACCOUNT=GDG... (your public key)
export STELLAR_SECRET_KEY=SB... (your secret key, optional if configured in stellar config)

./deploy.sh
```

## Verification providers and cancellation

See [verification lifecycle operations](docs/operations/verification-lifecycle.md) for startup validation, provider configuration restart policy, MongoDB transaction requirements, cancellation authorization, the versioned error taxonomy, and Grafana traffic filters. Configure `VERIFICATION_BACKEND_URL` in the frontend server environment for the backend status proxy.
