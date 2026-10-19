import { NextResponse } from "next/server";

/**
 * GET /api/registry/trust
 *
 * Returns public-safe registry health, trusted provider summaries, operational
 * warnings, and verification statistics.
 *
 * No private keys, internal credentials, or sensitive operational details are
 * included in the response. Full provider addresses are withheld; only the last
 * 6 characters of each address are exposed for identification purposes.
 *
 * In production this queries:
 *   - contracts/registry  → approved TEE hashes, provider list, suspension state
 *   - contracts/oracle    → per-provider metrics (success rate, last activity)
 *   - contracts/provenance → total certificates minted
 *
 * Returns structured mock data so the dashboard is exercisable without a live
 * Stellar network connection.
 */

type RegistryHealth = "healthy" | "degraded" | "critical";

interface TrustedProviderSummary {
  addressSuffix: string;
  status: "active" | "suspended";
  trustLevel: "high" | "moderate" | "low";
  successRate: number;
  teeHashValid: boolean;
}

interface RegistryWarning {
  id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  issuedAt: string;
}

interface VerificationStats {
  totalCertificates: number;
  last24hCertificates: number;
  overallSuccessRate: number;
  activeTrustedProviders: number;
  suspendedProviders: number;
  approvedTeeHashes: number;
}

interface RegistryTrustResponse {
  health: RegistryHealth;
  healthNote: string;
  warnings: RegistryWarning[];
  providers: TrustedProviderSummary[];
  stats: VerificationStats;
  snapshotAt: string;
}

function buildResponse(): RegistryTrustResponse {
  const now = new Date().toISOString();

  // Mock provider data — in production, read from registry + oracle contracts
  const rawProviders = [
    { address: "GORACLE1AAABBBCCCDDDEEEFFFGGGHHH000000000000000000XZ4G2Q", suspended: false, totalVerifications: 4_820, successfulVerifications: 4_742, teeHashValid: true },
    { address: "GORACLE2AAABBBCCCDDDEEEFFFGGGHHH000000000000000000PK7M3R", suspended: false, totalVerifications: 2_100, successfulVerifications: 1_599, teeHashValid: false },
    { address: "GORACLE3AAABBBCCCDDDEEEFFFGGGHHH000000000000000000BT9N1W", suspended: true, totalVerifications: 650,  successfulVerifications: 268, teeHashValid: false },
  ];

  const providers: TrustedProviderSummary[] = rawProviders.map((p) => {
    const rate = p.totalVerifications > 0
      ? (p.successfulVerifications / p.totalVerifications) * 100
      : 0;
    return {
      // Expose only a suffix — never the full address — in this public endpoint
      addressSuffix: `…${p.address.slice(-6)}`,
      status: p.suspended ? "suspended" : "active",
      trustLevel: rate >= 90 ? "high" : rate >= 70 ? "moderate" : "low",
      successRate: parseFloat(rate.toFixed(1)),
      teeHashValid: p.teeHashValid,
    };
  });

  const activeProviders = providers.filter((p) => p.status === "active");
  const suspendedProviders = providers.filter((p) => p.status === "suspended");
  const hasExpiringHash = providers.some((p) => !p.teeHashValid);
  const hasCritical = providers.some((p) => p.trustLevel === "low" && p.status === "active");

  const health: RegistryHealth = hasCritical ? "critical" : hasExpiringHash ? "degraded" : "healthy";

  const healthNotes: Record<RegistryHealth, string> = {
    healthy:
      "All trusted oracle providers are operating within SLA thresholds. No critical warnings are active.",
    degraded:
      "One or more providers have a TEE code hash nearing expiry or reduced performance. Governance review is in progress.",
    critical:
      "At least one active provider has a critically low success rate. Immediate operator attention is required.",
  };

  const warnings: RegistryWarning[] = [];

  if (hasExpiringHash) {
    warnings.push({
      id: "warn-tee-expiry",
      severity: "warning",
      message:
        "One or more providers have a TEE code hash that is expiring or already invalid. Hash rotation is required before verification integrity is affected.",
      issuedAt: now,
    });
  }

  if (hasCritical) {
    warnings.push({
      id: "warn-low-success",
      severity: "critical",
      message:
        "An active provider's success rate has fallen below acceptable thresholds. Automatic suspension may apply; operators should review.",
      issuedAt: now,
    });
  }

  const totalCertificates = 18_340;
  const last24hCertificates = 127;
  const allRates = rawProviders.map((p) =>
    p.totalVerifications > 0 ? (p.successfulVerifications / p.totalVerifications) * 100 : 0
  );
  const overallSuccessRate =
    allRates.length > 0
      ? parseFloat((allRates.reduce((a, b) => a + b, 0) / allRates.length).toFixed(1))
      : 0;

  return {
    health,
    healthNote: healthNotes[health],
    warnings,
    providers,
    stats: {
      totalCertificates,
      last24hCertificates,
      overallSuccessRate,
      activeTrustedProviders: activeProviders.length,
      suspendedProviders: suspendedProviders.length,
      approvedTeeHashes: 4,
    },
    snapshotAt: now,
  };
}

export async function GET(): Promise<NextResponse<RegistryTrustResponse>> {
  // In production: await real on-chain queries here
  return NextResponse.json(buildResponse());
}
