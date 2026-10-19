# Provenance Snapshot Diff

Labels: `feature`, `audit`, `data`

## Overview

Generates and displays structured diffs between provenance snapshots so operators can understand what changed between two versions of a certificate's on-chain record — and who made the change.

This feature supports audit trails, incident response, and dispute resolution workflows.

## How it works

A **snapshot** is a point-in-time capture of all mutable certificate fields:

- `manifestHash` — SHA-256 of the content metadata
- `attestationHash` — SHA-256 of the TEE attestation payload
- `storageRef` — IPFS/Arweave URI
- `verificationLevel` — Basic / Standard / Premium / Enterprise
- `revoked` + `revocationReason`
- `expiresAt`
- `tags`
- `actor` — the address that introduced this snapshot
- `metadata.*` sub-fields

A diff compares two snapshots field by field and marks each as `added`, `removed`, `modified`, or `unchanged`. Only changed fields are surfaced to the viewer.

## Security signals

The diff result includes two flags that drive alert banners:

| Flag | Triggered by |
|---|---|
| `hasSecurityChanges` | `manifestHash` or `attestationHash` changed |
| `hasCustodyChanges` | `creator`, `revoked`, or `revocationReason` changed |

Security changes warrant verification that the change went through a legitimate re-verification workflow. Custody changes indicate governance review is appropriate.

## Contract support

The `take_snapshot` function on the provenance contract returns a `ProvenanceCertSnapshot` struct capturing the current state of a certificate along with the address of the most recent actor from the amendment history log.

```
provenance_client.take_snapshot(&env, certificate_id) -> ProvenanceCertSnapshot
```

## API

`GET /api/provenance/[id]/snapshots` — returns the ordered snapshot history for a certificate. In production this queries the Soroban provenance contract.

## UI

- **`SnapshotDiffView`** — renders a table diff between two snapshots with change badges and field explanations.
- **`SnapshotHistoryPanel`** — lets the user select any two snapshots from a list and view the diff inline.
- **Page**: `/provenance/[id]/audit`

## Files

| File | Purpose |
|---|---|
| `packages/shared/utils/snapshotDiff.ts` | Core diff logic, types |
| `frontend/components/provenance/SnapshotDiffView.tsx` | Diff table UI |
| `frontend/components/provenance/SnapshotHistoryPanel.tsx` | Snapshot selector + diff panel |
| `frontend/app/provenance/[id]/audit/page.tsx` | Audit trail page |
| `frontend/app/api/provenance/[id]/snapshots/route.ts` | API route |
| `contracts/provenance/src/lib.rs` | `take_snapshot`, `ProvenanceCertSnapshot` struct |
