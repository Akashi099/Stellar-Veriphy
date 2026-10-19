#!/usr/bin/env node
// Environment drift detection: compares the expected public configuration in
// config/environments/<env>.json with the live values of a running deployment
// (its /api/health/ready `config` block), an env file, or the current shell.
//
// Usage:
//   node scripts/env-drift.mjs --env staging                   # live, URL from the baseline
//   node scripts/env-drift.mjs --env staging --url https://staging.example.com
//   node scripts/env-drift.mjs --env production --env-file .env.production
//   node scripts/env-drift.mjs --env preview --from-process
//   node scripts/env-drift.mjs --compare staging production    # baseline vs baseline
//   add --json for machine-readable output
//
// Exit codes: 0 no drift, 1 drift found, 2 the check itself could not run.
// See docs/operations/environment-drift.md.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_DIR = path.join(ROOT, "config", "environments");

const RPC_VARS = {
  testnet: "NEXT_PUBLIC_TESTNET_RPC_URL",
  mainnet: "NEXT_PUBLIC_MAINNET_RPC_URL",
  futurenet: "NEXT_PUBLIC_FUTURENET_RPC_URL",
};

function parseArgs(argv) {
  const args = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--from-process") args.fromProcess = true;
    else if (arg === "--env") args.env = argv[++i];
    else if (arg === "--url") args.url = argv[++i];
    else if (arg === "--env-file") args.envFile = argv[++i];
    else if (arg === "--compare") args.compare = [argv[++i], argv[++i]];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadBaseline(env) {
  const file = path.join(BASELINE_DIR, `${env}.json`);
  if (!fs.existsSync(file)) {
    const known = fs.readdirSync(BASELINE_DIR).map((f) => f.replace(/\.json$/, ""));
    throw new Error(
      `No baseline for "${env}" at ${path.relative(ROOT, file)}. Known: ${known.join(", ")}`
    );
  }
  const baseline = JSON.parse(fs.readFileSync(file, "utf8"));
  return { expected: {}, required: [], forbidden: {}, ...baseline };
}

function parseEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

// Mirrors configSnapshot() in frontend/app/api/health/ready/route.ts so every
// source is compared on the same keys.
function snapshotFromEnv(env) {
  const network = env.NEXT_PUBLIC_NETWORK || env.NEXT_PUBLIC_STELLAR_NETWORK || "";
  return {
    NODE_ENV: env.NODE_ENV ?? "",
    NEXT_PUBLIC_APP_ENV: env.NEXT_PUBLIC_APP_ENV ?? "",
    NEXT_PUBLIC_NETWORK: network,
    NEXT_PUBLIC_RPC_URL: env[RPC_VARS[network]] ?? "",
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL ?? "",
    NEXT_PUBLIC_MOCK_WALLET: env.NEXT_PUBLIC_MOCK_WALLET ?? "",
    NEXT_PUBLIC_ORACLE_CONTRACT_ID: env.NEXT_PUBLIC_ORACLE_CONTRACT_ID ?? "",
    NEXT_PUBLIC_PROVENANCE_CONTRACT_ID: env.NEXT_PUBLIC_PROVENANCE_CONTRACT_ID ?? "",
    NEXT_PUBLIC_REGISTRY_CONTRACT_ID: env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? "",
  };
}

async function snapshotFromUrl(baseUrl) {
  const url = new URL("/api/health/ready?rpc=0", baseUrl).toString();
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    throw new Error(`Could not reach ${url}: ${err.cause?.code || err.message}`);
  }
  const body = await res.json().catch(() => null);
  if (!body?.config) {
    throw new Error(
      `${url} returned HTTP ${res.status} without a "config" block (is the deployment older than the readiness endpoint?)`
    );
  }
  return body.config;
}

// Returns one finding per mismatch. `kind` tells the operator what to do:
//   mismatch  -> live value differs from the baseline
//   missing   -> a required value is empty
//   forbidden -> a value the environment must never have
function detectDrift(baseline, live) {
  const findings = [];
  for (const [key, expected] of Object.entries(baseline.expected)) {
    const actual = live[key] ?? "";
    if (String(actual) !== String(expected)) {
      findings.push({ key, kind: "mismatch", expected: String(expected), actual: String(actual) });
    }
  }
  for (const key of baseline.required) {
    if (!live[key])
      findings.push({ key, kind: "missing", expected: "<any non-empty value>", actual: "" });
  }
  for (const [key, values] of Object.entries(baseline.forbidden)) {
    if (values.includes(String(live[key] ?? ""))) {
      findings.push({
        key,
        kind: "forbidden",
        expected: `not ${values.join(" | ")}`,
        actual: String(live[key]),
      });
    }
  }
  return findings;
}

function compareBaselines(a, b) {
  const keys = [...new Set([...Object.keys(a.expected), ...Object.keys(b.expected)])].sort();
  return keys
    .filter((key) => a.expected[key] !== b.expected[key])
    .map((key) => ({
      key,
      kind: "differs",
      [a.environment]: a.expected[key] ?? "<unset>",
      [b.environment]: b.expected[key] ?? "<unset>",
    }));
}

const REMEDIATION = {
  mismatch:
    "Update the deployment's env (compose file / host secrets) to the expected value, or update the baseline in the same PR if the change is intended.",
  missing: "Set the variable in the deployment environment and redeploy.",
  forbidden: "Fix immediately: this value must never reach this environment.",
};

function printTable(rows, columns) {
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length))
  );
  const line = (cells) => cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join("  ");
  console.log(line(columns));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(columns.map((c) => row[c])));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.env && !args.compare)) {
    console.log(
      fs
        .readFileSync(fileURLToPath(import.meta.url), "utf8")
        .split("\n")
        .slice(1, 15)
        .map((l) => l.replace(/^\/\/ ?/, ""))
        .join("\n")
    );
    process.exit(args.help ? 0 : 2);
  }

  if (args.compare) {
    const [a, b] = args.compare.map(loadBaseline);
    const diffs = compareBaselines(a, b);
    if (args.json)
      console.log(JSON.stringify({ compare: args.compare, differences: diffs }, null, 2));
    else if (diffs.length === 0)
      console.log(`${a.environment} and ${b.environment} baselines are identical.`);
    else {
      console.log(`Intended differences between ${a.environment} and ${b.environment}:\n`);
      printTable(diffs, ["key", a.environment, b.environment]);
    }
    return 0;
  }

  const baseline = loadBaseline(args.env);
  let source;
  let live;
  if (args.envFile) {
    source = `env file ${args.envFile}`;
    live = snapshotFromEnv(parseEnvFile(args.envFile));
  } else if (args.fromProcess) {
    source = "current process environment";
    live = snapshotFromEnv(process.env);
  } else {
    const url = args.url || baseline.url;
    source = `live deployment ${url}`;
    live = await snapshotFromUrl(url);
  }

  const findings = detectDrift(baseline, live);
  const report = {
    environment: baseline.environment,
    source,
    checkedAt: new Date().toISOString(),
    drift: findings.length > 0,
    findings: findings.map((f) => ({ ...f, remediation: REMEDIATION[f.kind] })),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (findings.length === 0) {
    console.log(
      `✓ No drift: ${baseline.environment} matches config/environments/${args.env}.json (${source}).`
    );
  } else {
    console.log(
      `✗ Drift detected in ${baseline.environment} (${source}): ${findings.length} finding(s)\n`
    );
    printTable(findings, ["kind", "key", "expected", "actual"]);
    console.log("");
    for (const kind of [...new Set(findings.map((f) => f.kind))])
      console.log(`${kind}: ${REMEDIATION[kind]}`);
  }
  return findings.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`env-drift: ${err.message}`);
    process.exit(2);
  }
);
