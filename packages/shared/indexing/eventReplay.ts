/**
 * eventReplay.ts (#803)
 *
 * Replays raw contract events against a local dataset so indexing and state
 * mismatches can be reproduced and explained without a live network.
 *
 * Pipeline:
 *   1. parse    — validate each raw event; malformed events are reported and skipped.
 *   2. dedupe   — identical copies are reported as duplicates; copies that share an
 *                 id but differ in content are conflicts (the first copy is kept).
 *   3. scope    — events from another contract are skipped when a contract is pinned.
 *   4. order    — stable order by ledger, then id.
 *   5. apply    — events from failed contract calls are not state and are skipped;
 *                 ledger gaps are reported.
 *   6. compare  — the result is checked against optional expectations and each
 *                 difference is reported as an issue.
 *
 * This is an independent reference implementation. It deliberately does not reuse
 * SorobanEventIndexer, so the replay can be used to check the live indexer's output.
 *
 * IMPORTANT: this module has only type imports so that `scripts/contract-event-replay.mjs`
 * can load it directly with Node's built-in TypeScript type stripping (Node ≥ 22.18).
 * Do not add runtime imports or TS-only runtime syntax (enums, namespaces, parameter
 * properties).
 *
 * Runbook: docs/operations/contract-event-replay.md
 *
 * @module packages/shared/indexing/eventReplay
 */

import type { RawSorobanEvent, SorobanEventType } from "./sorobanEventIndexer";

export const EVENT_REPLAY_VERSION = "1.0.0";

const EVENT_TYPES: readonly SorobanEventType[] = ["contract", "system", "diagnostic"];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReplayIssueSeverity = "error" | "warning";

export type ReplayIssueCode =
  | "malformed_event"
  | "duplicate_event"
  | "conflicting_event"
  | "foreign_contract_event"
  | "failed_call_event"
  | "ledger_gap"
  | "expectation_mismatch";

export interface ReplayIssue {
  severity: ReplayIssueSeverity;
  code: ReplayIssueCode;
  message: string;
  eventId?: string;
}

export interface ReplayExpectation {
  /** Number of events that must be applied. */
  eventCount?: number;
  /** Highest ledger that must be applied. */
  highWaterLedger?: number;
  /** Number of ledger gaps that must be detected. */
  gapCount?: number;
  /** Applied event count per event name (the first topic symbol). */
  eventNameCounts?: Record<string, number>;
  /** Exact set of applied event ids, order-independent. */
  eventIds?: string[];
}

export interface ReplayScenario {
  name: string;
  description?: string;
  /** When set, events from any other contract are skipped. */
  contractId?: string;
  /** Raw events as they would come from RPC or an export. Validated during replay. */
  events: unknown[];
  expected?: ReplayExpectation;
  /**
   * Error codes this scenario is designed to trigger (used by the fixtures that
   * demonstrate failures). The scenario is consistent when the error codes found
   * match this list exactly. Default: no errors are expected.
   */
  expectErrors?: ReplayIssueCode[];
}

export interface ReplaySummary {
  received: number;
  applied: number;
  skipped: number;
  highWaterLedger: number;
  gapCount: number;
  eventNameCounts: Record<string, number>;
}

export interface ReplayReport {
  scenario: string;
  ok: boolean;
  summary: ReplaySummary;
  appliedEventIds: string[];
  issues: ReplayIssue[];
}

// ---------------------------------------------------------------------------
// Parsing and validation
// ---------------------------------------------------------------------------

type ParseResult = { ok: true; event: RawSorobanEvent } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Returns the first problem with a raw event, or the typed event when it is well formed.
export function parseRawEvent(input: unknown): ParseResult {
  if (!isRecord(input)) return { ok: false, reason: "event must be a JSON object" };

  const { id, ledger, ledgerClosedAt, contractId, type, topic, txHash, inSuccessfulContractCall } =
    input;

  if (typeof id !== "string" || id.trim() === "")
    return { ok: false, reason: "id must be a non-empty string" };
  if (typeof ledger !== "number" || !Number.isInteger(ledger) || ledger < 1) {
    return {
      ok: false,
      reason: `ledger must be a positive integer (got ${JSON.stringify(ledger)})`,
    };
  }
  if (typeof ledgerClosedAt !== "string" || Number.isNaN(Date.parse(ledgerClosedAt))) {
    return { ok: false, reason: "ledgerClosedAt must be an ISO 8601 date-time" };
  }
  if (typeof contractId !== "string" || contractId.trim() === "") {
    return { ok: false, reason: "contractId must be a non-empty string" };
  }
  if (typeof type !== "string" || !EVENT_TYPES.includes(type as SorobanEventType)) {
    return { ok: false, reason: `type must be one of ${EVENT_TYPES.join(", ")}` };
  }
  if (!Array.isArray(topic) || !topic.every((t) => typeof t === "string")) {
    return { ok: false, reason: "topic must be an array of strings" };
  }
  if (typeof txHash !== "string" || txHash.trim() === "") {
    return { ok: false, reason: "txHash must be a non-empty string" };
  }
  if (typeof inSuccessfulContractCall !== "boolean") {
    return { ok: false, reason: "inSuccessfulContractCall must be a boolean" };
  }

  return {
    ok: true,
    event: {
      id,
      ledger,
      ledgerClosedAt,
      contractId,
      type: type as SorobanEventType,
      topic,
      value: input.value,
      txHash,
      inSuccessfulContractCall,
    },
  };
}

// Stable JSON with sorted keys, so two copies of an event compare equal regardless of key order.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort();
}

function compareEvents(a: RawSorobanEvent, b: RawSorobanEvent): number {
  if (a.ledger !== b.ledger) return a.ledger - b.ledger;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function replayContractEvents(scenario: ReplayScenario): ReplayReport {
  const issues: ReplayIssue[] = [];
  const seen = new Map<string, { event: RawSorobanEvent; fingerprint: string }>();
  const candidates: RawSorobanEvent[] = [];
  let skipped = 0;

  // 1–3. parse, dedupe and scope
  scenario.events.forEach((raw, index) => {
    const parsed = parseRawEvent(raw);
    if (!parsed.ok) {
      skipped += 1;
      issues.push({
        severity: "error",
        code: "malformed_event",
        message: `event at index ${index} is malformed: ${parsed.reason}`,
      });
      return;
    }

    const { event } = parsed;
    const fingerprint = canonicalJson(event);
    const previous = seen.get(event.id);
    if (previous) {
      skipped += 1;
      if (previous.fingerprint === fingerprint) {
        issues.push({
          severity: "warning",
          code: "duplicate_event",
          eventId: event.id,
          message: `event ${event.id} appears more than once with identical content; applied once`,
        });
      } else {
        issues.push({
          severity: "error",
          code: "conflicting_event",
          eventId: event.id,
          message: `event ${event.id} appears more than once with different content; the first copy was kept`,
        });
      }
      return;
    }
    seen.set(event.id, { event, fingerprint });

    if (scenario.contractId !== undefined && event.contractId !== scenario.contractId) {
      skipped += 1;
      issues.push({
        severity: "warning",
        code: "foreign_contract_event",
        eventId: event.id,
        message: `event ${event.id} is from ${event.contractId}, not ${scenario.contractId}; skipped`,
      });
      return;
    }

    candidates.push(event);
  });

  // 4–5. order, then apply state-relevant events and detect gaps
  candidates.sort(compareEvents);

  const applied: RawSorobanEvent[] = [];
  const eventNameCounts: Record<string, number> = {};
  let highWaterLedger = 0;
  let gapCount = 0;

  for (const event of candidates) {
    if (event.type === "diagnostic") {
      skipped += 1;
      continue;
    }
    if (!event.inSuccessfulContractCall) {
      skipped += 1;
      issues.push({
        severity: "warning",
        code: "failed_call_event",
        eventId: event.id,
        message: `event ${event.id} came from a failed contract call and is not state; skipped`,
      });
      continue;
    }

    if (highWaterLedger > 0 && event.ledger > highWaterLedger + 1) {
      gapCount += 1;
      issues.push({
        severity: "warning",
        code: "ledger_gap",
        message: `ledgers ${highWaterLedger + 1}–${event.ledger - 1} have no events in this dataset`,
      });
    }
    highWaterLedger = Math.max(highWaterLedger, event.ledger);

    const name = event.topic[0] ?? "unknown";
    eventNameCounts[name] = (eventNameCounts[name] ?? 0) + 1;
    applied.push(event);
  }

  const appliedEventIds = applied.map((e) => e.id);
  const summary: ReplaySummary = {
    received: scenario.events.length,
    applied: applied.length,
    skipped,
    highWaterLedger,
    gapCount,
    eventNameCounts,
  };

  // 6. compare with expectations
  const expected = scenario.expected;
  if (expected) {
    const mismatch = (message: string) =>
      issues.push({ severity: "error", code: "expectation_mismatch", message });

    if (expected.eventCount !== undefined && expected.eventCount !== applied.length) {
      mismatch(`eventCount: expected ${expected.eventCount}, replay applied ${applied.length}`);
    }
    if (expected.highWaterLedger !== undefined && expected.highWaterLedger !== highWaterLedger) {
      mismatch(
        `highWaterLedger: expected ${expected.highWaterLedger}, replay reached ${highWaterLedger}`
      );
    }
    if (expected.gapCount !== undefined && expected.gapCount !== gapCount) {
      mismatch(`gapCount: expected ${expected.gapCount}, replay found ${gapCount}`);
    }
    if (expected.eventNameCounts) {
      const names = new Set([
        ...Object.keys(expected.eventNameCounts),
        ...Object.keys(eventNameCounts),
      ]);
      for (const name of [...names].sort()) {
        const want = expected.eventNameCounts[name] ?? 0;
        const got = eventNameCounts[name] ?? 0;
        if (want !== got) mismatch(`event "${name}": expected ${want}, replay applied ${got}`);
      }
    }
    if (expected.eventIds) {
      const want = new Set(expected.eventIds);
      const got = new Set(appliedEventIds);
      for (const id of [...want].filter((x) => !got.has(x)).sort()) {
        mismatch(`expected event ${id} was not applied`);
      }
      for (const id of [...got].filter((x) => !want.has(x)).sort()) {
        mismatch(`event ${id} was applied but not expected`);
      }
    }
  }

  const foundErrorCodes = uniqueSorted(
    issues.filter((i) => i.severity === "error").map((i) => i.code)
  );
  const expectedErrorCodes = uniqueSorted(scenario.expectErrors ?? []);
  const ok =
    foundErrorCodes.length === expectedErrorCodes.length &&
    foundErrorCodes.every((code, index) => code === expectedErrorCodes[index]);

  return {
    scenario: scenario.name,
    ok,
    summary,
    appliedEventIds,
    issues,
  };
}
