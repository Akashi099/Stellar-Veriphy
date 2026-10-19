#!/usr/bin/env node

/**
 * Provenance replay & recovery tool (#669)
 *
 * Rebuilds provenance state from raw provenance events after partial failure,
 * data loss, or incomplete chain synchronisation, and proves the rebuilt data
 * is consistent before it is re-imported.
 *
 * Commands:
 *   replay  --input <file> [--input <file> ...] --out <dir>
 *           [--checkpoint <checkpoint.json>] [--until <unix-seconds>] [--lenient]
 *       Merge event sources, replay them, and write:
 *         <dir>/checkpoint.json   resumable, tamper-evident state
 *         <dir>/index-rows.ndjson rows ready for re-import into the index
 *         <dir>/report.json       stats + every issue found
 *
 *   verify  --checkpoint <checkpoint.json> --reference <records.json|.ndjson>
 *       Check the checkpoint's integrity hash, then compare it with reference
 *       records (a provenance export or a dump of the live index).
 *
 *   diff    --a <checkpoint.json> --b <checkpoint.json>
 *       Compare two checkpoints by per-certificate hash-chain head (e.g.
 *       before/after a migration, or two independent rebuilds).
 *
 * Input files are JSON arrays or NDJSON of ProvenanceEvent objects
 * (see packages/shared/types). Exit code is 0 when consistent, 1 when errors
 * were found, 2 on usage errors. Nothing is ever written outside --out.
 *
 * Requires Node ≥ 22.18 (built-in TypeScript type stripping) because the
 * replay engine is shared with the app: packages/shared/utils/provenanceReplay.ts
 *
 * Runbook: docs/operations/provenance-replay-recovery.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const here = fileURLToPath(new URL(".", import.meta.url));
const engine = await import(pathToFileURL(resolve(here, "../packages/shared/utils/provenanceReplay.ts")).href).catch((err) => {
  console.error(
    "Could not load the replay engine. Node ≥ 22.18 with TypeScript type stripping is required.\n",
    err.message,
  );
  process.exit(2);
});

const { mergeEventSources, replayProvenance, verifyAgainstRecords, verifyCheckpoint, diffCheckpoints, toProvenanceIndexRows } =
  engine;

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    "Usage:\n" +
      "  provenance-recovery.mjs replay --input <file>... --out <dir> [--checkpoint <file>] [--until <ts>] [--lenient]\n" +
      "  provenance-recovery.mjs verify --checkpoint <file> --reference <file>\n" +
      "  provenance-recovery.mjs diff --a <checkpoint> --b <checkpoint>",
  );
  process.exit(2);
}

function readRecords(path) {
  if (!existsSync(path)) usage(`File not found: ${path}`);
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  if (text.startsWith("[")) return JSON.parse(text);
  if (text.startsWith("{") && !text.includes("\n")) {
    const obj = JSON.parse(text);
    return Array.isArray(obj.records) ? obj.records : Array.isArray(obj.events) ? obj.events : [obj];
  }
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        console.warn(`  ! ${basename(path)}:${i + 1} is not valid JSON; skipped`);
        return null;
      }
    })
    .filter(Boolean);
}

function readJson(path) {
  if (!existsSync(path)) usage(`File not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function printIssues(issues) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  console.log(`  issues: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info`);
  for (const issue of issues.filter((i) => i.severity !== "info").slice(0, 50)) {
    const where = [issue.certificateId, issue.eventId].filter(Boolean).join("/");
    console.log(`   [${issue.severity}] ${issue.kind}${where ? ` (${where})` : ""}: ${issue.message}`);
  }
  if (issues.length > 50) console.log(`   … ${issues.length - 50} more in the report`);
  return counts.error;
}

async function cmdReplay(values) {
  const inputs = values.input ?? [];
  if (inputs.length === 0) usage("--input is required");
  if (!values.out) usage("--out is required");

  const sources = inputs.map((path) => ({ name: basename(path), events: readRecords(path) }));
  console.log(`Merging ${sources.length} source(s)…`);
  const merged = await mergeEventSources(sources);

  let fromCheckpoint;
  if (values.checkpoint) {
    fromCheckpoint = readJson(values.checkpoint);
    console.log(`Resuming from checkpoint ${values.checkpoint} (cursor ${JSON.stringify(fromCheckpoint.cursor)})`);
  }

  const until = values.until !== undefined ? Number(values.until) : undefined;
  if (until !== undefined && !Number.isFinite(until)) usage("--until must be unix seconds");

  const result = await replayProvenance(merged.events, { fromCheckpoint, untilTimestamp: until, lenient: values.lenient });
  const issues = [...merged.issues, ...result.issues];

  const out = resolve(values.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "checkpoint.json"), JSON.stringify(result.checkpoint, null, 2));
  writeFileSync(
    join(out, "index-rows.ndjson"),
    toProvenanceIndexRows(result.certificates).map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  const report = {
    command: "replay",
    generatedAt: new Date().toISOString(),
    inputs,
    fromCheckpoint: values.checkpoint ?? null,
    untilTimestamp: until ?? null,
    lenient: Boolean(values.lenient),
    stats: { ...result.stats, inputEvents: merged.inputEvents },
    checkpointHash: result.checkpoint.checkpointHash,
    issues,
  };
  writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));

  console.log(`Replay complete → ${out}`);
  console.log(`  events: ${merged.inputEvents} read, ${result.stats.uniqueEvents} unique, ${result.stats.appliedEvents} applied, ` +
    `${result.stats.skippedBeforeCheckpoint} before checkpoint, ${result.stats.rejectedEvents} rejected`);
  console.log(`  certificates: ${result.stats.certificates}`);
  console.log(`  checkpointHash: ${result.checkpoint.checkpointHash}`);
  return printIssues(issues) > 0 ? 1 : 0;
}

async function cmdVerify(values) {
  if (!values.checkpoint) usage("--checkpoint is required");
  if (!values.reference) usage("--reference is required");
  const checkpoint = readJson(values.checkpoint);

  if (!(await verifyCheckpoint(checkpoint))) {
    console.error("✗ Checkpoint integrity hash does not match its contents. Do not import it.");
    return 1;
  }
  console.log("✓ Checkpoint integrity hash verified");

  const reference = readRecords(values.reference);
  const report = verifyAgainstRecords(checkpoint.certificates, reference);
  console.log(`Compared ${report.checked} reference record(s) with ${Object.keys(checkpoint.certificates).length} replayed certificate(s)`);
  printIssues(report.issues);
  console.log(report.consistent ? "✓ Consistent" : "✗ Inconsistent — see issues above");
  return report.consistent ? 0 : 1;
}

async function cmdDiff(values) {
  if (!values.a || !values.b) usage("--a and --b are required");
  const a = readJson(values.a);
  const b = readJson(values.b);
  for (const [name, cp] of [["a", a], ["b", b]]) {
    if (!(await verifyCheckpoint(cp))) {
      console.error(`✗ Checkpoint --${name} failed its integrity check.`);
      return 1;
    }
  }
  const issues = diffCheckpoints(a, b);
  if (issues.length === 0) {
    console.log("✓ Checkpoints are identical (all chain heads match)");
    return 0;
  }
  printIssues(issues);
  return 1;
}

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    input: { type: "string", multiple: true },
    out: { type: "string" },
    checkpoint: { type: "string" },
    reference: { type: "string" },
    until: { type: "string" },
    lenient: { type: "boolean", default: false },
    a: { type: "string" },
    b: { type: "string" },
  },
  strict: true,
});

const commands = { replay: cmdReplay, verify: cmdVerify, diff: cmdDiff };
if (!commands[command]) usage(command ? `Unknown command "${command}"` : undefined);

try {
  process.exit(await commands[command](values));
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
