/**
 * Pure helpers for the contract benchmark report (#807, #793).
 *
 * Input is the merged JSON array written by contracts/{oracle,provenance,registry}/src/benchmark.rs.
 * Op names are prefixed with the contract:
 *   [{ "op": "oracle.get_request", "cpuInstructions": 1234, "memoryBytes": 567 }, ...]
 *
 * Nothing in here touches the filesystem or runs cargo, so it can be unit tested on its own.
 */

/** A CPU increase above this fraction versus the baseline counts as a regression. */
export const DEFAULT_TOLERANCE = 0.1;

/** How many of the costliest operations to call out as improvement opportunities. */
const TOP_N = 3;

/**
 * Soroban compute fee rate used for the stroop estimates, in stroops per 10,000 CPU instructions.
 * This is the published network setting at the time of writing; validators can change it, so the
 * estimate is a planning figure, not a quote. Simulate the transaction for an exact fee.
 */
export const DEFAULT_FEE_PER_10K_INSTRUCTIONS = 25;

/** Shares of total CPU at or above which an operation is ranked high / medium cost. */
const HIGH_COST_SHARE = 0.25;
const MEDIUM_COST_SHARE = 0.1;

/**
 * End-to-end user flows built from the measured calls (#793). A flow's cost is the sum of its
 * steps, which is a lower bound: real transactions also pay for footprint, bandwidth and events.
 */
export const COMMON_FLOWS = [
  {
    name: "Submit verification request",
    description: "Creator asks for content to be verified",
    steps: ["oracle.submit_request:normal"],
  },
  {
    name: "Mint certificate",
    description: "Oracle issues a provenance certificate after attestation",
    steps: ["registry.is_tee_hash_approved", "registry.is_provider", "provenance.mint"],
  },
  {
    name: "Check verification status",
    description: "Frontend polls a request and reads the resulting certificate",
    steps: ["oracle.get_request", "provenance.get_certificate"],
  },
  {
    name: "Transfer certificate",
    description: "Owner hands a certificate to a new owner",
    steps: ["provenance.transfer_certificate"],
  },
  {
    name: "Revoke certificate",
    description: "Certificate is revoked for fraud, legal or creator reasons",
    steps: ["provenance.revoke_certificate"],
  },
  {
    name: "Onboard provider",
    description: "Provider key is approved in the registry and enrolled in the oracle",
    steps: ["registry.add_provider", "oracle.add_provider"],
  },
  {
    name: "Approve enclave build",
    description: "Admin approves a new TEE code hash",
    steps: ["registry.add_tee_hash"],
  },
];

/**
 * Checks the shape of a results array and returns it sorted by operation name.
 * Throws with a message naming the first bad entry, so a broken benchmark run fails loudly.
 */
export function parseResults(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("benchmark results must be a non-empty array");
  }
  input.forEach((entry, i) => {
    if (typeof entry?.op !== "string" || entry.op.length === 0) {
      throw new Error(`result ${i} is missing an "op" name`);
    }
    for (const key of ["cpuInstructions", "memoryBytes"]) {
      if (!Number.isInteger(entry[key]) || entry[key] < 0) {
        throw new Error(`result ${i} (${entry.op}) has an invalid ${key}`);
      }
    }
  });
  return [...input].sort((a, b) => a.op.localeCompare(b.op));
}

/**
 * Joins current results with a baseline by op name. Ops missing from the baseline are "new";
 * ops missing from the current run are reported separately so a dropped benchmark is visible.
 */
export function compareWithBaseline(results, baseline, tolerance = DEFAULT_TOLERANCE) {
  const baseByOp = new Map((baseline ?? []).map((b) => [b.op, b]));
  const currentOps = new Set(results.map((r) => r.op));

  const rows = results.map((r) => {
    const base = baseByOp.get(r.op);
    if (!base) {
      return { ...r, baselineCpu: null, deltaPct: null, status: "new" };
    }
    const deltaPct =
      base.cpuInstructions === 0
        ? null
        : (r.cpuInstructions - base.cpuInstructions) / base.cpuInstructions;
    let status = "ok";
    if (deltaPct !== null && deltaPct > tolerance) status = "regression";
    else if (deltaPct !== null && deltaPct < -tolerance) status = "improved";
    return { ...r, baselineCpu: base.cpuInstructions, deltaPct, status };
  });

  const missing = (baseline ?? []).map((b) => b.op).filter((op) => !currentOps.has(op));
  return { rows, missing };
}

/**
 * Picks the costliest operations by CPU share. These are the first places to look when the
 * report is used for optimization planning.
 */
export function findImprovementOpportunities(results) {
  const total = results.reduce((sum, r) => sum + r.cpuInstructions, 0);
  if (total === 0) return [];
  return [...results]
    .sort((a, b) => b.cpuInstructions - a.cpuInstructions)
    .slice(0, TOP_N)
    .map((r) => {
      const share = r.cpuInstructions / total;
      return { op: r.op, cpuInstructions: r.cpuInstructions, share, tier: costTier(share) };
    });
}

/** Ranks a share of total CPU as "high", "medium" or "low" cost. */
export function costTier(share) {
  if (share >= HIGH_COST_SHARE) return "high";
  if (share >= MEDIUM_COST_SHARE) return "medium";
  return "low";
}

/** Estimated compute fee in stroops for a CPU instruction count, rounded up. */
export function estimateComputeFeeStroops(
  cpuInstructions,
  feePer10k = DEFAULT_FEE_PER_10K_INSTRUCTIONS
) {
  return Math.ceil((cpuInstructions * feePer10k) / 10_000);
}

/**
 * Sums each flow's measured steps. A flow with a step missing from the results is returned with
 * `missing` set and no totals, so a benchmark that stopped measuring a step is visible.
 */
export function summarizeFlows(
  results,
  flows = COMMON_FLOWS,
  feePer10k = DEFAULT_FEE_PER_10K_INSTRUCTIONS
) {
  const byOp = new Map(results.map((r) => [r.op, r]));
  return flows.map((flow) => {
    const missing = flow.steps.filter((op) => !byOp.has(op));
    if (missing.length > 0) {
      return { ...flow, missing, cpuInstructions: null, memoryBytes: null, feeStroops: null };
    }
    const cpuInstructions = flow.steps.reduce((sum, op) => sum + byOp.get(op).cpuInstructions, 0);
    const memoryBytes = flow.steps.reduce((sum, op) => sum + byOp.get(op).memoryBytes, 0);
    return {
      ...flow,
      missing,
      cpuInstructions,
      memoryBytes,
      feeStroops: estimateComputeFeeStroops(cpuInstructions, feePer10k),
    };
  });
}

const fmtInt = (n) => n.toLocaleString("en-US");
const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtDelta = (x) => (x === null ? "—" : `${x > 0 ? "+" : ""}${fmtPct(x)}`);

/** Renders the full Markdown report. `meta` carries the run's commit and timestamp. */
export function renderReport({
  results,
  baseline = null,
  meta = {},
  tolerance = DEFAULT_TOLERANCE,
  feePer10k = DEFAULT_FEE_PER_10K_INSTRUCTIONS,
  flows = COMMON_FLOWS,
}) {
  const { rows, missing } = compareWithBaseline(results, baseline, tolerance);
  const opportunities = findImprovementOpportunities(results);
  const flowRows = summarizeFlows(results, flows, feePer10k);
  const regressions = rows.filter((r) => r.status === "regression");

  const lines = [];
  lines.push("# Contract performance benchmark");
  lines.push("");
  lines.push(
    "Generated by `pnpm bench:contracts` from `contracts/*/src/benchmark.rs`. Do not edit by hand; re-run the script to refresh."
  );
  lines.push("");
  lines.push(`- **Generated:** ${meta.generatedAt ?? "unknown"}`);
  lines.push(`- **Commit:** ${meta.commit ?? "unknown"}`);
  lines.push(`- **Environment:** ${meta.environment ?? "unknown"}`);
  lines.push(
    `- **Baseline:** ${baseline ? "compared" : "none recorded yet (run with --update-baseline to create one)"}`
  );
  lines.push(`- **Regression threshold:** CPU increase above ${fmtPct(tolerance)} versus baseline`);
  lines.push(
    `- **Fee estimate rate:** ${feePer10k} stroops per 10,000 CPU instructions (compute only; simulate for the exact fee)`
  );
  lines.push("");

  lines.push("## Common flows");
  lines.push("");
  lines.push(
    "Each flow is the sum of its measured calls. The estimate covers compute only; footprint, rent, events and the base fee are extra (see `docs/gas-costs.md`)."
  );
  lines.push("");
  lines.push("| Flow | Steps | CPU instructions | Memory bytes | Est. compute fee (stroops) |");
  lines.push("| --- | --- | ---: | ---: | ---: |");
  for (const f of flowRows) {
    const steps = f.steps.map((op) => `\`${op}\``).join(" → ");
    if (f.missing.length > 0) {
      lines.push(`| ${f.name} | ${steps} | — | — | not measured: ${f.missing.join(", ")} |`);
    } else {
      lines.push(
        `| ${f.name} | ${steps} | ${fmtInt(f.cpuInstructions)} | ${fmtInt(f.memoryBytes)} | ${fmtInt(f.feeStroops)} |`
      );
    }
  }
  lines.push("");

  lines.push("## Results");
  lines.push("");
  lines.push(
    "| Operation | CPU instructions | Memory bytes | Est. compute fee (stroops) | Baseline CPU | Δ CPU | Status |"
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
  for (const r of rows) {
    const base = r.baselineCpu === null ? "—" : fmtInt(r.baselineCpu);
    const fee = fmtInt(estimateComputeFeeStroops(r.cpuInstructions, feePer10k));
    lines.push(
      `| \`${r.op}\` | ${fmtInt(r.cpuInstructions)} | ${fmtInt(r.memoryBytes)} | ${fee} | ${base} | ${fmtDelta(r.deltaPct)} | ${r.status} |`
    );
  }
  lines.push("");

  lines.push("## Regressions");
  lines.push("");
  if (regressions.length === 0) {
    lines.push("No operation exceeded the regression threshold.");
  } else {
    for (const r of regressions) {
      lines.push(`- \`${r.op}\` grew ${fmtDelta(r.deltaPct)} CPU versus baseline.`);
    }
  }
  if (missing.length > 0) {
    lines.push("");
    lines.push(
      `Operations in the baseline but missing from this run: ${missing.map((m) => `\`${m}\``).join(", ")}.`
    );
  }
  lines.push("");

  lines.push("## Improvement opportunities");
  lines.push("");
  lines.push(
    `The costliest operations by CPU instructions, in priority order. **High** cost is ${fmtPct(HIGH_COST_SHARE)} or more of the measured total, **medium** is ${fmtPct(MEDIUM_COST_SHARE)} or more. Start optimization work at the top.`
  );
  lines.push("");
  if (opportunities.length === 0) {
    lines.push("No cost data to rank.");
  } else {
    opportunities.forEach((o, i) => {
      lines.push(
        `${i + 1}. \`${o.op}\` (**${o.tier}**): ${fmtInt(o.cpuInstructions)} CPU instructions (${fmtPct(o.share)} of measured total).`
      );
    });
  }
  lines.push("");

  lines.push("## Reproducing");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm bench:contracts                    # run and write the report");
  lines.push(
    "pnpm bench:contracts --update-baseline   # also store these numbers as the new baseline"
  );
  lines.push("```");
  lines.push("");
  lines.push(
    "Results are deterministic for a given soroban-sdk version. A change in the numbers means the contract or the SDK changed, so review the diff before updating the baseline."
  );
  lines.push("");

  return lines.join("\n");
}
