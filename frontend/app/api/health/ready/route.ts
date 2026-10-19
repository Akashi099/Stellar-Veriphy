import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CheckStatus = "pass" | "warn" | "fail";

interface ReadinessCheck {
  name: string;
  status: CheckStatus;
  critical: boolean;
  message: string;
  remediation?: string;
  latencyMs?: number;
}

const NETWORKS = ["testnet", "mainnet", "futurenet"] as const;
type Network = (typeof NETWORKS)[number];

const RPC_URLS: Record<Network, string | undefined> = {
  testnet: process.env.NEXT_PUBLIC_TESTNET_RPC_URL,
  mainnet: process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
  futurenet: process.env.NEXT_PUBLIC_FUTURENET_RPC_URL,
};

const RPC_TIMEOUT_MS = Number(process.env.HEALTH_RPC_TIMEOUT_MS ?? 3000);

function activeNetwork(): string {
  return process.env.NEXT_PUBLIC_NETWORK || process.env.NEXT_PUBLIC_STELLAR_NETWORK || "";
}

function checkNetwork(): ReadinessCheck {
  const network = activeNetwork();
  if (!network) {
    return {
      name: "network_config",
      status: "fail",
      critical: true,
      message: "NEXT_PUBLIC_NETWORK is not set.",
      remediation: "Set NEXT_PUBLIC_NETWORK to testnet, mainnet or futurenet.",
    };
  }
  if (!NETWORKS.includes(network as Network)) {
    return {
      name: "network_config",
      status: "fail",
      critical: true,
      message: `NEXT_PUBLIC_NETWORK="${network}" is not a supported network.`,
      remediation: `Use one of: ${NETWORKS.join(", ")}.`,
    };
  }
  if (!process.env.NEXT_PUBLIC_NETWORK && process.env.NEXT_PUBLIC_STELLAR_NETWORK) {
    return {
      name: "network_config",
      status: "warn",
      critical: true,
      message: "Network resolved from legacy NEXT_PUBLIC_STELLAR_NETWORK.",
      remediation: "Rename the variable to NEXT_PUBLIC_NETWORK.",
    };
  }
  return {
    name: "network_config",
    status: "pass",
    critical: true,
    message: `Active network is ${network}.`,
  };
}

async function checkDataDir(): Promise<ReadinessCheck> {
  const dir = process.env.VERIPHY_DATA_DIR ?? path.join(process.cwd(), ".data");
  const probe = path.join(dir, `.ready-${process.pid}`);
  const started = Date.now();
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return {
      name: "data_dir",
      status: "pass",
      critical: true,
      message: `${dir} is writable.`,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      name: "data_dir",
      status: "fail",
      critical: true,
      message: `${dir} is not writable: ${(err as Error).message}`,
      remediation:
        "Mount a writable volume at VERIPHY_DATA_DIR, owned by the container user (appuser).",
      latencyMs: Date.now() - started,
    };
  }
}

async function checkRpc(): Promise<ReadinessCheck> {
  const network = activeNetwork() as Network;
  const url = RPC_URLS[network];
  if (!url) {
    return {
      name: "soroban_rpc",
      status: "warn",
      critical: false,
      message: `No RPC URL configured for ${network || "the active network"}.`,
      remediation: `Set NEXT_PUBLIC_${(network || "TESTNET").toUpperCase()}_RPC_URL.`,
    };
  }
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        name: "soroban_rpc",
        status: "warn",
        critical: false,
        message: `${url} answered HTTP ${res.status}.`,
        remediation: "Check the RPC provider status or point the RPC URL at another endpoint.",
        latencyMs,
      };
    }
    return {
      name: "soroban_rpc",
      status: "pass",
      critical: false,
      message: `${url} is reachable.`,
      latencyMs,
    };
  } catch (err) {
    return {
      name: "soroban_rpc",
      status: "warn",
      critical: false,
      message: `${url} is unreachable: ${(err as Error).message}`,
      remediation: "Check outbound network access from the container and the RPC URL.",
      latencyMs: Date.now() - started,
    };
  }
}

// Public, non-secret configuration that the environment drift check compares
// against config/environments/<env>.json (docs/operations/environment-drift.md).
function configSnapshot() {
  const network = activeNetwork();
  return {
    NODE_ENV: process.env.NODE_ENV ?? "",
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV ?? "",
    NEXT_PUBLIC_NETWORK: network,
    NEXT_PUBLIC_RPC_URL: RPC_URLS[network as Network] ?? "",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",
    NEXT_PUBLIC_MOCK_WALLET: process.env.NEXT_PUBLIC_MOCK_WALLET ?? "",
    NEXT_PUBLIC_ORACLE_CONTRACT_ID: process.env.NEXT_PUBLIC_ORACLE_CONTRACT_ID ?? "",
    NEXT_PUBLIC_PROVENANCE_CONTRACT_ID: process.env.NEXT_PUBLIC_PROVENANCE_CONTRACT_ID ?? "",
    NEXT_PUBLIC_REGISTRY_CONTRACT_ID: process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? "",
  };
}

// GET /api/health/ready: readiness probe. Returns 503 when a critical check
// fails; non-critical checks (RPC reachability) only degrade the report.
export async function GET(req: Request) {
  const skipRpc = new URL(req.url).searchParams.get("rpc") === "0";
  const checks = await Promise.all([
    Promise.resolve(checkNetwork()),
    checkDataDir(),
    skipRpc ? Promise.resolve<ReadinessCheck | null>(null) : checkRpc(),
  ]).then((all) => all.filter((c): c is ReadinessCheck => c !== null));

  const criticalFailed = checks.some((c) => c.critical && c.status === "fail");
  const degraded = checks.some((c) => c.status !== "pass");
  const status = criticalFailed ? "not_ready" : degraded ? "degraded" : "ready";

  if (status !== "ready") {
    for (const check of checks.filter((c) => c.status !== "pass")) {
      console.warn(
        JSON.stringify({
          level: check.status === "fail" ? "error" : "warn",
          event: "readiness.check_failed",
          check: check.name,
          critical: check.critical,
          message: check.message,
          remediation: check.remediation,
        })
      );
    }
  }

  return NextResponse.json(
    {
      status,
      service: "stellarveriphy",
      uptimeSeconds: Math.round(process.uptime()),
      checkedAt: new Date().toISOString(),
      checks,
      config: configSnapshot(),
    },
    { status: criticalFailed ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
