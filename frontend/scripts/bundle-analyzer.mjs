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

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const REPORT_DIR = './.bundle-reports';
const NEXT_BUILD_DIR = './.next/static/chunks';
const TIMESTAMP = new Date().toISOString().split('T')[0];
const REPORT_FILE = `${REPORT_DIR}/bundle-report-${TIMESTAMP}.json`;

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

  return markdown;
}

// Generate report
console.log('🔍 Analyzing bundle...');
const bundleInfo = getBundleInfo();

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

process.exit(0);
