"use client";

import type { ProvenanceEvent } from "@stellarveriphy/shared/types";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  ACTIVITY_SORT_LABELS,
  ACTIVITY_TIME_RANGES,
  type ActivitySort,
  type ActivityTimeRange,
  type ActivityTypeFilter,
  selectActivity,
} from "@/lib/provenance/activity";
import {
  EVENT_CATEGORY,
  EVENT_LABELS,
  type EventCategory,
  relativeTime,
  shortKey,
} from "@/lib/provenance/data";

import { DashboardEmptyState } from "./DashboardEmptyState";

const CATEGORY_STYLE: Record<EventCategory, string> = {
  verification: "bg-blue-500",
  certificate: "bg-emerald-500",
  update: "bg-violet-500",
};

const FILTERS: { key: ActivityTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "verification", label: "Verifications" },
  { key: "certificate", label: "Certificates" },
  { key: "update", label: "Updates" },
];

function dayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

interface RecentActivityTimelineProps {
  events: ProvenanceEvent[];
  limit?: number;
}

export function RecentActivityTimeline({ events, limit = 30 }: RecentActivityTimelineProps) {
  const [filter, setFilter] = useState<ActivityTypeFilter>("all");
  const [range, setRange] = useState<ActivityTimeRange>("all");
  const [sort, setSort] = useState<ActivitySort>("newest");

  const groups = useMemo(() => {
    const selected = selectActivity(events, {
      category: filter,
      range,
      sort,
      limit,
      now: Math.floor(Date.now() / 1000),
    });
    const map = new Map<string, ProvenanceEvent[]>();
    for (const e of selected) {
      const k = dayLabel(e.timestamp);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [events, filter, range, sort, limit]);

  const filtersApplied = filter !== "all" || range !== "all";
  const showAll = () => {
    setFilter("all");
    setRange("all");
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent activity</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="activity-range">Time range</label>
          <select
            id="activity-range"
            value={range}
            onChange={(e) => setRange(e.target.value as ActivityTimeRange)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {ACTIVITY_TIME_RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="activity-sort">Sort order</label>
          <select
            id="activity-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as ActivitySort)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          >
            {(Object.keys(ACTIVITY_SORT_LABELS) as ActivitySort[]).map((s) => (
              <option key={s} value={s}>{ACTIVITY_SORT_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div role="tablist" aria-label="Filter activity" className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-5">
          {events.length === 0 ? (
            <DashboardEmptyState
              heading="No activity yet"
              body="Your verification and certificate activity will appear here after you upload content."
              actionLabel="Upload content"
              actionHref="/creator/upload-content"
            />
          ) : (
            <DashboardEmptyState
              heading={filtersApplied ? "No matching activity" : "No activity yet"}
              body="No events match the selected type and time range. Show all activity to see every event."
              actionLabel="Show all activity"
              onAction={showAll}
            />
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(([day, dayEvents]) => (
            <div key={day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{day}</h3>
              <ol className="relative border-l border-gray-200 dark:border-gray-700">
                {dayEvents.map((e) => (
                  <li key={e.id} className="mb-3 ml-4 last:mb-0">
                    <span
                      className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white dark:ring-gray-800 ${CATEGORY_STYLE[EVENT_CATEGORY[e.type]]}`}
                      aria-hidden
                    />
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        <span className="font-medium">{EVENT_LABELS[e.type]}</span>{" "}
                        <Link
                          href={`/provenance/${e.certificateId}`}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          #{e.certificateId}
                        </Link>
                      </p>
                      <time
                        dateTime={new Date(e.timestamp * 1000).toISOString()}
                        title={new Date(e.timestamp * 1000).toLocaleString()}
                        className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
                      >
                        {relativeTime(e.timestamp)}
                      </time>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 break-words">
                      {e.details} · by <span className="font-mono">{shortKey(e.actor)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
