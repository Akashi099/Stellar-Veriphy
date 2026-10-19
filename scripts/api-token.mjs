#!/usr/bin/env node

/**
 * API token operations CLI (#670)
 *
 * Thin wrapper over the /api/tokens endpoints for operators and CI. Secrets
 * are only ever printed to stdout once (on issue/rotate) — redirect to your
 * secret manager, never to a committed file.
 *
 *   SV_API_URL=https://app.example.com SV_ADMIN_TOKEN=svk_admin_… \
 *     node scripts/api-token.mjs <command> [options]
 *
 * Commands:
 *   list [--owner <id>]
 *   issue --surface <surface> --scope <scope> [--scope …] --name <name> [--owner <id>] [--ttl-days <n>]
 *   rotate --id <tokenId> [--grace-hours <n>]         (default grace 24h; 0 = immediate)
 *   revoke --id <tokenId> [--reason <reason>]          (reason: user_requested|compromised|…)
 *   compromised --id <tokenId>                          rotate with 0h grace + revoke predecessor
 *   bootstrap                                           issue the first admin token (needs SV_BOOTSTRAP_SECRET)
 *
 * Runbook: docs/security/api-token-lifecycle.md
 */

import { parseArgs } from "node:util";

const baseUrl = (process.env.SV_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const adminToken = process.env.SV_ADMIN_TOKEN;

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    id: { type: "string" },
    owner: { type: "string" },
    name: { type: "string" },
    surface: { type: "string" },
    scope: { type: "string", multiple: true },
    "ttl-days": { type: "string" },
    "grace-hours": { type: "string" },
    reason: { type: "string" },
  },
  strict: true,
});

function fail(message, code = 2) {
  console.error(`Error: ${message}`);
  process.exit(code);
}

async function call(method, path, body, extraHeaders = {}) {
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (adminToken && !extraHeaders["x-bootstrap-secret"]) headers.Authorization = `Bearer ${adminToken}`;
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) fail(`${method} ${path} → ${res.status}: ${data.error ?? "request failed"}`, 1);
  return data.data;
}

function printToken(t) {
  console.log(`${t.id}  ${t.status.padEnd(8)} ${t.surface.padEnd(9)} ${t.displayPrefix}  expires ${t.expiresAt}  ${t.name}`);
}

function printSecret(secret) {
  console.log("\nSecret (shown once — store it in your secret manager now):");
  console.log(secret);
}

switch (command) {
  case "list": {
    const tokens = await call("GET", `/api/tokens${values.owner ? `?owner=${encodeURIComponent(values.owner)}` : ""}`);
    tokens.forEach(printToken);
    break;
  }
  case "issue": {
    if (!values.surface || !values.scope?.length || !values.name) fail("issue requires --surface, --scope and --name");
    const data = await call("POST", "/api/tokens", {
      name: values.name,
      owner: values.owner,
      surface: values.surface,
      scopes: values.scope,
      ttlDays: values["ttl-days"] ? Number(values["ttl-days"]) : undefined,
    });
    printToken(data.token);
    printSecret(data.secret);
    break;
  }
  case "rotate":
  case "compromised": {
    if (!values.id) fail(`${command} requires --id`);
    const graceHours = command === "compromised" ? 0 : values["grace-hours"] !== undefined ? Number(values["grace-hours"]) : undefined;
    const data = await call("POST", `/api/tokens/${values.id}/rotate`, { graceHours });
    if (command === "compromised") {
      await call("DELETE", `/api/tokens/${values.id}`, { reason: "compromised" });
    }
    console.log("Previous:");
    printToken(data.previous);
    console.log("Replacement:");
    printToken(data.token);
    printSecret(data.secret);
    break;
  }
  case "revoke": {
    if (!values.id) fail("revoke requires --id");
    printToken(await call("DELETE", `/api/tokens/${values.id}`, { reason: values.reason ?? "user_requested" }));
    break;
  }
  case "bootstrap": {
    const secret = process.env.SV_BOOTSTRAP_SECRET;
    if (!secret) fail("SV_BOOTSTRAP_SECRET must be set to the server's API_TOKEN_BOOTSTRAP_SECRET");
    const data = await call(
      "POST",
      "/api/tokens",
      { name: values.name ?? "Bootstrap admin", owner: values.owner ?? "bootstrap", surface: "admin", scopes: ["tokens:manage"], ttlDays: 7 },
      { "x-bootstrap-secret": secret },
    );
    printToken(data.token);
    printSecret(data.secret);
    break;
  }
  default:
    fail(`Unknown command "${command ?? ""}". Use list | issue | rotate | revoke | compromised | bootstrap.`);
}
