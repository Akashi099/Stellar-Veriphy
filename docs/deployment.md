# Contract Deployment Process

This guide walks through deploying StellarVeriphy's Soroban contracts (`contracts/oracle`, `contracts/provenance`, `contracts/registry`) to a Stellar network, from a clean build to a verified, invokable deployment.

It assumes you've already completed the [Developer Onboarding Guide](onboarding.md) — you should have Rust, the `wasm32-unknown-unknown` target, and the Stellar CLI installed and working.

> **Current contract state:** none of the three contracts implement an explicit `initialize`/constructor function today, and none implement an upgrade mechanism. Deployment is simpler than a typical upgradeable-contract system as a result, but rollback means deploying a new instance, not reverting the old one in place. See [Rollback procedures](#rollback-procedures) and the security note under [Contract initialization](#contract-initialization) before deploying anywhere real value is at stake.

## Table of contents

- [Deployment prerequisites](#deployment-prerequisites)
- [Network configuration](#network-configuration)
- [Step-by-step deployment](#step-by-step-deployment)
- [Contract initialization](#contract-initialization)
- [Verification process](#verification-process)
- [Rollback procedures](#rollback-procedures)
- [Deployment checklist](#deployment-checklist)

## Deployment prerequisites

- Stellar CLI installed (`stellar --version`).
- A funded Stellar account (identity) for the network you're deploying to — testnet accounts are funded for free via Friendbot; mainnet requires real XLM.
- Contracts built for the target network (see [Step-by-step deployment](#step-by-step-deployment) — the build step is the same regardless of network; only the `deploy` step's `--network` flag changes).
- If deploying `contracts/provenance` or `contracts/oracle` in an environment where they'll be invoked by end users, decide the storage backend (IPFS or MongoDB, per [ADR-0005](adr/0005-pluggable-storage-layer.md)) ahead of time — the contracts themselves don't care, but the frontend/oracle worker configuration pointing at them does.

## Network configuration

Stellar CLI manages named network configs and signing identities locally. Set these up once per machine:

```bash
# Add testnet (safe default for all development and this guide's examples)
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Create (or import) a signing identity
stellar keys generate deployer --network testnet
stellar keys address deployer   # prints the G... public key

# Fund it on testnet via Friendbot
stellar keys fund deployer --network testnet
```

For **mainnet**, add a `mainnet` network pointing at a mainnet-capable RPC provider and use a real, securely-held key — never reuse a testnet key or store a mainnet secret key in a shell history file or `.env` committed to git (`.gitignore` already excludes `.env`/`.env.local`, keep it that way).

Always pass `--network <name>` explicitly on every `stellar` command in this guide. There's no repo-level default network — an implicit default is exactly how a testnet deployment accidentally happens against mainnet, or vice versa.

## Step-by-step deployment

Repeat this for each of `oracle`, `provenance`, and `registry` — they're independent contracts with no shared deployment step.

**1. Build the contract to WASM:**

```bash
cd contracts/oracle
stellar contract build
```

This produces `contracts/oracle/target/wasm32-unknown-unknown/release/oracle.wasm`. (Or build all three from the repo root with `pnpm build:contracts`.)

**2. Deploy the WASM and get a contract ID:**

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/oracle.wasm \
  --source deployer \
  --network testnet
```

This prints a contract ID (`C...`). **Save it** — you'll need it to invoke the contract, wire it into the frontend/oracle worker config, and reference it later for verification or rollback.

**3. Repeat for `provenance` and `registry`,** from their respective directories, each producing its own contract ID.

## Contract initialization

Unlike many Soroban contract patterns, none of `oracle`, `provenance`, or `registry` currently expose an `initialize` function to set an admin or other one-time config at deploy time — there's nothing to call before the contract is usable. Once deployed, each contract's public methods are immediately callable:

- `oracle`: `submit(storage_ref, manifest_hash, requester)`, `get(id)`
- `provenance`: `mint(storage_ref, manifest_hash, attestation_hash, creator)`, `get(id)`
- `registry`: `register(admin, code_hash)`, `is_approved(code_hash)`

**Security note:** `registry.register` takes an `admin: Address` parameter and calls `admin.require_auth()`, but the contract never stores an admin and never checks that the caller _is_ a previously-designated admin — it only confirms that whoever signs the call is who they claim to be. In its current form, **any account can call `register` and mark a code hash as approved.** This is fine for local/testnet experimentation but is a real gap to close (e.g. storing an admin address at deploy time and checking it) before deploying `registry` anywhere its output is trusted for real verification decisions. Track this as a prerequisite to a mainnet deployment, not something to work around at deploy time.

## Verification process

After deploying, confirm the contract behaves as expected before pointing any application at it:

**1. Invoke a read method directly:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- is_approved --code_hash <hex-bytes>
```

(Substitute the contract's actual method/args — e.g. `get --id <n>` for `oracle`/`provenance`.)

**2. Exercise a full write-then-read round trip.** For example, for `registry`:

```bash
stellar contract invoke --id <CONTRACT_ID> --source deployer --network testnet \
  -- register --admin <deployer G-address> --code_hash <hex-bytes>

stellar contract invoke --id <CONTRACT_ID> --source deployer --network testnet \
  -- is_approved --code_hash <hex-bytes>
# expect: true
```

**3. Confirm on a block explorer.** For testnet/mainnet deployments, look up the contract ID on [Stellar Expert](https://stellar.expert/) (`testnet.stellar.expert` for testnet) to confirm the deployment transaction succeeded and inspect emitted events (`submitted`, `minted`, `registered` — each contract publishes one on its main write path).

**4. Record the contract ID** wherever your deployment's source of truth lives (deployment log, environment config for the frontend/oracle worker) — there's no on-chain registry of "which contract ID is the current one" beyond what you deployed and wrote down.

## Rollback procedures

> For an ordered, operator-facing checklist covering configuration, frontend/API, database and contract rollback plus post-rollback verification, see [`operations/rollback-checklist.md`](operations/rollback-checklist.md).

Soroban contract code is content-addressed by its WASM hash and, as deployed here, **immutable** — none of these three contracts call `env.deployer().update_current_contract_wasm()` or otherwise implement an upgrade path. There is no "revert this contract to its previous version" operation.

If a deployed contract has a bug:

1. **Fix the issue** in the contract source, and build + deploy a **new** contract instance following the steps above. This produces a **new contract ID** — the old one still exists on-chain, unchanged, with whatever state it had accumulated.
2. **Repoint consumers** (frontend config, oracle worker config) at the new contract ID. There's no in-place swap; every caller needs to start using the new ID.
3. **Decide what happens to state in the old contract.** Existing `VerificationRequest`/`ProvenanceCert` entries in the old contract remain readable there permanently (that's the point of an immutable provenance record) but won't reflect any fix. If certificates need to be reissued under the new contract, that's an application-level migration, not something Soroban does for you.
4. **Do not attempt to redeploy WASM to the same contract ID** — Soroban doesn't support this for contracts without an explicit upgrade mechanism, and there is no such mechanism here.

If contract upgradeability becomes a real requirement, that's a design decision worth its own ADR (see [`docs/adr/`](adr/README.md)) before implementing it — retrofitting upgradeability changes the trust model (whoever can trigger an upgrade can change contract logic under an existing ID).

## Deployment checklist

- [ ] Correct `--network` confirmed for every command (testnet vs. mainnet) — no reliance on an implicit default.
- [ ] Deploying identity (`stellar keys`) is funded and, for mainnet, its secret key is stored securely (not in shell history, not committed to git).
- [ ] Contract built fresh from the commit you intend to deploy (`stellar contract build`), not a stale `target/` artifact.
- [ ] For `registry`: aware of and comfortable with the current lack of a stored/checked admin (see [Contract initialization](#contract-initialization)) for this deployment's risk level.
- [ ] Contract ID recorded immediately after deploy, before doing anything else.
- [ ] Read + write-then-read verification performed against the new contract ID (see [Verification process](#verification-process)).
- [ ] Deployment transaction confirmed on a block explorer.
- [ ] Consumers (frontend, oracle worker) updated to point at the new contract ID.
- [ ] If replacing a previous deployment: rollback/migration plan for existing on-chain state decided _before_ the old contract ID is dropped from any config, per [Rollback procedures](#rollback-procedures).

## Environment-Aware API Configuration

The frontend dynamically resolves backend API endpoints and behaviors based on the target environment (`development`, `staging`, `production`, or `test`).

### Configuration Layer (`frontend/config/environment.ts`)

Endpoints and behavioral defaults are controlled by environment variables:

| Environment     | Variable              | Default Value                           | Notes                                    |
| --------------- | --------------------- | --------------------------------------- | ---------------------------------------- |
| **Development** | `NEXT_PUBLIC_API_URL` | `http://localhost:3000`                 | Mock fallbacks permitted, debug logging  |
| **Staging**     | `NEXT_PUBLIC_API_URL` | `https://staging-api.stellarveriphy.io` | Testnet contracts, HTTPS enforced        |
| **Production**  | `NEXT_PUBLIC_API_URL` | `https://api.stellarveriphy.io`         | Mainnet contracts, strict HTTPS enforced |

### Misconfiguration Detection

The configuration layer validates at runtime:

- **HTTPS Enforcement**: In staging and production, non-HTTPS URLs are rejected.
- **Localhost Prevention**: In production, endpoints configured to `localhost` or `127.0.0.1` throw an explicit runtime configuration error.
- **Clear Guidance**: Malformed URLs or missing mandatory configurations display clear remediation instructions in console and build logs.
