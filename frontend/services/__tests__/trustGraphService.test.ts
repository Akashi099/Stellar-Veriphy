/**
 * trustGraphService.test.ts
 *
 * Tests for the trust graph builder (#646).
 */

import {
  buildTrustGraph,
  summariseTrustGraph,
} from "@/services/trustGraphService";
import type { ProvenanceEvent, ProvenanceRecord } from "@stellarveriphy/shared/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(id: string, extra: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  return {
    id,
    storageRef: `ipfs://bafy${id}`,
    manifestHash: `m${id}`.padEnd(64, "0"),
    attestationHash: `a${id}`.padEnd(64, "0"),
    contentHash: `c${id}`.padEnd(64, "0"),
    creator: `GCREATOR${id}`.padEnd(56, "A"),
    timestamp: 1_700_000_000 + Number(id),
    status: "active",
    fileName: `file-${id}.jpg`,
    fileType: "image/jpeg",
    eventCount: 1,
    lastEventAt: 1_700_000_000 + Number(id),
    ...extra,
  };
}

function makeEvent(
  id: string,
  certId: string,
  type: ProvenanceEvent["type"],
  extra: Partial<ProvenanceEvent> = {},
): ProvenanceEvent {
  return {
    id,
    certificateId: certId,
    type,
    actor: `GACTOR${id}`.padEnd(56, "A"),
    timestamp: 1_700_000_001 + Number(id),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// buildTrustGraph
// ---------------------------------------------------------------------------

describe("buildTrustGraph", () => {
  it("creates a root node for the requested certificate", () => {
    const records = [makeRecord("100")];
    const graph = buildTrustGraph("100", records, []);

    expect(graph.rootId).toBe("100");
    expect(graph.nodes.some((n) => n.id === "100" && n.kind === "certificate")).toBe(true);
  });

  it("creates a created_by edge from certificate to creator node", () => {
    const records = [makeRecord("100")];
    const graph = buildTrustGraph("100", records, []);

    const creatorNodeId = `creator:${records[0].creator}`;
    expect(graph.nodes.some((n) => n.id === creatorNodeId)).toBe(true);
    expect(
      graph.edges.some((e) => e.source === "100" && e.kind === "created_by"),
    ).toBe(true);
  });

  it("follows certificate_linked events to related certificates", () => {
    const records = [makeRecord("100"), makeRecord("200")];
    const events: ProvenanceEvent[] = [
      makeEvent("e1", "100", "certificate_linked", {
        relatedCertificateId: "200",
        txHash: "0xabc",
      }),
    ];

    const graph = buildTrustGraph("100", records, events);

    expect(graph.nodes.some((n) => n.id === "200")).toBe(true);
    expect(
      graph.edges.some(
        (e) => e.source === "100" && e.target === "200" && e.kind === "linked",
      ),
    ).toBe(true);
  });

  it("creates transferred_to edge for ownership_transferred events", () => {
    const newOwner = "GNEWOWN3456789ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    const records = [makeRecord("100")];
    const events: ProvenanceEvent[] = [
      makeEvent("e2", "100", "ownership_transferred", {
        changes: { owner: { from: records[0].creator, to: newOwner } },
      }),
    ];

    const graph = buildTrustGraph("100", records, events);
    const ownerNodeId = `creator:${newOwner}`;

    expect(graph.nodes.some((n) => n.id === ownerNodeId)).toBe(true);
    expect(
      graph.edges.some((e) => e.kind === "transferred_to" && e.target === ownerNodeId),
    ).toBe(true);
  });

  it("does not explore beyond maxDepth hops", () => {
    // 100 → 200 → 300 chain
    const records = [makeRecord("100"), makeRecord("200"), makeRecord("300")];
    const events: ProvenanceEvent[] = [
      makeEvent("e1", "100", "certificate_linked", { relatedCertificateId: "200" }),
      makeEvent("e2", "200", "certificate_linked", { relatedCertificateId: "300" }),
    ];

    const graph = buildTrustGraph("100", records, events, 1);

    expect(graph.nodes.some((n) => n.id === "200")).toBe(true);
    // 300 is at depth 2; with maxDepth=1 it should not appear
    expect(graph.nodes.some((n) => n.id === "300")).toBe(false);
  });

  it("marks revoked certificate with revoked trust level", () => {
    const records = [makeRecord("100", { status: "revoked" })];
    const graph = buildTrustGraph("100", records, []);

    const node = graph.nodes.find((n) => n.id === "100");
    expect(node?.trustLevel).toBe("revoked");
  });

  it("returns empty graph for unknown root", () => {
    const graph = buildTrustGraph("UNKNOWN", [], []);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("does not add duplicate edges for the same link", () => {
    const records = [makeRecord("100"), makeRecord("200")];
    const events: ProvenanceEvent[] = [
      makeEvent("e1", "100", "certificate_linked", { relatedCertificateId: "200" }),
      // same link emitted again (shouldn't happen, but should be handled)
      makeEvent("e1", "100", "certificate_linked", { relatedCertificateId: "200" }),
    ];

    const graph = buildTrustGraph("100", records, events);
    const linkedEdges = graph.edges.filter((e) => e.kind === "linked");
    // Edge ids are unique so deduplication relies on id
    const uniqueEdgeIds = new Set(linkedEdges.map((e) => e.id));
    expect(uniqueEdgeIds.size).toBe(linkedEdges.length);
  });
});

// ---------------------------------------------------------------------------
// summariseTrustGraph
// ---------------------------------------------------------------------------

describe("summariseTrustGraph", () => {
  it("counts nodes and edges correctly", () => {
    const records = [makeRecord("100"), makeRecord("200")];
    const events: ProvenanceEvent[] = [
      makeEvent("e1", "100", "certificate_linked", { relatedCertificateId: "200" }),
    ];
    const graph = buildTrustGraph("100", records, events);
    const summary = summariseTrustGraph(graph);

    expect(summary.certificateNodes).toBe(2);
    expect(summary.linkEdges).toBeGreaterThanOrEqual(1);
    expect(summary.totalNodes).toBe(graph.nodes.length);
    expect(summary.totalEdges).toBe(graph.edges.length);
  });

  it("counts revoked certificates separately", () => {
    const records = [makeRecord("100", { status: "revoked" }), makeRecord("200")];
    const graph = buildTrustGraph("100", records, []);
    // 100 is not linked to 200 so 200 won't appear
    const summary = summariseTrustGraph(graph);
    expect(summary.revokedCount).toBe(1);
    expect(summary.verifiedCount).toBe(0);
  });
});
