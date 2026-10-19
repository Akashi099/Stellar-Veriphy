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
 *
 *   <scenario.json>  one scenario object, or an array of scenarios
 *   --all            replay every scenario in scripts/fixtures/event-replay/
 *   --json           print the reports as JSON instead of text
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

function formatReport(report) {
  const status = report.ok ? "PASS" : "FAIL";
  const lines = [`[${status}] ${report.scenario}`];
  const s = report.summary;
  lines.push(
    `       received ${s.received}, applied ${s.applied}, skipped ${s.skipped}, ` +
      `ledger ${s.highWaterLedger}, gaps ${s.gapCount}`
  );
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
  },
  allowPositionals: true,
  strict: true,
});

let files = positionals.map((p) => resolve(p));
if (values.all) {
  files = readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(FIXTURE_DIR, f));
}
if (files.length === 0) usage("no scenario files given");

const scenarios = files.flatMap(loadScenarios);
const reports = scenarios.map((scenario) => engine.replayContractEvents(scenario));

if (values.json) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) console.log(formatReport(report));
  const failed = reports.filter((r) => !r.ok).length;
  console.log(`\n${reports.length - failed}/${reports.length} scenarios consistent`);
}

process.exit(reports.every((r) => r.ok) ? 0 : 1);
