# Proof event indexing

> Issue #790 · Labels: contracts, blockchain, indexing

`SorobanEventIndexer` (`packages/shared/indexing/sorobanEventIndexer.ts`) decodes proof and verification events from the **provenance** and **oracle** contracts into typed records. You can query them by certificate, verification request or dispute. The event mapping lives in `packages/shared/indexing/proofEvents.ts` (`PROOF_EVENT_SCHEMAS`). Each entry names the on-chain definition it mirrors.

| Layer | Location |
|---|---|
| Schema registry and decoder | `packages/shared/indexing/proofEvents.ts` |
| Indexer integration | `packages/shared/indexing/sorobanEventIndexer.ts` |
| Tests | `packages/shared/tests/proofEvents.test.ts` |

## How events map to proof records

Soroban emits events in two shapes in this repo:

- **provenance** (soroban-sdk 23, `#[contractevent]`): `topic = [snake_case struct name, ...#[topic] fields in declaration order]`. `value` is a **map** of the remaining fields, or empty when there are none.
- **oracle** (soroban-sdk 21, `env.events().publish`): `topic = [event symbol]`. `value` is the published data: a **tuple** (decoded as an array) or a **scalar**.

Every recognised event gets a `proof` record:

```ts
interface ProofEventRecord {
  kind: string;                // event name, e.g. "certificate_revoked"
  contract: "provenance" | "oracle";
  category: "certificate" | "verification_request" | "dispute";
  subjectKind: "certificate" | "request" | "dispute";
  subjectId: string;           // u64 ids normalised to strings
  actor?: string;              // account that caused it, when the event carries one
  fields: Record<string, unknown>; // topic + data fields by name
  schemaVersion: string;
  schemaValid: boolean;
  schemaErrors: string[];
}
```

### provenance: certificates

| Event (`topic[0]`) | Source | Topic fields | Data | Subject | Actor |
|---|---|---|---|---|---|
| `certificate_minted` | `CertificateMinted` | `owner`, `certificate_id`, `manifest_hash` | none | certificate | `owner` |
| `batch_minted` | `BatchMinted` | `owner` | map: `certificate_ids`, `count` | each id in `certificate_ids` | `owner` |
| `certificate_transferred` | `CertificateTransferred` | `certificate_id`, `from`, `to` | none | certificate | `from` |
| `metadata_updated` | `MetadataUpdated` | `certificate_id`, `updated_by` | map: `new_version` | certificate | `updated_by` |
| `certificate_revoked` | `CertificateRevoked` | `certificate_id`, `owner` | map: `reason` | certificate | `owner` |
| `certificate_renewed` | `CertificateRenewed` | `certificate_id`, `renewed_by` | map: `new_expires_at` | certificate | `renewed_by` |
| `certificate_expiration_warning` | `CertificateExpirationWarning` | `certificate_id`, `owner` | map: `expires_at` | certificate | `owner` |
| `verification_level_updated` | `VerificationLevelUpdated` | `certificate_id`, `updated_by` | map: `new_level` | certificate | `updated_by` |
| `certificates_linked` | `CertificatesLinked` | `certificate_id`, `related_id` | map: `relation` | certificate | n/a |
| `certificate_endorsed` | `CertificateEndorsed` | `certificate_id`, `endorser` | map: `total_endorsements` | certificate | `endorser` |
| `endorsement_removed` | `EndorsementRemoved` | `certificate_id`, `endorser` | map: `total_endorsements` | certificate | `endorser` |
| `certificate_locked_event` | `CertificateLockedEvent` | `certificate_id`, `locked_by` | none | certificate | `locked_by` |
| `rollback_recorded` | `record_rollback` | `certificate_id` | scalar: `rollback_id` | certificate | n/a |

### oracle: verification requests and disputes

| Event | Source fn | Data | Subject | Actor |
|---|---|---|---|---|
| `submitted` | `create_pending_request` | tuple: `request_id`, `fee` | request | n/a |
| `batch_submitted` | `submit_batch_request` | scalar: `request_ids` | each id in `request_ids` | n/a |
| `cancelled` | `cancel_request` | scalar: `request_id` | request | n/a |
| `expiring_soon` | `check_expiration_warning` | tuple: `request_id`, `remaining_ledgers` | request | n/a |
| `archived` | `archive_old_requests` | scalar: `request_id` | request | n/a |
| `dispute_filed` | `file_dispute` | tuple: `dispute_id`, `request_id`, `provider`, `requester` | dispute | `requester` |
| `dispute_resolved` | `resolve_dispute` | tuple: `dispute_id`, `provider`, `resolution`, `reputation_penalty` | dispute | n/a |
| `dispute_dismissed` | `dismiss_dispute` | tuple: `dispute_id`, `provider`, `requester` | dispute | n/a |
| `dispute_evidence_anchored` | `anchor_dispute_evidence` | tuple: `dispute_id`, `package_hash`, `submitter` | dispute | `submitter` |

Operational events (`pause`, `provider_added`, `stake_slashed`, `sla_violation`, and so on) are still indexed as plain events but don't get a `proof` record.

## Consistency rules

- **Schema checks never drop data.** If a payload doesn't match its schema (wrong topic count, missing map field, wrong tuple length), the event is still indexed with `schemaValid: false` and the reasons in `schemaErrors`. It is counted in `state().proofSchemaViolations`. A non-zero count usually means a contract changed and `proofEvents.ts` needs updating.
- **Failed calls aren't proofs.** Events with `inSuccessfulContractCall: false`, and non-`contract` events, are indexed without a `proof` record.
- **Re-ingest is idempotent.** An event id that is already indexed is ignored (`state().duplicatesIgnored`), so replays and overlapping RPC pages don't create duplicate history. Re-broadcasts under a new id and reused ids with different content are handled too. See [event deduplication](event-deduplication.md) (#794).
- **Pin contract ids in production.** Names like `submitted` or `cancelled` are generic. Pass `proofContracts` so only events from the real provenance and oracle contracts are decoded:

  ```ts
  const indexer = createEventIndexer({
    proofContracts: { provenance: PROVENANCE_CONTRACT_ID, oracle: ORACLE_CONTRACT_ID },
  });
  ```

## Querying

```ts
// Full lifecycle of certificate 42 (mint, endorsements, revocation …), oldest first
indexer.proofHistory("certificate", "42");

// All disputes in a ledger range
indexer.query({ proofCategory: "dispute", fromLedger: 51_000, toLedger: 52_000 });

// Proof events whose payload didn't match the schema
indexer.query({ proofOnly: true, schemaValid: false });

// Combine with existing filters
indexer.query({ contractId: ORACLE_CONTRACT_ID, subjectKind: "request", subjectId: "9" });
```

New `EventQuery` fields: `proofOnly`, `proofCategory`, `subjectKind`, `subjectId` and `schemaValid`. Any of them restricts results to proof events. `state()` now also reports `proofEventCount`, `proofSchemaViolations` and `duplicatesIgnored`.

## Examples

**Raw** `CertificateRevoked`, as decoded from RPC `getEvents`:

```json
{
  "id": "0000219902325555200-0000000001",
  "ledger": 51200,
  "ledgerClosedAt": "2026-10-19T12:00:00Z",
  "contractId": "CPROVENANCE…",
  "type": "contract",
  "topic": ["certificate_revoked", "42", "GOWNER…"],
  "value": { "reason": "Source media was manipulated" },
  "txHash": "9f2c…",
  "inSuccessfulContractCall": true
}
```

**Indexed** `proof` record:

```json
{
  "kind": "certificate_revoked",
  "contract": "provenance",
  "category": "certificate",
  "subjectKind": "certificate",
  "subjectId": "42",
  "actor": "GOWNER…",
  "fields": { "certificate_id": "42", "owner": "GOWNER…", "reason": "Source media was manipulated" },
  "schemaVersion": "1.0.0",
  "schemaValid": true,
  "schemaErrors": []
}
```

**Raw** oracle `dispute_filed`, followed by its decoded `proof`:

```json
{ "topic": ["dispute_filed"], "value": [7, 3, "GPROVIDER…", "GREQUESTER…"] }
```

```json
{
  "kind": "dispute_filed",
  "category": "dispute",
  "subjectKind": "dispute",
  "subjectId": "7",
  "actor": "GREQUESTER…",
  "fields": { "dispute_id": 7, "request_id": 3, "provider": "GPROVIDER…", "requester": "GREQUESTER…" },
  "schemaValid": true
}
```

## Adding a new proof event

1. Emit it from the contract. Prefer `#[contractevent]` so topics and data are typed.
2. Add an entry to `PROOF_EVENT_SCHEMAS` with `source` pointing at the definition, its `topicFields` in declaration order, its `dataFormat` and `dataFields`, the `subject` and optionally `actorField`.
3. Add a row to the tables above and a case to `packages/shared/tests/proofEvents.test.ts`.
4. If an existing event's shape changes, bump `PROOF_EVENT_SCHEMA_VERSION`.
