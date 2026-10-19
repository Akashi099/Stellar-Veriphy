/**
 * GET /api/oracles/analytics
 *
 * Returns oracle health metrics, throughput data, and anomaly information
 * for the analytics dashboard.
 *
 * In production, this queries the Soroban oracle contract for provider
 * metrics (via `get_verification_metrics`, `get_sla_compliance`,
 * `is_provider_suspended`) and the registry contract for TEE hash expiry
 * status, then assembles them into `OracleDashboardData`.
 *
 * Returns mock data locally so the dashboard is exercisable without a live
 * network connection.
 */

import { NextResponse } from "next/server";
import type { OracleDashboardData } from "@stellarveriphy/shared";

function buildMockDashboard(): OracleDashboardData {
  const now = Math.floor(Date.now() / 1000);

  // Build 24 hourly throughput buckets
  const throughput = Array.from({ length: 24 }, (_, i) => {
    const ts = now - (23 - i) * 3600;
    const total = Math.floor(Math.random() * 80 + 20);
    const failed = Math.floor(Math.random() * 5);
    const successful = total - failed;
    const d = new Date(ts * 1000);
    return {
      timestamp: ts,
      label: d.toLocaleString("en-US", { hour: "2-digit", hour12: false, month: "short", day: "numeric" }),
      total,
      successful,
      failed,
    };
  });

  const totalVerifications = throughput.reduce((s, p) => s + p.total, 0);
  const totalSuccessful = throughput.reduce((s, p) => s + p.successful, 0);
  const totalFailed = throughput.reduce((s, p) => s + p.failed, 0);

  const providerHealth = [
    {
      providerId: "GORACLE1PROVIDER000000000000000000000000000000000000000000",
      status: "healthy" as const,
      successRate: 98.2,
      avgResponseTimeSeconds: 4.1,
      uptimePercent: 99.8,
      lastCheckedAt: now - 120,
      suspended: false,
      teeHashNearExpiry: false,
    },
    {
      providerId: "GORACLE2PROVIDER000000000000000000000000000000000000000001",
      status: "degraded" as const,
      successRate: 74.5,
      avgResponseTimeSeconds: 38.7,
      uptimePercent: 91.2,
      lastCheckedAt: now - 300,
      suspended: false,
      teeHashNearExpiry: true,
    },
    {
      providerId: "GORACLE3PROVIDER000000000000000000000000000000000000000002",
      status: "critical" as const,
      successRate: 42.1,
      avgResponseTimeSeconds: 62.4,
      uptimePercent: 68.0,
      lastCheckedAt: now - 60,
      suspended: true,
      teeHashNearExpiry: false,
    },
  ];

  const anomalies = [
    {
      id: "anomaly-1",
      providerId: providerHealth[1].providerId,
      type: "tee_expiry" as const,
      severity: "warning" as const,
      description: "Provider TEE code hash will expire within 14 days. Rotation required.",
      detectedAt: now - 3600,
      resolved: false,
    },
    {
      id: "anomaly-2",
      providerId: providerHealth[2].providerId,
      type: "high_failure_rate" as const,
      severity: "critical" as const,
      description: "Provider success rate dropped below 50% — automatic suspension applied.",
      detectedAt: now - 1800,
      resolved: false,
    },
  ];

  return {
    quality: {
      totalVerifications,
      overallSuccessRate: totalVerifications > 0 ? (totalSuccessful / totalVerifications) * 100 : 0,
      avgLatencySeconds:
        providerHealth.reduce((s, p) => s + p.avgResponseTimeSeconds, 0) / providerHealth.length,
      activeProviderCount: providerHealth.filter((p) => !p.suspended).length,
      suspendedProviderCount: providerHealth.filter((p) => p.suspended).length,
      criticalProviderCount: providerHealth.filter((p) => p.status === "critical").length,
      computedAt: now,
    },
    providerHealth,
    throughput,
    anomalies,
    snapshotAt: new Date().toISOString(),
  };
}

export async function GET() {
  // In production: query oracle and registry contracts via Stellar SDK
  const data = buildMockDashboard();
  return NextResponse.json(data);
}
