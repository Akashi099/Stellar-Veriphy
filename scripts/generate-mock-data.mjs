#!/usr/bin/env node

/**
 * Mock Data Generator for Stellar Veriphy
 *
 * Generates realistic mock data for development and testing:
 * - Test users with different roles
 * - Sample content items
 * - Verification requests
 * - Provenance records
 * - Blockchain transactions
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Create output directory
const mockDataDir = "./frontend/public/mock-data";
try {
  mkdirSync(mockDataDir, { recursive: true });
} catch (error) {
  // Directory may already exist
}

// Utility functions
const generateId = () => Math.random().toString(36).substr(2, 9);
const generateHash = () =>
  "0x" + Math.random().toString(16).substr(2) + Math.random().toString(16).substr(2);
const randomDate = (start = new Date(2023, 0, 1), end = new Date()) =>
  new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Mock data generators
function generateUsers(count = 10) {
  const roles = ["user", "verifier", "admin"];
  const users = [];

  for (let i = 0; i < count; i++) {
    users.push({
      id: generateId(),
      name: `Test User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      wallet: `GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX${String(i).padStart(2, "0")}`,
      role: randomElement(roles),
      status: "active",
      createdAt: randomDate().toISOString(),
      verifications: Math.floor(Math.random() * 50),
      reputation: Math.floor(Math.random() * 100),
    });
  }

  return users;
}

function generateContentItems(count = 20, users) {
  const statuses = ["pending", "verified", "rejected", "disputed"];
  const contentTypes = ["image", "video", "document", "audio"];
  const items = [];

  for (let i = 0; i < count; i++) {
    const creator = randomElement(users);
    items.push({
      id: generateId(),
      title: `Content Item ${i + 1}`,
      description: `This is a test content item created for development purposes. ${i + 1}`,
      type: randomElement(contentTypes),
      creator: creator.id,
      creatorName: creator.name,
      contentHash: generateHash(),
      ipfsHash: `QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX${String(i).padStart(2, "0")}`,
      status: randomElement(statuses),
      verifications: Math.floor(Math.random() * 20),
      disputations: Math.floor(Math.random() * 5),
      createdAt: randomDate().toISOString(),
      updatedAt: randomDate().toISOString(),
      tags: ["test", "mock", `category-${i % 5}`],
      metadata: {
        size: Math.floor(Math.random() * 10000000),
        duration: Math.floor(Math.random() * 3600),
        dimensions: { width: 1920, height: 1080 },
      },
    });
  }

  return items;
}

function generateVerifications(count = 30, users, items) {
  const verifications = [];

  for (let i = 0; i < count; i++) {
    const verifier = randomElement(users.filter((u) => u.role !== "user"));
    const item = randomElement(items);

    verifications.push({
      id: generateId(),
      itemId: item.id,
      verifier: verifier.id,
      verifierName: verifier.name,
      status: randomElement(["approved", "rejected", "pending"]),
      confidence: (Math.random() * 100).toFixed(2),
      evidence: {
        sources: [
          `https://example.com/source-${i}`,
          `https://archive.org/item-${i}`,
        ],
        analysis: `Comprehensive verification analysis for item ${i}`,
        metadata: { method: "automated", timestamp: new Date().toISOString() },
      },
      blockchainTx: generateHash(),
      createdAt: randomDate().toISOString(),
      expiresAt: new Date(
        Date.now() + 90 * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  }

  return verifications;
}

function generateProvenanceRecords(count = 25, items) {
  const records = [];

  for (let i = 0; i < count; i++) {
    const item = randomElement(items);
    const events = [
      "created",
      "modified",
      "verified",
      "transferred",
      "disputed",
    ];

    records.push({
      id: generateId(),
      itemId: item.id,
      contentHash: item.contentHash,
      chain: [
        {
          event: "created",
          timestamp: randomDate(new Date(2023, 0, 1), new Date(2024, 0, 1)).toISOString(),
          actor: item.creator,
          blockchainHash: generateHash(),
        },
        {
          event: randomElement(events.slice(1)),
          timestamp: randomDate().toISOString(),
          actor: generateId(),
          blockchainHash: generateHash(),
        },
      ],
      currentOwner: item.creator,
      history: [
        {
          owner: item.creator,
          acquiredAt: randomDate(new Date(2023, 0, 1), new Date(2024, 0, 1)).toISOString(),
          source: "creation",
        },
      ],
    });
  }

  return records;
}

function generateAnalytics() {
  return {
    period: "last-7-days",
    statistics: {
      totalContentItems: Math.floor(Math.random() * 1000) + 500,
      verifiedContent: Math.floor(Math.random() * 800) + 300,
      activeVerifiers: Math.floor(Math.random() * 100) + 20,
      blockchainTransactions: Math.floor(Math.random() * 5000) + 1000,
      averageVerificationTime: Math.floor(Math.random() * 120) + 30,
    },
    trends: {
      contentGrowth: (Math.random() * 100 - 50).toFixed(2),
      verificationRate: (Math.random() * 100).toFixed(2),
      disputeRate: (Math.random() * 10).toFixed(2),
    },
    topVerifiers: Array.from({ length: 5 }, (_, i) => ({
      id: generateId(),
      name: `Top Verifier ${i + 1}`,
      verifications: Math.floor(Math.random() * 1000) + 100,
      accuracy: (Math.random() * 20 + 80).toFixed(2),
    })),
  };
}

// Generate all mock data
console.log("🔨 Generating mock data...\n");

const users = generateUsers(15);
const items = generateContentItems(30, users);
const verifications = generateVerifications(40, users, items);
const provenance = generateProvenanceRecords(30, items);
const analytics = generateAnalytics();

// Save mock data to files
const mockData = {
  users,
  items,
  verifications,
  provenance,
  analytics,
  generated: new Date().toISOString(),
};

writeFileSync(join(mockDataDir, "all.json"), JSON.stringify(mockData, null, 2));

console.log("✅ Mock Data Generated:\n");
console.log(`  Users:          ${users.length}`);
console.log(`  Content Items:  ${items.length}`);
console.log(`  Verifications:  ${verifications.length}`);
console.log(`  Provenance:     ${provenance.length}`);
console.log(`\n📁 Saved to: ${mockDataDir}/all.json\n`);

// Individual data files
writeFileSync(join(mockDataDir, "users.json"), JSON.stringify(users, null, 2));
writeFileSync(join(mockDataDir, "items.json"), JSON.stringify(items, null, 2));
writeFileSync(
  join(mockDataDir, "verifications.json"),
  JSON.stringify(verifications, null, 2)
);
writeFileSync(
  join(mockDataDir, "provenance.json"),
  JSON.stringify(provenance, null, 2)
);
writeFileSync(
  join(mockDataDir, "analytics.json"),
  JSON.stringify(analytics, null, 2)
);

console.log("✓ Mock data files created successfully!");
