"use client";

/**
 * TrustGraphPanel.tsx
 *
 * Visual trust graph for content lineage (#646).
 *
 * Renders certificate relationships, creator nodes, ownership transfers and
 * linked certificates as an interactive lineage graph.
 *
 * The visual representation uses a pure CSS/SVG-based force-layout approximation
 * (no external graph library dependency) to keep the bundle lean. Nodes are
 * arranged radially from the root certificate.
 *
 * Accessibility: the full graph data is also available as a structured list
 * underneath the visual for screen-reader users.
 */

import { useMemo, useState } from "react";

import type { ProvenanceEvent, ProvenanceRecord } from "@stellarveriphy/shared/types";
import {
  buildTrustGraph,
  type EdgeKind,
  summariseTrustGraph,
  type TrustGraph,
  type TrustGraphEdge,
  type TrustGraphNode,
  type TrustLevel,
} from "@/services/trustGraphService";

// ---------------------------------------------------------------------------
// Visual constants
// ---------------------------------------------------------------------------

const SVG_W = 700;
const SVG_H = 420;
const CX = SVG_W / 2;
const CY = SVG_H / 2;

const NODE_R: Record<string, number> = { certificate: 28, creator: 18, event: 14 };

const TRUST_FILL: Record<TrustLevel, string> = {
  verified: "#10b981",   // emerald-500
  pending: "#f59e0b",    // amber-500
  disputed: "#ef4444",   // red-500
  revoked: "#6b7280",    // gray-500
};

const EDGE_STROKE: Record<EdgeKind, string> = {
  linked: "#6366f1",
  derived_from: "#8b5cf6",
  owned_by: "#10b981",
  created_by: "#3b82f6",
  transferred_to: "#f59e0b",
  verified_by: "#10b981",
};

const EDGE_DASH: Partial<Record<EdgeKind, string>> = {
  derived_from: "6,3",
  transferred_to: "4,2",
};

// ---------------------------------------------------------------------------
// Radial layout
// ---------------------------------------------------------------------------

interface LayoutNode extends TrustGraphNode {
  x: number;
  y: number;
}

function radialLayout(graph: TrustGraph): LayoutNode[] {
  const { nodes, rootId } = graph;
  const result: LayoutNode[] = [];

  // Root always at center
  const root = nodes.find((n) => n.id === rootId);
  if (!root) return nodes.map((n) => ({ ...n, x: CX, y: CY }));
  result.push({ ...root, x: CX, y: CY });

  const rest = nodes.filter((n) => n.id !== rootId);

  // Separate creators and certificates
  const certs = rest.filter((n) => n.kind === "certificate");
  const creators = rest.filter((n) => n.kind === "creator");

  const certRadius = Math.min(160, SVG_W / 4);
  const creatorRadius = Math.min(270, SVG_W / 2.6);

  certs.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(certs.length, 1) - Math.PI / 2;
    result.push({
      ...n,
      x: CX + certRadius * Math.cos(angle),
      y: CY + certRadius * Math.sin(angle),
    });
  });

  creators.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(creators.length, 1) + Math.PI / 4;
    result.push({
      ...n,
      x: CX + creatorRadius * Math.cos(angle),
      y: CY + creatorRadius * Math.sin(angle),
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TrustGraphPanelProps {
  certificateId: string;
  records: ProvenanceRecord[];
  events: ProvenanceEvent[];
  /** Max link hops to explore from the root (default 3). */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrustGraphPanel({
  certificateId,
  records,
  events,
  maxDepth = 3,
}: TrustGraphPanelProps) {
  const [selectedNode, setSelectedNode] = useState<TrustGraphNode | null>(null);
  const [depth, setDepth] = useState(maxDepth);

  const graph = useMemo(
    () => buildTrustGraph(certificateId, records, events, depth),
    [certificateId, records, events, depth],
  );

  const summary = useMemo(() => summariseTrustGraph(graph), [graph]);
  const layoutNodes = useMemo(() => radialLayout(graph), [graph]);

  const nodeById = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes],
  );

  if (graph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-300 p-8 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No lineage data found for certificate #{certificateId}.
      </div>
    );
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      aria-labelledby="trust-graph-title"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4 dark:border-gray-700">
        <div>
          <h3
            id="trust-graph-title"
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            Content lineage trust graph
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {summary.certificateNodes} certificate{summary.certificateNodes !== 1 ? "s" : ""} ·{" "}
            {summary.creatorNodes} creator{summary.creatorNodes !== 1 ? "s" : ""} ·{" "}
            {summary.totalEdges} relationship{summary.totalEdges !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="graph-depth"
            className="text-xs text-gray-500 dark:text-gray-400"
          >
            Depth
          </label>
          <select
            id="graph-depth"
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            aria-label="Explore graph depth"
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d} hop{d !== 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* SVG graph */}
      <div className="overflow-x-auto p-2">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          height={SVG_H}
          role="img"
          aria-label="Trust graph showing certificate relationships and creator nodes"
          className="select-none"
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Edges */}
          {graph.edges.map((edge) => {
            const src = nodeById.get(edge.source);
            const tgt = nodeById.get(edge.target);
            if (!src || !tgt) return null;
            return (
              <line
                key={edge.id}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={EDGE_STROKE[edge.kind] ?? "#94a3b8"}
                strokeWidth={1.5}
                strokeDasharray={EDGE_DASH[edge.kind]}
                opacity={0.7}
                markerEnd="url(#arrow)"
              >
                <title>{edge.label}</title>
              </line>
            );
          })}

          {/* Nodes */}
          {layoutNodes.map((node) => {
            const r = NODE_R[node.kind] ?? 16;
            const isSelected = selectedNode?.id === node.id;
            const isRoot = node.id === graph.rootId;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                onClick={() => setSelectedNode(isSelected ? null : node)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedNode(isSelected ? null : node)}
                role="button"
                tabIndex={0}
                aria-label={`${node.kind} node: ${node.label}`}
                className="cursor-pointer"
              >
                <circle
                  r={r}
                  fill={TRUST_FILL[node.trustLevel] ?? "#6b7280"}
                  stroke={isSelected ? "#1d4ed8" : isRoot ? "#1e3a8a" : "white"}
                  strokeWidth={isSelected ? 3 : isRoot ? 2.5 : 1.5}
                  opacity={0.9}
                />
                {isRoot && (
                  <circle r={r + 5} fill="none" stroke="#3b82f6" strokeWidth={1.5} opacity={0.4} />
                )}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fontSize={node.kind === "certificate" ? 9 : 8}
                  fill="white"
                  fontWeight="600"
                  className="pointer-events-none"
                >
                  {node.kind === "certificate"
                    ? `#${node.id.slice(-4)}`
                    : node.label.slice(0, 6)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
        {(["verified", "pending", "revoked", "disputed"] as TrustLevel[]).map((level) => (
          <span key={level} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: TRUST_FILL[level] }}
              aria-hidden
            />
            {level.charAt(0).toUpperCase() + level.slice(1)}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span
            className="inline-block h-3 w-3 rounded-full ring-2 ring-blue-800"
            style={{ background: TRUST_FILL.verified }}
            aria-hidden
          />
          Root certificate
        </span>
      </div>

      {/* Selected node detail panel */}
      {selectedNode && (
        <div
          className="border-t border-gray-100 px-4 py-4 dark:border-gray-700"
          aria-live="polite"
        >
          <div className="flex items-start justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {selectedNode.label}
            </h4>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="ml-2 text-xs text-gray-400 hover:text-gray-600"
              aria-label="Dismiss node details"
            >
              ✕
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Kind</dt>
              <dd className="capitalize text-gray-900 dark:text-gray-100">{selectedNode.kind}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Trust</dt>
              <dd
                className="capitalize font-medium"
                style={{ color: TRUST_FILL[selectedNode.trustLevel] }}
              >
                {selectedNode.trustLevel}
              </dd>
            </div>
            {Object.entries(selectedNode.meta).map(([k, v]) => (
              <div key={k}>
                <dt className="text-gray-500 dark:text-gray-400 capitalize">{k.replace(/([A-Z])/g, " $1")}</dt>
                <dd className="truncate font-mono text-gray-900 dark:text-gray-100">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Accessible node list */}
      <details className="border-t border-gray-100 dark:border-gray-700">
        <summary className="cursor-pointer px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          View graph as structured list (accessibility)
        </summary>
        <div className="px-4 pb-4">
          <ul className="mt-2 space-y-1 text-xs text-gray-700 dark:text-gray-300" aria-label="All graph nodes">
            {graph.nodes.map((node) => (
              <li key={node.id}>
                <span className="font-semibold capitalize">{node.kind}</span>: {node.label} —{" "}
                <span className="capitalize">{node.trustLevel}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-xs text-gray-700 dark:text-gray-300" aria-label="All graph relationships">
            {graph.edges.map((edge) => {
              const src = graph.nodes.find((n) => n.id === edge.source);
              const tgt = graph.nodes.find((n) => n.id === edge.target);
              return (
                <li key={edge.id}>
                  {src?.label ?? edge.source} → {edge.label} → {tgt?.label ?? edge.target}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    </section>
  );
}
