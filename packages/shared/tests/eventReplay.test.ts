import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  parseRawEvent,
  replayContractEvents,
  type ReplayScenario,
} from "../indexing/eventReplay";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../../scripts/fixtures/event-replay/", import.meta.url)
);

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "0000000100-0000000001",
    ledger: 100,
    ledgerClosedAt: "2026-10-01T10:00:00Z",
    contractId: "C_PROVENANCE",
    type: "contract",
    topic: ["minted"],
    value: 1,
    txHash: "tx-a",
    inSuccessfulContractCall: true,
    ...overrides,
  };
}

function scenario(events: unknown[], extra: Partial<ReplayScenario> = {}): ReplayScenario {
  return { name: "test", contractId: "C_PROVENANCE", events, ...extra };
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("parseRawEvent", () => {
  it("accepts a well-formed event", () => {
    const result = parseRawEvent(event());
    expect(result.ok).toBe(true);
  });

  it.each([
    ["missing id", { id: undefined }, "id must be a non-empty string"],
    ["non-integer ledger", { ledger: 1.5 }, "ledger must be a positive integer"],
    ["zero ledger", { ledger: 0 }, "ledger must be a positive integer"],
    [
      "bad timestamp",
      { ledgerClosedAt: "yesterday" },
      "ledgerClosedAt must be an ISO 8601 date-time",
    ],
    ["unknown type", { type: "log" }, "type must be one of"],
    ["non-string topic", { topic: [1] }, "topic must be an array of strings"],
    [
      "string success flag",
      { inSuccessfulContractCall: "true" },
      "inSuccessfulContractCall must be a boolean",
    ],
  ])("rejects %s", (_label, overrides, reason) => {
    const result = parseRawEvent(event(overrides));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });

  it("rejects non-object input", () => {
    expect(parseRawEvent("not an event").ok).toBe(false);
    expect(parseRawEvent(null).ok).toBe(false);
  });
});

describe("canonicalJson", () => {
  it("ignores key order", () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(
      canonicalJson({ b: { d: 3, c: 2 }, a: 1 })
    );
  });

  it("distinguishes different values", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe("replayContractEvents", () => {
  it("applies events in ledger then id order and summarises them", () => {
    const report = replayContractEvents(
      scenario([
        event({ id: "0000000101-0000000001", ledger: 101, topic: ["revoked"] }),
        event({ id: "0000000100-0000000002", topic: ["minted"] }),
        event({ id: "0000000100-0000000001", topic: ["minted"] }),
      ])
    );

    expect(report.ok).toBe(true);
    expect(report.appliedEventIds).toEqual([
      "0000000100-0000000001",
      "0000000100-0000000002",
      "0000000101-0000000001",
    ]);
    expect(report.summary).toMatchObject({
      received: 3,
      applied: 3,
      skipped: 0,
      highWaterLedger: 101,
      gapCount: 0,
      eventNameCounts: { minted: 2, revoked: 1 },
    });
  });

  it("applies an identical duplicate once and reports a warning", () => {
    const report = replayContractEvents(scenario([event(), event()]));
    expect(report.ok).toBe(true);
    expect(report.summary.applied).toBe(1);
    expect(codes(report.issues)).toEqual(["duplicate_event"]);
    expect(report.issues[0]?.severity).toBe("warning");
  });

  it("flags conflicting duplicates as errors and keeps the first copy", () => {
    const report = replayContractEvents(scenario([event({ value: 1 }), event({ value: 99 })]));
    expect(report.ok).toBe(false);
    expect(codes(report.issues)).toEqual(["conflicting_event"]);
    expect(report.summary.applied).toBe(1);
  });

  it("treats an expected conflict as consistent when declared with expectErrors", () => {
    const report = replayContractEvents(
      scenario([event({ value: 1 }), event({ value: 99 })], { expectErrors: ["conflicting_event"] })
    );
    expect(report.ok).toBe(true);
  });

  it("fails when the errors found differ from expectErrors", () => {
    const report = replayContractEvents(
      scenario([event({ value: 1 }), event({ value: 99 })], { expectErrors: ["malformed_event"] })
    );
    expect(report.ok).toBe(false);
  });

  it("skips malformed events without stopping the replay", () => {
    const report = replayContractEvents(scenario([{ id: "bad" }, event()]));
    expect(report.ok).toBe(false);
    expect(codes(report.issues)).toEqual(["malformed_event"]);
    expect(report.summary).toMatchObject({ received: 2, applied: 1, skipped: 1 });
  });

  it("reports a ledger gap as a warning and counts it", () => {
    const report = replayContractEvents(
      scenario([event(), event({ id: "0000000104-0000000001", ledger: 104 })])
    );
    expect(report.ok).toBe(true);
    expect(report.summary.gapCount).toBe(1);
    expect(report.issues.find((i) => i.code === "ledger_gap")?.message).toContain(
      "ledgers 101–103"
    );
  });

  it("does not index events from failed contract calls", () => {
    const report = replayContractEvents(
      scenario([event(), event({ id: "0000000100-0000000002", inSuccessfulContractCall: false })])
    );
    expect(report.summary.applied).toBe(1);
    expect(codes(report.issues)).toEqual(["failed_call_event"]);
  });

  it("skips diagnostic events silently", () => {
    const report = replayContractEvents(scenario([event({ type: "diagnostic" })]));
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.summary.applied).toBe(0);
  });

  it("skips events from other contracts when a contract is pinned", () => {
    const report = replayContractEvents(
      scenario([event(), event({ id: "0000000100-0000000002", contractId: "C_ORACLE" })])
    );
    expect(report.summary.applied).toBe(1);
    expect(codes(report.issues)).toEqual(["foreign_contract_event"]);
  });

  it("applies events from every contract when none is pinned", () => {
    const report = replayContractEvents({
      name: "unpinned",
      events: [event(), event({ id: "0000000100-0000000002", contractId: "C_ORACLE" })],
    });
    expect(report.summary.applied).toBe(2);
    expect(report.ok).toBe(true);
  });

  describe("expectations", () => {
    it("passes when every expectation is met", () => {
      const report = replayContractEvents(
        scenario([event(), event({ id: "0000000100-0000000002" })], {
          expected: {
            eventCount: 2,
            highWaterLedger: 100,
            gapCount: 0,
            eventNameCounts: { minted: 2 },
            eventIds: ["0000000100-0000000001", "0000000100-0000000002"],
          },
        })
      );
      expect(report.ok).toBe(true);
    });

    it("reports a count mismatch", () => {
      const report = replayContractEvents(scenario([event()], { expected: { eventCount: 2 } }));
      expect(report.ok).toBe(false);
      expect(report.issues.at(-1)?.message).toBe("eventCount: expected 2, replay applied 1");
    });

    it("reports a per-event-name mismatch, including names that were never applied", () => {
      const report = replayContractEvents(
        scenario([event()], { expected: { eventNameCounts: { revoked: 1 } } })
      );
      const messages = report.issues.map((i) => i.message);
      expect(messages).toContain('event "minted": expected 0, replay applied 1');
      expect(messages).toContain('event "revoked": expected 1, replay applied 0');
    });

    it("reports expected events that were not applied and applied events that were not expected", () => {
      const report = replayContractEvents(
        scenario([event()], { expected: { eventIds: ["0000000100-0000000009"] } })
      );
      const messages = report.issues.map((i) => i.message);
      expect(messages).toContain("expected event 0000000100-0000000009 was not applied");
      expect(messages).toContain("event 0000000100-0000000001 was applied but not expected");
    });

    it("reports gap and high-water mismatches", () => {
      const report = replayContractEvents(
        scenario([event()], { expected: { highWaterLedger: 200, gapCount: 3 } })
      );
      const messages = report.issues.map((i) => i.message);
      expect(messages).toContain("highWaterLedger: expected 200, replay reached 100");
      expect(messages).toContain("gapCount: expected 3, replay found 0");
    });
  });
});

describe("shipped fixtures", () => {
  const fixtures = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  it("ships a representative set of scenarios", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
  });

  it.each(fixtures)("%s is consistent with its own expectations", (file) => {
    const parsed = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")) as ReplayScenario;
    const report = replayContractEvents(parsed);
    expect(report.ok, JSON.stringify(report.issues, null, 2)).toBe(true);
  });
});
