# Event Deduplication on Chain Listeners (#794)

> **Code:** `packages/shared/indexing/sorobanEventIndexer.ts` · **Tests:** `packages/shared/tests/eventDeduplication.test.ts`, `packages/shared/tests/proofEvents.test.ts` · **See also:** [proof event indexing](proof-event-indexing.md), [contract event replay](../operations/contract-event-replay.md)

Listeners read contract events from Soroban RPC by paging through ledgers. The same event can reach the indexer more than once:

- **Overlapping pages.** A listener restarts from its last checkpoint and fetches events it already processed.
- **Reindexing.** An operator replays a ledger range to repair the index.
- **Re-broadcast.** A second RPC provider, or a provider that reindexed its own store, returns the same on-chain event under a **different id**.
- **Corrupt or forked sources.** A provider returns an event whose id matches one already indexed but whose content is different.

If any of these reached the proof indexes, a certificate's history would show two mints, request counts would be inflated, and anything derived from them would be wrong. The indexer therefore classifies every incoming event before it touches any index.

## How an event is classified

Every event gets a **content fingerprint**: canonical JSON (sorted keys) of everything except its id — `contractId`, `type`, `ledger`, `txHash`, `topic`, `value` and `inSuccessfulContractCall`. Two copies of the same on-chain event produce the same fingerprint whatever id or key order the source used (`eventFingerprint` in the indexer module).

```
incoming event
   │
   ├─ id already indexed?
   │     ├─ same fingerprint  → duplicate (reason: same_id)      first copy kept
   │     └─ other fingerprint → conflict                          first copy kept
   │
   ├─ fingerprint already indexed under another id?  (dedupeByContent, default on)
   │     └─ yes → duplicate (reason: same_content)                first copy kept
   │
   └─ otherwise → indexed
```

| Outcome | Index changed? | Counter in `state()` | Audit record |
|---|---|---|---|
| `indexed` | yes | `eventCount`, `proofEventCount` | — |
| `duplicate` (`same_id`) | no | `duplicatesIgnored` | `duplicates()` |
| `duplicate` (`same_content`) | no | `duplicatesIgnored`, `duplicatesByContent` | `duplicates()` |
| `conflict` | no | `conflictsDetected` | `conflicts()` |

The classification runs before proof decoding and before the ledger, contract and subject indexes are written. A duplicate or conflict never changes proof history, never moves the high-water ledger and never records a ledger gap. **The first copy always wins**, so the index only depends on which copy arrived first and never on how many copies follow.

## API

```ts
const indexer = createEventIndexer({
  proofContracts: { provenance: PROVENANCE_ID, oracle: ORACLE_ID },
  dedupeByContent: true,  // default
  maxAuditRecords: 1000,  // default; oldest records are dropped first
});

// Unchanged: returns the indexed event (the existing copy for duplicates/conflicts).
indexer.ingest(raw);

// New: also says what happened.
const { outcome, event, duplicate, conflict } = indexer.ingestWithOutcome(raw);

indexer.duplicates(); // DuplicateRecord[]: eventId, canonicalEventId, reason, ledger, txHash, detectedAt
indexer.conflicts();  // ConflictRecord[]: eventId, ledger, txHash, existingFingerprint, incomingFingerprint, detectedAt
indexer.state();      // … duplicatesIgnored, duplicatesByContent, conflictsDetected
```

`ingest` keeps its old signature and behaviour for existing callers.

## Operating a listener

- **Duplicates are normal.** A steady `duplicatesIgnored` count after restarts or replays is expected and needs no action.
- **Conflicts are not.** Any `conflictsDetected > 0` means a source returned two different events under one id. Alert on it, inspect `conflicts()`, and compare against a second RPC provider or the [event replay tool](../operations/contract-event-replay.md), which applies the same first-copy-wins rule. Do not delete the indexed copy until you know which source is right.
- **A rising `duplicatesByContent`** means a provider is renumbering events. Pin one provider per network, or check that the provider's reindex finished.
- **Checkpoints.** Persist `state().highWaterLedger` and restart from it. Re-reading the checkpoint ledger is safe because of the rules above.

## When to turn content dedupe off

`dedupeByContent` treats two events with identical content in the same transaction and ledger as one. None of the StellarVeriphy contracts emit identical events within a single call, because each payload carries a certificate, request or dispute id. If you index a contract that can emit the same event twice in one transaction, create its indexer with `dedupeByContent: false`. Same-id duplicates and conflicts are still caught.
