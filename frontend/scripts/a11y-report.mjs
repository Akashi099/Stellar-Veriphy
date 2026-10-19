import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const reportDir = path.join(projectRoot, "playwright-report");
const inputPath = path.join(reportDir, "accessibility-results.json");
const outputPath = path.join(reportDir, "accessibility-summary.json");

function collectResults(report) {
  const violations = [];

  const walk = (node) => {
    if (!node) return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (typeof node !== "object") return;

    if (node.violations && Array.isArray(node.violations)) {
      violations.push(...node.violations);
    }

    for (const value of Object.values(node)) {
      walk(value);
    }
  };

  walk(report);

  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? "unknown",
    description: violation.help,
    nodes: violation.nodes?.length ?? 0,
  }));
}

if (!fs.existsSync(inputPath)) {
  console.log(
    `No accessibility report found at ${path.relative(projectRoot, inputPath)}. Run the a11y suite first.`
  );
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const violations = collectResults(report);
const summary = {
  generatedAt: new Date().toISOString(),
  totalViolations: violations.length,
  violations: violations.sort((a, b) => {
    const order = { critical: 0, serious: 1, moderate: 2, minor: 3, unknown: 4 };
    return (order[a.impact] ?? 99) - (order[b.impact] ?? 99);
  }),
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

if (violations.length === 0) {
  console.log("Accessibility report: no issues found.");
} else {
  console.log(`Accessibility report: ${violations.length} issue(s) found.`);
  console.log(`Summary written to ${path.relative(projectRoot, outputPath)}`);
}
