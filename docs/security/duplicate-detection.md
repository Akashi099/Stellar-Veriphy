# Duplicate Certificate Fraud Detection

**Module:** `frontend/lib/fraud/duplicateDetection.ts`  
**API:** `GET /api/certificates/duplicates`  
**Closes:** #689

## Overview

This document describes how StellarVeriphy detects duplicate or conflicting provenance certificate minting events and what alerts are raised for governance review.

## What constitutes a duplicate

| Classification | Condition | Risk |
|---|---|---|
| `EXACT_DUPLICATE` | Certificates share content hash, manifest hash, creator, and attestation proof | Low — likely a benign double-submit (e.g. client retry) |
| `SOFT_DUPLICATE` | Same content and creator, same attestation, but different certificate IDs | Medium — possible network-error retry; review for revocation |
| `CONFLICT` | Same content hash but different creator identities or attestation proofs | **High** — integrity signal; new mints blocked until resolved |

## Detection approach

1. All minted certificate records are indexed by `contentHash` and `manifestHash`.
2. Records sharing a key are grouped by `groupDuplicates()`.
3. Each group is classified by `classifyGroup()`.
4. An alert is emitted for every group with more than one member.
5. CONFLICT alerts set `blockNewMints: true`, which is checked by `checkMintGate()` before any new provenance submission.

```
scanForDuplicates(certificates)
  └─► groupDuplicates()          — index by contentHash + manifestHash
  └─► classifyGroup()            — EXACT_DUPLICATE | SOFT_DUPLICATE | CONFLICT
  └─► buildAlert()               — severity, description, blockNewMints
  └─► DuplicateScanResult        — sorted by severity (CONFLICT first)
```

## Alert severity

| Alert | Severity | Auto-blocks new mints? |
|---|---|---|
| `EXACT_DUPLICATE` | info | No |
| `SOFT_DUPLICATE` | warning | No |
| `CONFLICT` | critical | **Yes** |

## Mint gate

Before any call to `contracts/provenance` `mint_certificate`, the caller must invoke `checkMintGate(contentHash, manifestHash, existingAlerts)`. If a CONFLICT alert is active for the same content, the function returns `{ blocked: true, reason }` and the submission must be rejected.

```ts
const gate = checkMintGate(contentHash, manifestHash, activeAlerts);
if (gate.blocked) {
  throw new Error(gate.reason);
}
```

## API

### `GET /api/certificates/duplicates`

Returns a `DuplicateScanResult` for all known certificates.

Optional query parameters:
- `contentHash` — restrict scan to certificates with this content hash
- `manifestHash` — restrict scan to certificates with this manifest hash

```ts
{
  scannedCount: number;
  duplicateGroupCount: number;
  alerts: DuplicateAlert[];      // sorted: CONFLICT > SOFT_DUPLICATE > EXACT_DUPLICATE
  highRiskCount: number;         // count of CONFLICT alerts
  scannedAt: string;             // ISO 8601
}
```

## Testability

All detection logic (`classifyGroup`, `groupDuplicates`, `buildAlert`, `checkMintGate`) is implemented as pure functions with no side effects. They can be imported directly in unit tests without mocking any I/O.

## Production wiring

In production, `certificates` is sourced from the Soroban event indexer (`packages/shared/indexing/sorobanEventIndexer.ts`) which tracks all `certificate_minted` events emitted by `contracts/provenance`. The indexer should be queried on each scan to ensure the latest on-chain state is reflected.

## Governance review

CONFLICT alerts should be routed to the compliance audit trail (`frontend/lib/compliance/complianceAuditTrail.ts`) as `content_dispute_opened` entries so that resolution is formally recorded.
