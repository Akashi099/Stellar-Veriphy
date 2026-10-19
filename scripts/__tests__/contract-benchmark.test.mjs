import { test } from "node:test";
import assert from "node:assert/strict";

import {
  compareWithBaseline,
  findImprovementOpportunities,
  parseResults,
  renderReport,
} from "../lib/contract-benchmark.mjs";

const sample = [
  { op: "get_request", cpuInstructions: 1000, memoryBytes: 100 },
  { op: "submit_request:normal", cpuInstructions: 5000, memoryBytes: 900 },
  { op: "cancel_request", cpuInstructions: 2000, memoryBytes: 300 },
];

test("parseResults sorts by op and accepts valid entries", () => {
  const parsed = parseResults(sample);
  assert.deepEqual(
    parsed.map((r) => r.op),
    ["cancel_request", "get_request", "submit_request:normal"]
  );
});

test("parseResults rejects empty input and malformed entries", () => {
  assert.throws(() => parseResults([]), /non-empty array/);
  assert.throws(() => parseResults([{ cpuInstructions: 1, memoryBytes: 1 }]), /missing an "op"/);
  assert.throws(
    () => parseResults([{ op: "x", cpuInstructions: -1, memoryBytes: 1 }]),
    /invalid cpuInstructions/
  );
  assert.throws(
    () => parseResults([{ op: "x", cpuInstructions: 1.5, memoryBytes: 1 }]),
    /invalid cpuInstructions/
  );
});

test("compareWithBaseline flags regressions beyond the tolerance", () => {
  const baseline = [{ op: "get_request", cpuInstructions: 1000, memoryBytes: 100 }];
  const current = [{ op: "get_request", cpuInstructions: 1200, memoryBytes: 100 }];
  const { rows } = compareWithBaseline(current, baseline, 0.1);
  assert.equal(rows[0].status, "regression");
  assert.ok(Math.abs(rows[0].deltaPct - 0.2) < 1e-9);
});

test("compareWithBaseline treats changes within tolerance as ok and big drops as improved", () => {
  const baseline = [
    { op: "a", cpuInstructions: 1000, memoryBytes: 1 },
    { op: "b", cpuInstructions: 1000, memoryBytes: 1 },
  ];
  const current = [
    { op: "a", cpuInstructions: 1050, memoryBytes: 1 },
    { op: "b", cpuInstructions: 500, memoryBytes: 1 },
  ];
  const { rows } = compareWithBaseline(current, baseline, 0.1);
  assert.equal(rows.find((r) => r.op === "a").status, "ok");
  assert.equal(rows.find((r) => r.op === "b").status, "improved");
});

test("compareWithBaseline marks new ops and reports ops dropped from the run", () => {
  const baseline = [{ op: "old_op", cpuInstructions: 1, memoryBytes: 1 }];
  const current = [{ op: "new_op", cpuInstructions: 1, memoryBytes: 1 }];
  const { rows, missing } = compareWithBaseline(current, baseline);
  assert.equal(rows[0].status, "new");
  assert.deepEqual(missing, ["old_op"]);
});

test("findImprovementOpportunities ranks by CPU share, costliest first", () => {
  const top = findImprovementOpportunities(sample);
  assert.equal(top[0].op, "submit_request:normal");
  assert.ok(Math.abs(top[0].share - 5000 / 8000) < 1e-9);
  assert.equal(top.length, 3);
});

test("renderReport includes results, regressions and opportunities", () => {
  const baseline = [{ op: "get_request", cpuInstructions: 500, memoryBytes: 100 }];
  const md = renderReport({
    results: sample,
    baseline,
    meta: { generatedAt: "2026-10-19T00:00:00.000Z", commit: "abc1234", environment: "test" },
  });
  assert.match(md, /^# Contract performance benchmark/);
  assert.match(md, /\| `get_request` \| 1,000 \| 100 \| 500 \| \+100\.0% \| regression \|/);
  assert.match(md, /`get_request` grew \+100\.0% CPU versus baseline/);
  assert.match(md, /1\. `submit_request:normal`: 5,000 CPU instructions/);
  assert.match(md, /\*\*Commit:\*\* abc1234/);
});

test("renderReport explains when there is no baseline yet", () => {
  const md = renderReport({ results: sample });
  assert.match(md, /none recorded yet/);
  assert.match(md, /No operation exceeded the regression threshold/);
});
