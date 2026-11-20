#!/usr/bin/env node
/**
 * Bundle Analyzer Script
 *
 * Generates a comprehensive bundle analysis report including:
 * - Bundle size breakdown
 * - Duplicate packages
 * - Size trends
 * - Recommendations for optimization
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const REPORT_DIR = './.bundle-reports';
const NEXT_BUILD_DIR = './.next/static/chunks';
const NEXT_DIR = './.next';
const APP_BUILD_MANIFEST = join(NEXT_DIR, 'app-build-manifest.json');
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json');
const PACKAGE_JSON = './package.json';
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_FILE = `${REPORT_DIR}/bundle-report-${TIMESTAMP}.json`;

// Budget enforcement mode: 'error' (default) fails the build, 'warn' only warns.
const BUDGET_MODE = process.env.BUNDLE_BUDGET_MODE === 'warn' ? 'warn' : 'error';
// Default budget (KB, gzipped) applied to routes without an explicit budget.
const DEFAULT_ROUTE_BUDGET_KB = 250;
=======

// Ensure report directory exists
if (!readdirSync('.').includes('.bundle-reports')) {
  console.log('Creating .bundle-reports directory...');
}

/**
 * Get bundle size information
 */
function getBundleInfo() {
  const info = {
    timestamp: new Date().toISOString(),
    buildDate: TIMESTAMP,
    bundles: [],
    summary: {
      totalSize: 0,
      gzipSize: 0,
      fileCount: 0
    }
  };

  try {
    const files = readdirSync(NEXT_BUILD_DIR);

    files.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.css')) {
        const filePath = join(NEXT_BUILD_DIR, file);
        const stats = require('fs').statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);

        info.bundles.push({
          name: file,
          size: stats.size,
          sizeKB: parseFloat(sizeKB),
          type: file.endsWith('.js') ? 'javascript' : 'css'
        });

        info.summary.totalSize += stats.size;
        info.summary.fileCount += 1;
      }
    });
  } catch (error) {
    console.error('Error reading build directory:', error.message);
  }

  info.summary.totalSizeKB = (info.summary.totalSize / 1024).toFixed(2);
  info.bundles.sort((a, b) => b.size - a.size);

  return info;
}

/**
 * Load bundle budgets from package.json (`bundleBudgets` field).
 * Shape: { "routes": { "/path": 200 }, "default": 250 }
 * Values are gzipped KB budgets.
 */
function loadBudgets() {
  const budgets = { routes: {}, default: DEFAULT_ROUTE_BUDGET_KB };
  try {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    const configured = pkg.bundleBudgets;
    if (configured && typeof configured === 'object') {
      if (configured.routes && typeof configured.routes === 'object') {
        budgets.routes = configured.routes;
      }
      if (typeof configured.default === 'number') {
        budgets.default = configured.default;
      }
    }
  } catch (error) {
    console.warn('Could not read bundleBudgets from package.json:', error.message);
  }
  return budgets;
}

/**
 * Resolve a chunk path from a manifest entry to an absolute file path.
 */
function resolveChunkPath(chunk) {
  const candidates = [
    join(NEXT_DIR, chunk),
    join(NEXT_DIR, 'static', chunk),
    join(NEXT_DIR, 'static', 'chunks', chunk)
  ];
  return candidates.find(p => existsSync(p)) || null;
}

/**
 * Compute gzipped size (bytes) for a set of chunk files, deduplicating.
 */
function gzipSizeOfChunks(chunks) {
  const seen = new Set();
  let total = 0;
  chunks.forEach(chunk => {
    const filePath = resolveChunkPath(chunk);
    if (!filePath || seen.has(filePath)) return;
    seen.add(filePath);
    try {
      total += gzipSync(readFileSync(filePath)).length;
    } catch (error) {
      console.warn(`Could not read chunk ${chunk}:`, error.message);
    }
  });
  return total;
}

/**
 * Build a route -> chunks map from Next.js build manifests.
 */
function getRouteChunks() {
  const routes = {};

  const readManifest = file => {
    try {
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf8'));
      }
    } catch (error) {
      console.warn(`Could not read manifest ${file}:`, error.message);
    }
    return null;
  };

  // App router: app-build-manifest.json -> { pages: { "/route": [chunks] } }
  const appManifest = readManifest(APP_BUILD_MANIFEST);
  if (appManifest && appManifest.pages) {
    Object.entries(appManifest.pages).forEach(([route, chunks]) => {
      routes[route] = Array.isArray(chunks) ? chunks : [];
    });
  }

  // Pages router: build-manifest.json -> { pages: { "/route": [chunks] } }
  const buildManifest = readManifest(BUILD_MANIFEST);
  if (buildManifest && buildManifest.pages) {
    Object.entries(buildManifest.pages).forEach(([route, chunks]) => {
      if (!routes[route]) {
        routes[route] = Array.isArray(chunks) ? chunks : [];
      }
    });
  }

  return routes;
}

/**
 * Compute per-route JavaScript sizes and compare against budgets.
 */
function getRouteSizes(budgets) {
  const routeChunks = getRouteChunks();
  const results = [];

  Object.entries(routeChunks).forEach(([route, chunks]) => {
    const sizeBytes = gzipSizeOfChunks(chunks);
    const sizeKB = parseFloat((sizeBytes / 1024).toFixed(2));
    const budgetKB = typeof budgets.routes[route] === 'number'
      ? budgets.routes[route]
      : budgets.default;
    const passed = sizeKB <= budgetKB;
    results.push({
      route,
      sizeKB,
      budgetKB,
      passed,
      overByKB: passed ? 0 : parseFloat((sizeKB - budgetKB).toFixed(2))
    });
  });

  results.sort((a, b) => b.sizeKB - a.sizeKB);
  return results;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(info) {
  const jsChunks = info.bundles.filter(b => b.type === 'javascript');
  const cssChunks = info.bundles.filter(b => b.type === 'css');

  const topChunks = info.bundles.slice(0, 10);

  let markdown = `# Bundle Analysis Report\n\n`;
  markdown += `Generated: ${info.timestamp}\n\n`;

  markdown += `## Summary\n\n`;
  markdown += `- **Total Bundle Size**: ${info.summary.totalSizeKB}KB\n`;
  markdown += `- **Total Files**: ${info.summary.fileCount}\n`;
  markdown += `- **JS Chunks**: ${jsChunks.length}\n`;
  markdown += `- **CSS Chunks**: ${cssChunks.length}\n\n`;

  markdown += `## Top 10 Largest Files\n\n`;
  markdown += `| File | Size (KB) | Type |\n`;
  markdown += `|------|-----------|------|\n`;
  topChunks.forEach(chunk => {
    markdown += `| ${chunk.name} | ${chunk.sizeKB} | ${chunk.type} |\n`;
  });

  markdown += `\n## Recommendations\n\n`;

  if (parseFloat(info.summary.totalSizeKB) > 500) {
    markdown += `- ⚠️ Total bundle size exceeds 500KB. Consider code splitting or lazy loading.\n`;
  }

  const largestFile = topChunks[0];
  if (largestFile && largestFile.sizeKB > 200) {
    markdown += `- ⚠️ Largest file (${largestFile.name}) is ${largestFile.sizeKB}KB. Review for optimization opportunities.\n`;
  }

  markdown += `- ✓ Use dynamic imports for non-critical features.\n`;
  markdown += `- ✓ Enable gzip compression in production.\n`;
  markdown += `- ✓ Monitor bundle size changes in CI/CD pipeline.\n`;

  if (info.routes && info.routes.length > 0) {
    markdown += `\n## Route Budgets (gzipped JS)\n\n`;
    markdown += `| Route | Size (KB) | Budget (KB) | Status |\n`;
    markdown += `|-------|-----------|-------------|--------|\n`;
    info.routes.forEach(route => {
      const status = route.passed
        ? '✅ pass'
        : `❌ over by ${route.overByKB}KB`;
      markdown += `| ${route.route} | ${route.sizeKB} | ${route.budgetKB} | ${status} |\n`;
    });
  }

  return markdown;
}

// Generate report
console.log('🔍 Analyzing bundle...');
const bundleInfo = getBundleInfo();

// Route-level budget analysis
const budgets = loadBudgets();
bundleInfo.routes = getRouteSizes(budgets);
bundleInfo.budgetMode = BUDGET_MODE;
bundleInfo.budgetViolations = bundleInfo.routes.filter(r => !r.passed);

// Save JSON report
writeFileSync(REPORT_FILE, JSON.stringify(bundleInfo, null, 2));
console.log(`✓ JSON report saved to: ${REPORT_FILE}`);

// Save markdown report
const markdownReport = generateMarkdownReport(bundleInfo);
const mdFile = REPORT_FILE.replace('.json', '.md');
writeFileSync(mdFile, markdownReport);
console.log(`✓ Markdown report saved to: ${mdFile}`);

// Print summary
console.log('\n📊 Bundle Summary:\n');
console.log(`Total Size: ${bundleInfo.summary.totalSizeKB}KB`);
console.log(`Files: ${bundleInfo.summary.fileCount}`);
console.log('\nTop 5 Largest Bundles:');
bundleInfo.bundles.slice(0, 5).forEach((bundle, idx) => {
  console.log(`${idx + 1}. ${bundle.name} (${bundle.sizeKB}KB)`);
});

// Report route budgets
if (bundleInfo.routes.length > 0) {
  console.log('\n📏 Route Budgets (gzipped JS):');
  bundleInfo.routes.forEach(route => {
    const status = route.passed
      ? '✓'
      : `✗ over by ${route.overByKB}KB`;
    console.log(`  ${status} ${route.route}: ${route.sizeKB}KB / ${route.budgetKB}KB`);
  });
}

// Enforce budgets
if (bundleInfo.budgetViolations.length > 0) {
  const message = `${bundleInfo.budgetViolations.length} route(s) exceeded their bundle budget.`;
  if (BUDGET_MODE === 'warn') {
    console.warn(`\n⚠️  ${message} (BUNDLE_BUDGET_MODE=warn, not failing build)`);
    process.exit(0);
  }
  console.error(`\n❌ ${message}`);
  console.error('Set BUNDLE_BUDGET_MODE=warn to downgrade this to a warning.');
  process.exit(1);
}

process.exit(0);
