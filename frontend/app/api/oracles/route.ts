import { Address, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";

import { CONTRACT_ADDRESSES, getNetworkConfig, type Network } from "@/config/network";

export const dynamic = "force-dynamic";

interface RpcEntry {
  val?: {
    contractData?: () => { val: () => xdr.ScVal };
  };
}

interface RpcDataResult {
  entries?: RpcEntry[];
  val?: {
    contractData?: () => { val: () => xdr.ScVal };
  };
}

interface ProviderMetrics {
  total_verifications?: bigint | number;
  successful_verifications?: bigint | number;
  failed_verifications?: bigint | number;
  last_activity?: bigint | number;
}

function contractKey(variant: string, address?: string): xdr.ScVal {
  if (!address) return xdr.ScVal.scvSymbol(variant);
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol(variant),
    new Address(address).toScVal(),
  ]);
}

function extractValue(result: RpcDataResult): xdr.ScVal | undefined {
  const entry = result.entries?.[0] ?? result;
  return entry.val?.contractData?.().val();
}

function toAddress(value: unknown): string {
  return value instanceof Address ? value.toString() : String(value);
}

function toNumber(value: bigint | number | undefined): number {
  if (value === undefined) return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function structValue(value: xdr.ScVal | undefined): Record<string, unknown> {
  if (!value?.map()) return {};
  return Object.fromEntries(
    value.map()!.map((entry) => [
      String(scValToNative(entry.key())),
      scValToNative(entry.val()),
    ])
  );
}

export async function GET() {
  if (!CONTRACT_ADDRESSES.oracle) {
    return NextResponse.json(
      { error: "Oracle contract is not configured for this deployment." },
      { status: 503 }
    );
  }

  try {
    const network = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet") as Network;
    const rpcUrl = getNetworkConfig(network).rpcUrl;
    const server = new rpc.Server(rpcUrl);
    const readValue = async (key: xdr.ScVal) => {
      const result = (await server.getContractData(
        CONTRACT_ADDRESSES.oracle,
        key,
        rpc.Durability.PERSISTENT
      )) as RpcDataResult;
      return extractValue(result);
    };

    const providerListValue = await readValue(contractKey("ProviderList"));
    const providers = providerListValue?.vec()?.map((item) => toAddress(scValToNative(item))) ?? [];

    const oracleList = await Promise.all(
      providers.map(async (address) => {
        const [suspendedValue, stakeValue, metricsValue] = await Promise.all([
          readValue(contractKey("ProviderSuspended", address)),
          readValue(contractKey("ProviderStake", address)),
          readValue(contractKey("ProviderMetrics", address)),
        ]);
        const metrics = structValue(metricsValue) as ProviderMetrics;
        const totalVerifications = toNumber(metrics.total_verifications);
        const successfulVerifications = toNumber(metrics.successful_verifications);
        const reputationScore = totalVerifications === 0
          ? 100
          : Math.min(100, Math.floor((successfulVerifications * 100) / totalVerifications));
        const suspended = suspendedValue ? scValToNative(suspendedValue) === true : false;
        const stakeInfo = structValue(stakeValue);

        return {
          address,
          label: `Oracle ${address.slice(0, 6)}…${address.slice(-4)}`,
          status: suspended ? "suspended" : "active",
          reputationScore,
          trustLevel: reputationScore >= 90 ? "high" : reputationScore >= 70 ? "moderate" : "low",
          totalVerifications,
          successfulVerifications,
          failedVerifications: toNumber(metrics.failed_verifications),
          lastActivity: toNumber(metrics.last_activity),
          stakeStroops: String(stakeInfo.amount ?? 0),
          metadataSource: "Oracle contract",
        };
      })
    );

    return NextResponse.json({ providers: oracleList, contractId: CONTRACT_ADDRESSES.oracle });
  } catch (error) {
    console.error("Failed to read oracle registry:", error);
    return NextResponse.json(
      { error: "Could not read the oracle registry from the configured Soroban network." },
      { status: 502 }
    );
  }
}