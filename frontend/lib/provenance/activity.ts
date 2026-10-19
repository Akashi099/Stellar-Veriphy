import type { ProvenanceEvent } from "@stellarveriphy/shared/types";

import { EVENT_CATEGORY, type EventCategory } from "./data";

export type ActivitySort = "newest" | "oldest";
export type ActivityTimeRange = "all" | "24h" | "7d" | "30d";
export type ActivityTypeFilter = EventCategory | "all";

export const ACTIVITY_TIME_RANGES: { key: ActivityTimeRange; label: string; seconds: number | null }[] = [
  { key: "all", label: "All time", seconds: null },
  { key: "24h", label: "Last 24 hours", seconds: 86_400 },
  { key: "7d", label: "Last 7 days", seconds: 7 * 86_400 },
  { key: "30d", label: "Last 30 days", seconds: 30 * 86_400 },
];

export const ACTIVITY_SORT_LABELS: Record<ActivitySort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
};

export interface ActivityQuery {
  category: ActivityTypeFilter;
  range: ActivityTimeRange;
  sort: ActivitySort;
  /** Keeps the most recent `limit` matching events, whatever the display order. */
  limit: number;
  /** Unix seconds; the time range is measured back from this instant. */
  now: number;
}

/**
 * Filters activity by event category and time range, keeps the most recent `limit` matches,
 * then orders them for display. Ties on timestamp fall back to id so the order is stable.
 * Never mutates `events`.
 */
export function selectActivity(events: ProvenanceEvent[], query: ActivityQuery): ProvenanceEvent[] {
  const range = ACTIVITY_TIME_RANGES.find((r) => r.key === query.range);
  const since = range?.seconds == null ? Number.NEGATIVE_INFINITY : query.now - range.seconds;
  const direction = query.sort === "newest" ? -1 : 1;

  const recent = events
    .filter((e) => query.category === "all" || EVENT_CATEGORY[e.type] === query.category)
    .filter((e) => e.timestamp >= since)
    .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id))
    .slice(0, query.limit);

  return recent.sort((a, b) => direction * (a.timestamp - b.timestamp) || a.id.localeCompare(b.id));
}
