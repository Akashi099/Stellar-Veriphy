import type { ProvenanceEvent } from "@stellarveriphy/shared/types";

import { type ActivityQuery,selectActivity } from "../provenance/activity";

const NOW = 1_800_000_000;
const DAY = 86_400;

function event(id: string, type: ProvenanceEvent["type"], ageSeconds: number): ProvenanceEvent {
  return {
    id,
    certificateId: "cert-1",
    type,
    actor: "GABC",
    timestamp: NOW - ageSeconds,
  };
}

const events = [
  event("e1", "verification_submitted", 60),
  event("e2", "verification_completed", 2 * DAY),
  event("e3", "certificate_minted", 10 * DAY),
  event("e4", "verification_failed", 40 * DAY),
  event("e5", "certificate_minted", 3 * 3600),
];

function query(overrides: Partial<ActivityQuery> = {}): ActivityQuery {
  return { category: "all", range: "all", sort: "newest", limit: 30, now: NOW, ...overrides };
}

const ids = (list: ProvenanceEvent[]) => list.map((e) => e.id);

describe("selectActivity", () => {
  it("sorts newest first by default", () => {
    expect(ids(selectActivity(events, query()))).toEqual(["e1", "e5", "e2", "e3", "e4"]);
  });

  it("sorts oldest first when asked", () => {
    expect(ids(selectActivity(events, query({ sort: "oldest" })))).toEqual(["e4", "e3", "e2", "e5", "e1"]);
  });

  it("filters by event category", () => {
    expect(ids(selectActivity(events, query({ category: "verification" })))).toEqual(["e1", "e2", "e4"]);
  });

  it("filters by time range measured back from now", () => {
    expect(ids(selectActivity(events, query({ range: "24h" })))).toEqual(["e1", "e5"]);
    expect(ids(selectActivity(events, query({ range: "7d" })))).toEqual(["e1", "e5", "e2"]);
    expect(ids(selectActivity(events, query({ range: "30d" })))).toEqual(["e1", "e5", "e2", "e3"]);
  });

  it("combines category and time range", () => {
    expect(ids(selectActivity(events, query({ category: "verification", range: "7d" })))).toEqual(["e1", "e2"]);
  });

  it("keeps the most recent matches when the limit cuts the list, regardless of sort order", () => {
    expect(ids(selectActivity(events, query({ limit: 2 })))).toEqual(["e1", "e5"]);
    expect(ids(selectActivity(events, query({ limit: 2, sort: "oldest" })))).toEqual(["e5", "e1"]);
  });

  it("orders events with the same timestamp by id so the order is stable", () => {
    const tied = [event("b", "verification_submitted", 100), event("a", "verification_submitted", 100)];
    expect(ids(selectActivity(tied, query()))).toEqual(["a", "b"]);
    expect(ids(selectActivity(tied, query({ sort: "oldest" })))).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const before = ids(events);
    selectActivity(events, query({ sort: "oldest" }));
    expect(ids(events)).toEqual(before);
  });

  it("returns an empty list when nothing matches", () => {
    expect(selectActivity(events, query({ category: "update" }))).toEqual([]);
  });
});
