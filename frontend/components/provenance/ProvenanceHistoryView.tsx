"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProvenanceEvent, ProvenanceRecord } from "@stellarveriphy/shared/types";
import { EVENT_CATEGORY, EVENT_LABELS, shortKey, type EventCategory } from "@/lib/provenance/data";

const DOT: Record<EventCategory, string> = {
  verification: "bg-blue-500",
  certificate: "bg-emerald-500",
  update: "bg-violet-500",
};

const STATUS_BADGE: Record<ProvenanceRecord["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  expired: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

function elapsed(from: number, to: number): string {
  const d = to - from;
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min later`;
  if (d < 86_400) return `${Math.round(d / 3600)} h later`;
  return `${Math.round(d / 86_400)} days later`;
}

interface ProvenanceHistoryViewProps {
  record: ProvenanceRecord;
  events: ProvenanceEvent[]; // oldest first
}

export function ProvenanceHistoryView({ record, events }: ProvenanceHistoryViewProps) {
  const COLLAPSED = 8;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded || events.length <= COLLAPSED ? events : events.slice(0, COLLAPSED);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4">
      <header className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Certificate #{record.id}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[record.status]}`}>
            {record.status}
          </span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ["Asset", record.fileName ?? "—"],
            ["Current owner", record.creator],
            ["Content hash", record.contentHash],
            ["Minted", new Date(record.timestamp * 1000).toLocaleString()],
            ["Events", String(events.length)],
            ["Last change", new Date(record.lastEventAt * 1000).toLocaleString()],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
              <dd className="truncate font-mono text-gray-900 dark:text-gray-100" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Provenance history
        </h2>
        <ol className="relative border-l-2 border-gray-200 dark:border-gray-700">
          {visible.map((e, i) => (
            <li key={e.id} className="mb-6 ml-6 last:mb-0">
              <span
                className={`absolute -left-[9px] mt-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-gray-50 dark:ring-gray-900 ${DOT[EVENT_CATEGORY[e.type]]}`}
                aria-hidden
              />
              <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-white">
                    <span className="mr-2 text-xs text-gray-400">{i + 1}.</span>
                    {EVENT_LABELS[e.type]}
                  </p>
                  <time dateTime={new Date(e.timestamp * 1000).toISOString()} className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(e.timestamp * 1000).toLocaleString()}
                    {i > 0 && <span className="ml-1">({elapsed(visible[i - 1].timestamp, e.timestamp)})</span>}
                  </time>
                </div>
                {e.details && <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{e.details}</p>}
                {e.changes && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {Object.entries(e.changes).map(([field, c]) => (
                      <li key={field} className="font-mono text-gray-700 dark:text-gray-300 break-all">
                        <span className="font-semibold">{field}:</span>{" "}
                        <span className="text-red-600 line-through dark:text-red-400">{c.from ? shortKey(c.from) : "—"}</span>
                        {" → "}
                        <span className="text-emerald-700 dark:text-emerald-400">{c.to ? shortKey(c.to) : "—"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Actor <span className="font-mono">{shortKey(e.actor)}</span>
                  {e.txHash && <> · tx <span className="font-mono">{e.txHash.slice(0, 10)}…</span></>}
                  {e.relatedCertificateId && (
                    <>
                      {" · related "}
                      <Link href={`/provenance/${e.relatedCertificateId}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        #{e.relatedCertificateId}
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {events.length > COLLAPSED && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-4 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? "Show fewer events" : `Show all ${events.length} events`}
          </button>
        )}
      </section>
    </div>
  );
}
