/**
 * GET  /api/oracles/trust  — trust scores for every verification provider
 * POST /api/oracles/trust  — preview scores under a tuned config
 *                            body: { config?: Partial<TrustScoreConfig>, inputs?: ProviderTrustInputs[] }
 *
 * Inputs come from the oracle contract (ProviderMetrics, ProviderSLA,
 * ProviderStake, ProviderSuspended, DisputesByProvider + Dispute records) and
 * the registry contract (TEE hash expiry). When the oracle contract is not
 * configured, representative sample inputs are returned so the dashboard is
 * usable locally (#668).
 */
import {
  DEFAULT_TRUST_CONFIG,
  rankProviders,
  type ProviderTrustInputs,
  type TrustScoreConfig,
} from "@stellarveriphy/shared";
import { NextRequest, NextResponse } from "next/server";

import { GET as getOracleRegistry } from "../route";

export const dynamic = "force-dynamic";

interface RegistryProvider {
  address: string;
  label: string;
  status: "active" | "suspended";
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  lastActivity: number;
  stakeStroops: string;
}

function sampleInputs(now: number): ProviderTrustInputs[] {
  return [
    {
      providerId: "GORACLE1PROVIDER000000000000000000000000000000000000000000",
      label: "Oracle Alpha",
      totalVerifications: 4_812,
      successfulVerifications: 4_741,
      failedVerifications: 71,
      attestationsCrossChecked: 420,
      attestationsConsistent: 418,
      uptimePercent: 99.8,
      avgResponseTimeSeconds: 4.1,
      targetResponseTimeSeconds: 30,
      disputesTotal: 3,
      disputesProviderFault: 0,
      disputesOpen: 0,
      disputesDismissed: 3,
      stakeStroops: 25_000_000_000,
      suspended: false,
      lastActivityAt: now - 120,
    },
    {
      providerId: "GORACLE2PROVIDER000000000000000000000000000000000000000001",
      label: "Oracle Beta",
      totalVerifications: 1_207,
      successfulVerifications: 899,
      failedVerifications: 308,
      attestationsCrossChecked: 150,
      attestationsConsistent: 131,
      uptimePercent: 91.2,
      avgResponseTimeSeconds: 38.7,
      targetResponseTimeSeconds: 30,
      disputesTotal: 6,
      disputesProviderFault: 1,
      disputesOpen: 2,
      disputesDismissed: 3,
      stakeStroops: 3_000_000_000,
      suspended: false,
      teeHashNearExpiry: true,
      lastActivityAt: now - 300,
    },
    {
      providerId: "GORACLE3PROVIDER000000000000000000000000000000000000000002",
      label: "Oracle Gamma",
      totalVerifications: 612,
      successfulVerifications: 258,
      failedVerifications: 354,
      attestationsCrossChecked: 40,
      attestationsConsistent: 29,
      uptimePercent: 68,
      avgResponseTimeSeconds: 62.4,
      targetResponseTimeSeconds: 30,
      disputesTotal: 9,
      disputesProviderFault: 4,
      disputesOpen: 1,
      disputesDismissed: 4,
      stakeStroops: 800_000_000,
      suspended: true,
      lastActivityAt: now - 60,
    },
    {
      providerId: "GORACLE4PROVIDER000000000000000000000000000000000000000003",
      label: "Oracle Delta (new)",
      totalVerifications: 6,
      successfulVerifications: 6,
      failedVerifications: 0,
      attestationsCrossChecked: 0,
      attestationsConsistent: 0,
      disputesTotal: 0,
      disputesProviderFault: 0,
      disputesOpen: 0,
      disputesDismissed: 0,
      stakeStroops: 1_000_000_000,
      suspended: false,
      lastActivityAt: now - 3_600,
    },
  ];
}

/**
 * Maps the on-chain registry view into trust inputs. Dispute and attestation
 * cross-check counts are not yet exposed by `/api/oracles`, so they default
 * to zero (neutral prior) until the indexer provides them.
 */
async function liveInputs(): Promise<ProviderTrustInputs[] | null> {
  try {
    const res = await getOracleRegistry();
    if (!res.ok) return null;
    const body = (await res.json()) as { providers?: RegistryProvider[] };
    if (!body.providers?.length) return null;
    return body.providers.map((p) => ({
      providerId: p.address,
      label: p.label,
      totalVerifications: p.totalVerifications,
      successfulVerifications: p.successfulVerifications,
      failedVerifications: p.failedVerifications,
      attestationsCrossChecked: 0,
      attestationsConsistent: 0,
      disputesTotal: 0,
      disputesProviderFault: 0,
      disputesOpen: 0,
      disputesDismissed: 0,
      stakeStroops: Number(p.stakeStroops) || 0,
      suspended: p.status === "suspended",
      // Contract stores last_activity as a ledger sequence; the registry route
      // forwards it as-is, so treat any non-zero value as "recently active".
      lastActivityAt: p.lastActivity > 0 ? Math.floor(Date.now() / 1000) : 0,
    }));
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Math.floor(Date.now() / 1000);
  const live = await liveInputs();
  const inputs = live ?? sampleInputs(now);
  return NextResponse.json({
    success: true,
    data: {
      scores: rankProviders(inputs, undefined, now),
      config: DEFAULT_TRUST_CONFIG,
      source: live ? "oracle-contract" : "sample",
      computedAt: new Date(now * 1000).toISOString(),
    },
  });
}

export async function POST(request: NextRequest) {
  let body: { config?: Partial<TrustScoreConfig>; inputs?: ProviderTrustInputs[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  const inputs = body.inputs?.length ? body.inputs : ((await liveInputs()) ?? sampleInputs(now));
  const config = { ...DEFAULT_TRUST_CONFIG, ...body.config, weights: { ...DEFAULT_TRUST_CONFIG.weights, ...body.config?.weights } };
  return NextResponse.json({
    success: true,
    data: { scores: rankProviders(inputs, config, now), config, source: "preview", computedAt: new Date(now * 1000).toISOString() },
  });
}
