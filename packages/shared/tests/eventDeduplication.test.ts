import { describe, expect, it } from "vitest";
import {
  createEventIndexer,
  eventFingerprint,
  type RawSorobanEvent,
} from "../indexing/sorobanEventIndexer";

const PROVENANCE_ID = "CPROVENANCE";
const OWNER = "GOWNER";

function raw(overrides: Partial<RawSorobanEvent> = {}): RawSorobanEvent {
  return {
    id: "0000000100-0000000001",
    ledger: 100,
    ledgerClosedAt: "2026-10-01T10:00:00Z",
    contractId: PROVENANCE_ID,
    type: "contract",
    topic: ["certificate_minted", OWNER, "7", "sha256:abc"],
    value: { storage_ref: "ipfs://a", attestation_hash: "sha256:att" },
    txHash: "tx-a",
    inSuccessfulContractCall: true,
    ...overrides,
  };
}

describe("eventFingerprint", () => {
  it("ignores the id and object key order", () => {
    const a = raw({ value: { x: 1, y: 2 } });
    const b = raw({ id: "other", value: { y: 2, x: 1 } });
    expect(eventFingerprint(a)).toBe(eventFingerprint(b));
  });

  it("changes when content changes", () => {
    expect(eventFingerprint(raw())).not.toBe(eventFingerprint(raw({ value: { other: true } })));
  });
});

describe("SorobanEventIndexer deduplication (#794)", () => {
  it("ignores a re-delivered event with the same id", () => {
    const indexer = createEventIndexer();
    expect(indexer.ingestWithOutcome(raw()).outcome).toBe("indexed");
    const second = indexer.ingestWithOutcome(raw());

    expect(second.outcome).toBe("duplicate");
    expect(second.duplicate).toMatchObject({ reason: "same_id", canonicalEventId: raw().id });
    expect(indexer.proofHistory("certificate", "7")).toHaveLength(1);
    expect(indexer.state()).toMatchObject({
      eventCount: 1,
      proofEventCount: 1,
      duplicatesIgnored: 1,
      duplicatesByContent: 0,
    });
  });

  it("ignores a re-broadcast of the same event under a new id", () => {
    const indexer = createEventIndexer();
    indexer.ingest(raw());
    const rebroadcast = indexer.ingestWithOutcome(raw({ id: "reindexed-42" }));

    expect(rebroadcast.outcome).toBe("duplicate");
    expect(rebroadcast.event.id).toBe(raw().id);
    expect(rebroadcast.duplicate).toMatchObject({
      eventId: "reindexed-42",
      canonicalEventId: raw().id,
      reason: "same_content",
    });
    expect(indexer.query().total).toBe(1);
    expect(indexer.proofHistory("certificate", "7")).toHaveLength(1);
    expect(indexer.state()).toMatchObject({ duplicatesIgnored: 1, duplicatesByContent: 1 });
  });

  it("keeps the first copy and records a conflict when an id is reused with different content", () => {
    const indexer = createEventIndexer();
    indexer.ingest(raw());
    const result = indexer.ingestWithOutcome(raw({ topic: ["certificate_revoked", "7", OWNER] }));

    expect(result.outcome).toBe("conflict");
    expect(result.event.eventName).toBe("certificate_minted");
    expect(indexer.query({ eventName: "certificate_revoked" }).total).toBe(0);
    expect(indexer.conflicts()).toHaveLength(1);
    expect(indexer.conflicts()[0].existingFingerprint).not.toBe(
      indexer.conflicts()[0].incomingFingerprint
    );
    expect(indexer.state()).toMatchObject({
      eventCount: 1,
      proofEventCount: 1,
      conflictsDetected: 1,
      duplicatesIgnored: 0,
    });
  });

  it("indexes distinct events from the same transaction", () => {
    const indexer = createEventIndexer();
    indexer.ingest(raw());
    const endorsed = indexer.ingestWithOutcome(
      raw({ id: "0000000100-0000000002", topic: ["certificate_endorsed", "7", OWNER], value: {} })
    );
    expect(endorsed.outcome).toBe("indexed");
    expect(indexer.proofHistory("certificate", "7")).toHaveLength(2);
  });

  it("can turn content dedupe off", () => {
    const indexer = createEventIndexer({ dedupeByContent: false });
    indexer.ingest(raw());
    expect(indexer.ingestWithOutcome(raw({ id: "second" })).outcome).toBe("indexed");
    expect(indexer.query().total).toBe(2);
  });

  it("does not advance the high-water mark or record gaps for duplicates", () => {
    const indexer = createEventIndexer();
    indexer.ingest(raw({ ledger: 100 }));
    indexer.ingest(raw({ id: "late-copy", ledger: 100 }));
    expect(indexer.state()).toMatchObject({ highWaterLedger: 100, gaps: [] });
  });

  it("bounds the audit logs to maxAuditRecords", () => {
    const indexer = createEventIndexer({ maxAuditRecords: 2 });
    indexer.ingest(raw());
    for (let i = 0; i < 5; i++) indexer.ingest(raw({ id: `copy-${i}` }));

    expect(indexer.duplicates().map((d) => d.eventId)).toEqual(["copy-3", "copy-4"]);
    expect(indexer.state().duplicatesIgnored).toBe(5);
  });
});
