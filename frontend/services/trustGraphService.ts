/**
 * trustGraphService.ts
 *
 * Builds and queries the content lineage trust graph (#646).
 *
 * The graph connects:
 *  - ProvenanceRecords (nodes) via certificate links, ownership transfers
 *    and regeneration chains (edges).
 *  - Creator public keys (actor nodes).
 *  - Verification events (timeline nodes).
 *
 * The service produces a lightweight adjacency representation that can be
 * rendered with any graph library, or consumed as structured data by a
 * server-rendered page.
 */

import type { ProvenanceEvent, ProvenanceRecord } from "@stellarveriphy/shared/types";
import type { ApiResponse } from "@stellarveriphy/shared/types";

// ---------------------------------------------------------------------------
// Graph primitives
// ---------------------------------------------------------------------------

export type NodeKind = "certificate" | "creator" | "event";
export type EdgeKind =
  | "linked"            // certificate_linked event
  | "derived_from"      // regeneration predecessor reference
  | "owned_by"          // current ownership edge (cert → creator)
  | "created_by"        // original creation edge (cert → creator)
  | "transferred_to"    // ownership_transferred event
  | "verified_by";      // verification_completed event

export type TrustLevel = "verified" | "pending" | "disputed" | "revoked";

export interface TrustGraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  trustLevel: TrustLevel;
  /** ISO 8601 or Unix seconds. */
  timestamp: string | number;
  /** Additional display metadata keyed by field name. */
  meta: Record<string, string | number | boolean>;
}

export interface TrustGraphEdge {
  id: string;
  source: string;   // node id
  target: string;   // node id
  kind: EdgeKind;
  label: string;
  timestamp: string | number;
  txHash?: string;
}

export interface TrustGraph {
  nodes: TrustGraphNode[];
  edges: TrustGraphEdge[];
  /** The root certificate that was used to build the graph. */
  rootId: string;
  /** Total relationship depth explored. */
  depth: number;
}

// ---------------------------------------------------------------------------
// Trust level derivation
// ---------------------------------------------------------------------------

function deriveTrustLevel(record: ProvenanceRecord): TrustLevel {
  if (record.status === "revoked") return "revoked";
  if (record.status === "active") return "verified";
  return "pending";
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/**
 * Builds a TrustGraph from a flat dataset of records and events.
 *
 * @param rootId - The certificate to treat as the root node.
 * @param records - All available ProvenanceRecords.
 * @param events  - All available ProvenanceEvents (unfiltered).
 * @param maxDepth - How many hops away from the root to explore (default: 3).
 */
export function buildTrustGraph(
  rootId: string,
  records: ProvenanceRecord[],
  events: ProvenanceEvent[],
  maxDepth = 3,
): TrustGraph {
  const recordMap = new Map(records.map((r) => [r.id, r]));
  const nodes = new Map<string, TrustGraphNode>();
  const edges: TrustGraphEdge[] = [];
  const visited = new Set<string>();

  // --- helper: upsert a node ---
  const upsertCertNode = (record: ProvenanceRecord) => {
    if (nodes.has(record.id)) return;
    nodes.set(record.id, {
      id: record.id,
      kind: "certificate",
      label: record.fileName ? `#${record.id} — ${record.fileName}` : `Certificate #${record.id}`,
      trustLevel: deriveTrustLevel(record),
      timestamp: record.timestamp,
      meta: {
        creator: record.creator,
        status: record.status,
        fileType: record.fileType ?? "",
        eventCount: record.eventCount,
      },
    });
  };

  const upsertCreatorNode = (key: string, ts: number | string) => {
    const nodeId = `creator:${key}`;
    if (nodes.has(nodeId)) return nodeId;
    nodes.set(nodeId, {
      id: nodeId,
      kind: "creator",
      label: `${key.slice(0, 6)}…${key.slice(-4)}`,
      trustLevel: "verified",
      timestamp: ts,
      meta: { publicKey: key },
    });
    return nodeId;
  };

  // --- BFS over certificate links ---
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    const { id, depth } = item;
    if (visited.has(id) || depth > maxDepth) continue;
    visited.add(id);

    const record = recordMap.get(id);
    if (!record) continue;

    upsertCertNode(record);

    // creator node + created_by edge
    const creatorNodeId = upsertCreatorNode(record.creator, record.timestamp);
    edges.push({
      id: `${id}:created_by:${creatorNodeId}`,
      source: id,
      target: creatorNodeId,
      kind: "created_by",
      label: "created by",
      timestamp: record.timestamp,
    });

    // events for this certificate
    const certEvents = events.filter((e) => e.certificateId === id);
    for (const ev of certEvents) {
      if (ev.type === "certificate_linked" && ev.relatedCertificateId) {
        const targetId = ev.relatedCertificateId;
        const edgeId = `${id}:linked:${targetId}:${ev.id}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({
            id: edgeId,
            source: id,
            target: targetId,
            kind: "linked",
            label: "linked to",
            timestamp: ev.timestamp,
            txHash: ev.txHash,
          });
        }
        if (!visited.has(targetId)) queue.push({ id: targetId, depth: depth + 1 });
      }

      if (ev.type === "ownership_transferred" && ev.changes?.owner) {
        const newOwner = ev.changes.owner.to;
        const ownerNodeId = upsertCreatorNode(newOwner, ev.timestamp);
        edges.push({
          id: `${id}:transferred_to:${ownerNodeId}:${ev.id}`,
          source: id,
          target: ownerNodeId,
          kind: "transferred_to",
          label: "transferred to",
          timestamp: ev.timestamp,
          txHash: ev.txHash,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
    rootId,
    depth: maxDepth,
  };
}

// ---------------------------------------------------------------------------
// Summary helpers (used by the "trust at a glance" panel)
// ---------------------------------------------------------------------------

export interface TrustSummary {
  totalNodes: number;
  certificateNodes: number;
  creatorNodes: number;
  verifiedCount: number;
  pendingCount: number;
  revokedCount: number;
  disputedCount: number;
  totalEdges: number;
  linkEdges: number;
  transferEdges: number;
}

export function summariseTrustGraph(graph: TrustGraph): TrustSummary {
  const certs = graph.nodes.filter((n) => n.kind === "certificate");
  const creators = graph.nodes.filter((n) => n.kind === "creator");

  return {
    totalNodes: graph.nodes.length,
    certificateNodes: certs.length,
    creatorNodes: creators.length,
    verifiedCount: certs.filter((n) => n.trustLevel === "verified").length,
    pendingCount: certs.filter((n) => n.trustLevel === "pending").length,
    revokedCount: certs.filter((n) => n.trustLevel === "revoked").length,
    disputedCount: certs.filter((n) => n.trustLevel === "disputed").length,
    totalEdges: graph.edges.length,
    linkEdges: graph.edges.filter((e) => e.kind === "linked").length,
    transferEdges: graph.edges.filter((e) => e.kind === "transferred_to").length,
  };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Fetches the trust graph for a given certificate from the backend. */
export async function fetchTrustGraph(
  certificateId: string,
  depth = 3,
): Promise<ApiResponse<TrustGraph>> {
  try {
    const url = `/api/certificates/${encodeURIComponent(certificateId)}/trust-graph?depth=${depth}`;
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: Could not fetch trust graph` };
    }
    return { success: true, data: await response.json() as TrustGraph };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error fetching trust graph",
    };
  }
}
