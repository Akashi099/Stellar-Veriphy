import fs from "node:fs";
import path from "node:path";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  console.error("Usage: node report-generator.mjs <input-json> <output-html>");
  process.exit(1);
}

const resolvedInput = path.resolve(process.cwd(), inputPath);
const resolvedOutput = path.resolve(process.cwd(), outputPath);

if (!fs.existsSync(resolvedInput)) {
  console.error(`Input file not found: ${resolvedInput}`);
  process.exit(1);
}

const raw = fs.readFileSync(resolvedInput, "utf8");
const summary = JSON.parse(raw);

const title = "StellarVeriphy Load Test Report";
const metrics = summary.metrics || {};
const rows = [
  ["http_req_duration", metrics.http_req_duration || {}],
  ["http_req_failed", metrics.http_req_failed || {}],
  ["checks", metrics.checks || {}],
  // Upload-heavy scenario (load-tests/upload-heavy-load.js): per-endpoint latency and flow metrics.
  ...Object.keys(metrics)
    .filter((name) => name.startsWith("http_req_duration{name:") || name.startsWith("upload_"))
    .sort()
    .map((name) => [name, metrics[name]]),
];

const renderMetric = (metricName, metric) => {
  const values = metric.values || metric;
  const p50 = values["p(50)"] ?? values.p50 ?? values.med ?? "n/a";
  const p95 = values["p(95)"] ?? values.p95 ?? "n/a";
  const p99 = values["p(99)"] ?? values.p99 ?? "n/a";
  const count = values.count ?? "n/a";

  return `
    <tr>
      <td>${metricName}</td>
      <td>${count}</td>
      <td>${p50}</td>
      <td>${p95}</td>
      <td>${p99}</td>
    </tr>
  `;
};

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { margin-bottom: 12px; }
      table { border-collapse: collapse; width: 100%; max-width: 960px; }
      th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; }
      th { background: #f3f4f6; }
      .meta { margin: 16px 0; }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div class="meta">
      <strong>Summary:</strong> Generated from a k6 run for the StellarVeriphy load suite.
    </div>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Samples</th>
          <th>p50</th>
          <th>p95</th>
          <th>p99</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([key, value]) => renderMetric(key, value)).join("")}
      </tbody>
    </table>
  </body>
</html>`;

fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
fs.writeFileSync(resolvedOutput, html, "utf8");
console.log(`HTML report written to ${resolvedOutput}`);
