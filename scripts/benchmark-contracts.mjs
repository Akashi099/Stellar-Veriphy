#!/usr/bin/env node

/**
 * Runs the contract cost benchmarks and renders the performance report (#807, #793).
 *
 * Usage:
 *   pnpm bench:contracts                          # run every contract, write results and report
 *   pnpm bench:contracts --contracts oracle,registry  # run a subset (others are not measured)
 *   pnpm bench:contracts --update-baseline        # also save these numbers as the baseline
 *   pnpm bench:contracts --from-results f.json    # skip cargo, render an existing results file
 *
 * Outputs:
 *   docs/benchmarks/results/latest.json    raw numbers from the last run (committed)
 *   docs/benchmarks/results/baseline.json  numbers the next run is compared against (committed)
 *   docs/benchmarks/contract-performance.md   the rendered report (committed)
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** Contracts with a `benchmark_most_used_calls` test in `contracts/<name>/src/benchmark.rs`. */
const ALL_CONTRACTS = ["oracle", "provenance", "registry"];
const contractsIdx = args.indexOf("--contracts");
const contracts =
  contractsIdx === -1 ? ALL_CONTRACTS : args[contractsIdx + 1].split(",").map((c) => c.trim());
for (const c of contracts) {
  if (!ALL_CONTRACTS.includes(c)) {
    throw new Error(`unknown contract "${c}" (expected one of ${ALL_CONTRACTS.join(", ")})`);
  }
}

function readJsonIfExists(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

// Runs one contract's benchmark and returns its samples.
function runCargoBenchmark(contract) {
  const outFile = join(resultsDir, `.${contract}.partial.json`);
  const result = spawnSync(
    "cargo",
    [
      "test",
      "--manifest-path",
      `contracts/${contract}/Cargo.toml`,
      "benchmark_most_used_calls",
      "--",
      "--nocapture",
      "--test-threads=1",
    ],
    { cwd: root, stdio: "inherit", env: { ...process.env, BENCH_OUTPUT: outFile } }
  );
  if (result.status !== 0) {
    throw new Error(
      `cargo benchmark for ${contract} failed with exit code ${result.status ?? "unknown"}`
    );
  }
  const samples = JSON.parse(readFileSync(outFile, "utf8"));
  rmSync(outFile, { force: true });
  return samples;
}

function currentCommit() {
  const res = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "unknown";
}

function main() {
  mkdirSync(resultsDir, { recursive: true });
  if (fromResults) {
    writeFileSync(latestPath, readFileSync(resolve(fromResults), "utf8"));
  } else {
    const merged = contracts.flatMap((c) => runCargoBenchmark(c));
    writeFileSync(latestPath, JSON.stringify(merged, null, 2) + "\n");
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
