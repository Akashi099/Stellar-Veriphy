#!/usr/bin/env node

/**
 * Test runner script for verifying implementations
 * This script runs Jest tests and outputs results
 */

const { execSync } = require("child_process");

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
