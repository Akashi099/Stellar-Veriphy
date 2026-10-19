# Transaction Recovery Strategy

**Module:** `frontend/lib/blockchain/transactionRecovery.ts`  
**API:** `GET /api/transactions/recovery`, `POST /api/transactions/recovery`  
**Closes:** #690

## Overview

This document describes the recovery strategy for transactions that were initiated but never reached finality, were partially submitted, or were stuck behind network delays.

## Failure modes

| Mode | Description | Typical cause |
|---|---|---|
| `PENDING_TIMEOUT` | Transaction submitted but never confirmed within 2 minutes | Client crash, sequence number conflict, fee too low |
| `PARTIAL_SUBMISSION` | Envelope was broadcast but the client never received confirmation | Network interruption, RPC node failure |
| `NETWORK_STALL` | Transaction hash exists on-chain as pending but not yet finalised | Stellar network congestion (rare under SCP) |
| `UNKNOWN` | Cannot determine failure mode without more information | Requires manual investigation |

Stellar's 3–5 second finality under the Stellar Consensus Protocol means true `NETWORK_STALL` is rare. The `PENDING_TIMEOUT` threshold is set to 2 minutes (`PENDING_TIMEOUT_MS = 120_000`) to give ample buffer.

## Recovery actions

| Action | Meaning | Safe to automate? |
|---|---|---|
| `RETRY_SUBMISSION` | No certificate on-chain; safe to rebuild and resubmit | No — requires human approval |
| `ABANDON` | Cert was not minted; drop the job | Yes, after human review |
| `ALREADY_MINTED` | Certificate confirmed on-chain; mark job completed | Yes |
| `ESCALATE` | Exceeded retry limit or conflicting state | No — requires manual review |
| `AWAIT` | Network stall; wait and re-check | Yes (schedule re-check) |
| `UNKNOWN` | Cannot diagnose | No — manual review required |

## Safety contract

**The recovery module never automatically resubmits a transaction.** All `RETRY_SUBMISSION` outcomes require:

1. Operator reviews the `RecoveryDiagnosis`.
2. Operator calls `POST /api/transactions/recovery` with `operatorApproved: true`.
3. The handler re-runs diagnosis and rejects if the recommended action has changed.
4. The caller rebuilds the transaction envelope with a **fresh sequence number** from the current account state and submits through the standard signing flow.

This design prevents duplicate minting: a retry can only proceed after `checkDuplicateRisk` confirms no certificate for the manifest hash exists on-chain.

## Duplicate-mint guard

Before any retry, `checkDuplicateRisk(manifestHash)` queries `contracts/provenance` for an existing certificate. If one is found, the job is immediately classified as `ALREADY_MINTED` and no retry is permitted.

```
diagnoseOrphanedTransaction(job)
  └─► checkDuplicateRisk(manifestHash)
        └─► lookupCertificateByManifestHash()   ← queries provenance contract
  └─► fetchTransactionStatus(txHash)             ← queries Horizon / Soroban RPC
  └─► decision tree → RecoveryDiagnosis
```

## Operator runbook

### Investigating a stuck job

1. Fetch diagnosis: `GET /api/transactions/recovery?jobIds=<jobId>`
2. Read the `rationale` field to understand what the system detected.
3. If `action === "ALREADY_MINTED"`, look up the `existingCertificateId` and close the job.
4. If `action === "RETRY_SUBMISSION"` and `safeToRetry === true`:
   - Confirm on Stellar Explorer that the original transaction is absent or failed.
   - Execute: `POST /api/transactions/recovery` with `{ jobId, action: "RETRY_SUBMISSION", operatorApproved: true }`.
   - Rebuild the transaction with a fresh account sequence number.
5. If `action === "ESCALATE"`, do not retry. Open an internal review ticket.

### Preventing duplicate mints

- Always check `action !== "ALREADY_MINTED"` before initiating a retry flow.
- The `blockNewMints` flag in `DuplicateAlert` (see fraud detection) will also prevent the provenance pipeline from accepting a new submission for conflicting content.

## Configuration

| Constant | Default | Description |
|---|---|---|
| `PENDING_TIMEOUT_MS` | `120_000` | Milliseconds before a pending transaction is considered timed-out |
| `MAX_SAFE_RETRIES` | `3` | Retries beyond this require manual escalation |
