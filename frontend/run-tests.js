#!/usr/bin/env node

/**
 * Test runner script for verifying implementations
 * This script runs Jest tests and outputs results
 *
 * Usage:
 *   node run-tests.js           # Run the default test suite
 *   node run-tests.js --bench   # Run the render-path benchmark suite
 *   node run-tests.js bench     # Alias for --bench
 */

const { execSync } = require("child_process");

const args = process.argv.slice(2);
const benchMode = args.includes("--bench") || args.includes("bench");

if (benchMode) {
  console.log("⏱️  Running render-path benchmarks...\n");

  try {
    execSync(
      `npm test -- --testPathPattern="renderBenchmark" --run --forceExit`,
      {
        stdio: "inherit",
        cwd: __dirname,
      }
    );

    console.log("\n✅ Benchmarks completed!");
  } catch (error) {
    console.error("\n❌ Benchmarks failed");
    process.exit(1);
  }
} else {
  console.log("🧪 Running tests for Issue #444-447 implementations...\n");

  try {
    // Run tests for our new implementations
    const testPatterns = ["requestDeduplicator", "logger", "performance"];

    for (const pattern of testPatterns) {
      console.log(`\n📋 Testing ${pattern}...`);
      execSync(`npm test -- --testPathPattern="${pattern}" --run --forceExit`, {
        stdio: "inherit",
        cwd: __dirname,
      });
    }

    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Tests failed");
    process.exit(1);
  }
}