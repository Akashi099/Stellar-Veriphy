#!/usr/bin/env node

/**
 * Runs the oracle contract cost benchmark and renders the performance report (#807).
 *
 * Usage:
 *   pnpm bench:contracts                       # run, write results and report
 *   pnpm bench:contracts --update-baseline     # also save these numbers as the baseline
 *   pnpm bench:contracts --from-results f.json # skip cargo, render an existing results file
 *
 * Outputs:
 *   docs/benchmarks/results/latest.json    raw numbers from the last run (committed)
 *   docs/benchmarks/results/baseline.json  numbers the next run is compared against (committed)
 *   docs/benchmarks/contract-performance.md   the rendered report (committed)
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseResults, renderReport } from "./lib/contract-benchmark.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchDir = join(root, "docs/benchmarks");
const resultsDir = join(benchDir, "results");
const latestPath = join(resultsDir, "latest.json");
const baselinePath = join(resultsDir, "baseline.json");
const reportPath = join(benchDir, "contract-performance.md");

const args = process.argv.slice(2);
const updateBaseline = args.includes("--update-baseline");
const fromIdx = args.indexOf("--from-results");
const fromResults = fromIdx === -1 ? null : args[fromIdx + 1];

function readJsonIfExists(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

function runCargoBenchmark() {
  const outFile = join(resultsDir, "latest.json");
  mkdirSync(resultsDir, { recursive: true });
  const result = spawnSync(
    "cargo",
    [
      "test",
      "--manifest-path",
      "contracts/oracle/Cargo.toml",
      "benchmark_most_used_calls",
      "--",
      "--nocapture",
      "--test-threads=1",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, BENCH_OUTPUT: outFile } }
  );
  if (result.status !== 0) {
    throw new Error(`cargo benchmark failed with exit code ${result.status ?? "unknown"}`);
  }
}

function currentCommit() {
  const res = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "unknown";
}

function main() {
  if (fromResults) {
    writeFileSync(latestPath, readFileSync(resolve(fromResults), "utf8"));
  } else {
    runCargoBenchmark();
  }

  const results = parseResults(JSON.parse(readFileSync(latestPath, "utf8")));
  const baseline = readJsonIfExists(baselinePath);

  const report = renderReport({
    results,
    baseline: baseline ? parseResults(baseline) : null,
    meta: {
      generatedAt: new Date().toISOString(),
      commit: currentCommit(),
      environment: `${process.platform} ${process.arch}, Node ${process.version}`,
    },
  });
  writeFileSync(reportPath, report);

  if (updateBaseline) {
    writeFileSync(baselinePath, JSON.stringify(results, null, 2) + "\n");
    console.log(`Baseline updated: ${baselinePath}`);
  }
  console.log(`Report written: ${reportPath}`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
