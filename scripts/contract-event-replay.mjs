#!/usr/bin/env node

/**
 * Contract event replay (#803)
 *
 * Replays raw contract events from a local dataset and reports the mismatches,
 * duplicates, gaps and expectation failures that cause indexing bugs.
 *
 * Usage:
 *   node scripts/contract-event-replay.mjs <scenario.json> [...more files] [--json]
 *   node scripts/contract-event-replay.mjs --all [--json]
 *   node scripts/contract-event-replay.mjs <scenario.json> --indexed <records.json>
 *     [--start-ledger N] [--end-ledger N] [--json]
 *
 *   <scenario.json>  one scenario object, or an array of scenarios
 *   --all            replay every scenario in scripts/fixtures/event-replay/
 *   --indexed <f>    JSON array of indexed verification records (the shape stored
 *                    by backend/src/db/verifications.ts) to diff against the
 *                    state rebuilt from events
 *   --start-ledger N only replay events with ledger >= N (inclusive)
 *   --end-ledger N   only replay events with ledger <= N (inclusive)
 *   --json           print the reports as JSON instead of text
 *
 * Replay is deterministic: events are ordered by (ledger, txIndex, eventIndex)
 * and JSON output is emitted with sorted keys so repeated runs are byte-identical.
 * When --indexed is given, the rebuilt state is diffed against the indexed records
 * and missing or altered records are reported as errors.
 *
 * Exit code is 0 when every scenario is consistent, 1 when any scenario has an
 * error, and 2 on usage errors. Nothing is written to disk.
 *
 * Requires Node ≥ 22.18 (built-in TypeScript type stripping) because the replay
 * engine is shared with the app: packages/shared/indexing/eventReplay.ts
 *
 * Runbook: docs/operations/contract-event-replay.md
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const here = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_DIR = resolve(here, "fixtures/event-replay");

const engine = await import(
  pathToFileURL(resolve(here, "../packages/shared/indexing/eventReplay.ts")).href
).catch((err) => {
  console.error("Could not load the replay engine. This tool requires Node >= 22.18.");
  console.error(err.message);
  process.exit(2);
});

function usage(message) {
  if (message) console.error(`error: ${message}`);
  console.error("usage: contract-event-replay.mjs <scenario.json> [...] [--json]");
  console.error("       contract-event-replay.mjs --all [--json]");
  process.exit(2);
}

function loadScenarios(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    usage(`${file} is not readable JSON: ${err.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  for (const scenario of list) {
    if (typeof scenario !== "object" || scenario === null || !Array.isArray(scenario.events)) {
      usage(`${file} must contain a scenario object with an "events" array`);
    }
    if (typeof scenario.name !== "string" || scenario.name === "") {
      scenario.name = basename(file, ".json");
    }
  }
  return list;
}

function loadIndexed(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    usage(`${file} is not readable JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) {
    usage(`${file} must contain a JSON array of indexed verification records`);
  }
  return parsed;
}

function parseLedgerBound(raw, flag) {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) usage(`${flag} must be a non-negative integer`);
  return n;
}

function compareEvents(a, b) {
  return (
    (a.ledger ?? 0) - (b.ledger ?? 0) ||
    (a.txIndex ?? 0) - (b.txIndex ?? 0) ||
    (a.eventIndex ?? 0) - (b.eventIndex ?? 0) ||
    String(a.eventId ?? "").localeCompare(String(b.eventId ?? ""))
  );
}

function applyRange(scenario, startLedger, endLedger) {
  if (startLedger === undefined && endLedger === undefined) {
    return { ...scenario, events: [...scenario.events].sort(compareEvents) };
  }
  const events = scenario.events
    .filter((e) => {
      const ledger = e.ledger ?? 0;
      if (startLedger !== undefined && ledger < startLedger) return false;
      if (endLedger !== undefined && ledger > endLedger) return false;
      return true;
    })
    .sort(compareEvents);
  return { ...scenario, events };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

function formatReport(report) {
  const status = report.ok ? "PASS" : "FAIL";
  const lines = [`[${status}] ${report.scenario}`];
  const s = report.summary;
  lines.push(
    `       received ${s.received}, applied ${s.applied}, skipped ${s.skipped}, ` +
      `ledger ${s.highWaterLedger}, gaps ${s.gapCount}`
  );
  if (report.diff) {
    const d = report.diff;
    lines.push(
      `       diff matched ${d.matched}, missing ${d.missing.length}, ` +
        `altered ${d.altered.length}, unexpected ${d.unexpected.length}`
    );
  }
  for (const issue of report.issues) {
    const tag = issue.severity === "error" ? "error  " : "warning";
    const id = issue.eventId ? ` [${issue.eventId}]` : "";
    lines.push(`       ${tag} ${issue.code}${id}: ${issue.message}`);
  }
  return lines.join("\n");
}

const { values, positionals } = parseArgs({
  options: {
    all: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    indexed: { type: "string" },
    "start-ledger": { type: "string" },
    "end-ledger": { type: "string" },
  },
  allowPositionals: true,
  strict: true,
});

const startLedger = parseLedgerBound(values["start-ledger"], "--start-ledger");
const endLedger = parseLedgerBound(values["end-ledger"], "--end-ledger");
if (startLedger !== undefined && endLedger !== undefined && startLedger > endLedger) {
  usage("--start-ledger must be <= --end-ledger");
}

let files = positionals.map((p) => resolve(p));
if (values.all) {
  files = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(FIXTURE_DIR, f));
}
if (files.length === 0) usage("no scenario files given");

const indexed = values.indexed ? loadIndexed(resolve(values.indexed)) : undefined;

const scenarios = files.flatMap(loadScenarios).map((s) => applyRange(s, startLedger, endLedger));
const reports = scenarios.map((scenario) => {
  const report = engine.replayContractEvents(scenario);
  if (indexed === undefined) return report;
  if (typeof engine.diffVerificationState !== "function") {
    usage("the replay engine does not export diffVerificationState");
  }
  const diff = engine.diffVerificationState(report.state ?? {}, indexed);
  const diffIssues = diff.issues ?? [];
  return {
    ...report,
    diff,
    issues: [...report.issues, ...diffIssues],
    ok: report.ok && diffIssues.every((i) => i.severity !== "error"),
  };
});

if (values.json) {
  console.log(JSON.stringify(sortKeys(reports), null, 2));
} else {
  for (const report of reports) console.log(formatReport(report));
  const failed = reports.filter((r) => !r.ok).length;
  console.log(`\n${reports.length - failed}/${reports.length} scenarios consistent`);
}

process.exit(reports.every((r) => r.ok) ? 0 : 1);
