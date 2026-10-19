import { describe, expect, it } from "vitest";
import {
  PROOF_EVENT_SCHEMAS,
  decodeProofEvent,
  getProofEventSchema,
} from "../indexing/proofEvents";
import { createEventIndexer, type RawSorobanEvent } from "../indexing/sorobanEventIndexer";

const PROVENANCE_ID = "CPROVENANCE";
const ORACLE_ID = "CORACLE";
const OWNER = "GOWNER";

let seq = 0;
function raw(partial: Partial<RawSorobanEvent> & Pick<RawSorobanEvent, "topic">): RawSorobanEvent {
  seq++;
  return {
    id: `evt-${seq}`,
    ledger: 100 + seq,
    ledgerClosedAt: "2026-10-19T00:00:00Z",
    contractId: PROVENANCE_ID,
    type: "contract",
    value: {},
    txHash: `tx-${seq}`,
    inSuccessfulContractCall: true,
    ...partial,
  };
}

describe("proof event schemas", () => {
  it("has one schema per event name", () => {
    const names = PROOF_EVENT_SCHEMAS.map((s) => s.eventName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("decodes a #[contractevent] with topic fields and a data map", () => {
    const record = decodeProofEvent(
      raw({ topic: ["certificate_revoked", "42", OWNER], value: { reason: "fraud" } })
    );
    expect(record).toMatchObject({
      kind: "certificate_revoked",
      category: "certificate",
      subjectKind: "certificate",
      subjectId: "42",
      actor: OWNER,
      fields: { certificate_id: "42", owner: OWNER, reason: "fraud" },
      schemaValid: true,
    });
  });

  it("decodes an oracle tuple payload", () => {
    const record = decodeProofEvent(
      raw({ contractId: ORACLE_ID, topic: ["dispute_filed"], value: [7, 3, "GPROV", "GREQ"] })
    );
    expect(record).toMatchObject({
      subjectKind: "dispute",
      subjectId: "7",
      actor: "GREQ",
      fields: { dispute_id: 7, request_id: 3, provider: "GPROV", requester: "GREQ" },
      schemaValid: true,
    });
  });

  it("flags payloads that do not match the contract schema instead of dropping them", () => {
    const record = decodeProofEvent(raw({ topic: ["metadata_updated", "42"], value: {} }));
    expect(record?.schemaValid).toBe(false);
    expect(record?.schemaErrors).toEqual([
      "expected 2 topic field(s) after the event name, got 1",
      'missing data field "new_version"',
    ]);
  });

  it("ignores non-proof events and events from unpinned contracts", () => {
    expect(decodeProofEvent(raw({ topic: ["pause"], value: OWNER }))).toBeNull();
    expect(
      decodeProofEvent(raw({ contractId: "COTHER", topic: ["cancelled"], value: 1 }), {
        oracle: ORACLE_ID,
      })
    ).toBeNull();
    expect(getProofEventSchema("cancelled")?.contract).toBe("oracle");
  });
});

describe("SorobanEventIndexer proof indexing", () => {
  it("makes proof events queryable by subject, including batch events", () => {
    const indexer = createEventIndexer({
      proofContracts: { provenance: PROVENANCE_ID, oracle: ORACLE_ID },
    });
    indexer.ingestBatch([
      raw({ topic: ["certificate_minted", OWNER, "1", "sha256:abc"], value: {} }),
      raw({ topic: ["batch_minted", OWNER], value: { certificate_ids: [1, 2], count: 2 } }),
      raw({ topic: ["certificate_endorsed", "2", "GEND"], value: { total_endorsements: 1 } }),
      raw({ contractId: ORACLE_ID, topic: ["submitted"], value: [9, 100] }),
      raw({ contractId: ORACLE_ID, topic: ["pause"], value: OWNER }),
    ]);

    expect(indexer.proofHistory("certificate", "1").map((e) => e.eventName)).toEqual([
      "certificate_minted",
      "batch_minted",
    ]);
    expect(indexer.proofHistory("certificate", "2").map((e) => e.eventName)).toEqual([
      "batch_minted",
      "certificate_endorsed",
    ]);
    expect(indexer.query({ proofCategory: "verification_request" }).events).toHaveLength(1);
    expect(indexer.query({ proofOnly: true }).total).toBe(4);
    expect(indexer.state()).toMatchObject({
      eventCount: 5,
      proofEventCount: 4,
      proofSchemaViolations: 0,
    });
  });

  it("skips failed calls and ignores re-ingested ids so the index stays consistent", () => {
    const indexer = createEventIndexer();
    const minted = raw({ topic: ["certificate_minted", OWNER, "5", "sha256:def"], value: {} });
    indexer.ingest(minted);
    indexer.ingest(minted);
    indexer.ingest(
      raw({
        topic: ["certificate_revoked", "5", OWNER],
        value: { reason: "x" },
        inSuccessfulContractCall: false,
      })
    );

    expect(indexer.proofHistory("certificate", "5")).toHaveLength(1);
    expect(indexer.query({ contractId: PROVENANCE_ID }).total).toBe(2);
    expect(indexer.state().duplicatesIgnored).toBe(1);
  });
});
