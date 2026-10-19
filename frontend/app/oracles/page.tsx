"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Search, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Header } from "@/components/Header";

type OracleStatus = "active" | "suspended";
type TrustLevel = "high" | "moderate" | "low";
type SortMode = "trust" | "status";

interface OracleProvider {
  address: string;
  label: string;
  status: OracleStatus;
  reputationScore: number;
  trustLevel: TrustLevel;
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  lastActivity: number;
  stakeStroops: string;
  metadataSource: string;
}

const trustRank: Record<TrustLevel, number> = { high: 3, moderate: 2, low: 1 };

function shortenAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatStake(stroops: string): string {
  const amount = Number(stroops) / 10_000_000;
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM`;
}

function formatActivity(timestamp: number): string {
  if (!timestamp) return "No activity recorded";
  return new Date(timestamp * 1000).toLocaleString();
}

export default function OraclesPage() {
  const [providers, setProviders] = useState<OracleProvider[]>([]);
  const [contractId, setContractId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OracleStatus>("all");
  const [trustFilter, setTrustFilter] = useState<"all" | TrustLevel>("all");
  const [sortMode, setSortMode] = useState<SortMode>("trust");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch("/api/oracles", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as {
          providers?: OracleProvider[];
          contractId?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Could not load the oracle registry.");
        setProviders(data.providers ?? []);
        setContractId(data.contractId ?? "");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Could not load the oracle registry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [refreshKey]);

  const visibleProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return providers
      .filter((provider) => statusFilter === "all" || provider.status === statusFilter)
      .filter((provider) => trustFilter === "all" || provider.trustLevel === trustFilter)
      .filter((provider) =>
        !normalizedQuery ||
        provider.address.toLowerCase().includes(normalizedQuery) ||
        provider.label.toLowerCase().includes(normalizedQuery)
      )
      .sort((a, b) =>
        sortMode === "trust"
          ? trustRank[b.trustLevel] - trustRank[a.trustLevel] || b.reputationScore - a.reputationScore
          : a.status.localeCompare(b.status) || trustRank[b.trustLevel] - trustRank[a.trustLevel]
      );
  }, [providers, query, statusFilter, trustFilter, sortMode]);

  const activeCount = providers.filter((provider) => provider.status === "active").length;
  const suspendedCount = providers.length - activeCount;

  return (
    <main className="min-h-screen bg-[#f4f6f4] text-[#18251f]">
      <Header />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#cad3ce] pb-6">
          <div>
            <p className="text-sm font-semibold uppercase text-emerald-800">Network directory</p>
            <h1 className="mt-2 text-3xl font-semibold">Oracle registry</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#52625a]">
              Registered verification providers and their on-chain operating record.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/registry/trust"
              className="rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 transition-colors"
            >
              Trust dashboard →
            </a>
            <a
              href="/oracles/analytics"
              className="rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 transition-colors"
            >
              Analytics dashboard →
            </a>
            <a
              href="/oracles/trust"
              className="rounded border border-emerald-700 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 transition-colors"
            >
              Trust scores →
            </a>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={isLoading}
              className="rounded border border-[#9baa9f] px-3 py-2 text-sm font-medium hover:bg-white disabled:opacity-50"
            >
              {isLoading ? "Updating…" : "Refresh registry"}
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-2 border-b border-[#cad3ce] sm:grid-cols-3">
          <div className="border-r border-[#cad3ce] py-5 pr-4">
            <dt className="text-sm text-[#52625a]">Registered oracles</dt>
            <dd className="mt-1 text-2xl font-semibold">{providers.length}</dd>
          </div>
          <div className="border-r border-[#cad3ce] py-5 px-4">
            <dt className="text-sm text-[#52625a]">Active</dt>
            <dd className="mt-1 text-2xl font-semibold text-emerald-800">{activeCount}</dd>
          </div>
          <div className="py-5 pl-4">
            <dt className="text-sm text-[#52625a]">Suspended</dt>
            <dd className="mt-1 text-2xl font-semibold text-rose-800">{suspendedCount}</dd>
          </div>
        </dl>

        <div className="grid gap-3 border-b border-[#cad3ce] py-5 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_auto_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Search oracle addresses</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#617168]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search address or label"
              className="w-full rounded border border-[#aebbb3] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">Filter by status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="w-full rounded border border-[#aebbb3] bg-white px-3 py-2">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="sr-only">Filter by trust level</span>
            <select value={trustFilter} onChange={(event) => setTrustFilter(event.target.value as typeof trustFilter)} className="w-full rounded border border-[#aebbb3] bg-white px-3 py-2">
              <option value="all">All trust levels</option>
              <option value="high">High</option>
              <option value="moderate">Moderate</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="sr-only">Sort registry</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="w-full rounded border border-[#aebbb3] bg-white px-3 py-2">
              <option value="trust">Sort by trust</option>
              <option value="status">Sort by status</option>
            </select>
          </label>
        </div>

        {contractId && (
          <p className="break-all py-3 text-xs text-[#617168]">
            Source contract: <span className="font-mono">{contractId}</span>
          </p>
        )}
        {error && (
          <div role="alert" className="my-5 flex items-start gap-2 border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Registry unavailable</p>
              <p>{error}</p>
            </div>
          </div>
        )}
        {isLoading && <p role="status" className="py-10 text-center text-sm text-[#52625a]">Reading oracle contract…</p>}
        {!isLoading && !error && visibleProviders.length === 0 && (
          <p className="py-10 text-center text-sm text-[#52625a]">
            {providers.length === 0 ? "No providers are registered in this oracle contract." : "No oracles match these filters."}
          </p>
        )}

        <ul className="divide-y divide-[#cad3ce]">
          {visibleProviders.map((provider) => {
            const TrustIcon = provider.trustLevel === "high" ? ShieldCheck : ShieldQuestion;
            return (
              <li key={provider.address} className="grid gap-4 py-5 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(7rem,auto))] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{provider.label}</h2>
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${provider.status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-rose-100 text-rose-900"}`}>
                      {provider.status === "active" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                      {provider.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-[#617168]" title={provider.address}>
                    {shortenAddress(provider.address)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#617168]">Trust score</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold capitalize">
                    <TrustIcon className="h-4 w-4 text-emerald-800" aria-hidden="true" />
                    {provider.trustLevel} · {provider.reputationScore}/100
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#617168]">Verifications</p>
                  <p className="mt-1 text-sm">{provider.successfulVerifications} / {provider.totalVerifications} successful</p>
                </div>
                <div>
                  <p className="text-xs text-[#617168]">Provider stake</p>
                  <p className="mt-1 text-sm">{formatStake(provider.stakeStroops)}</p>
                </div>
                <div>
                  <p className="text-xs text-[#617168]">Last activity</p>
                  <p className="mt-1 text-sm">{formatActivity(provider.lastActivity)}</p>
                </div>
                <p className="text-xs text-[#617168] lg:col-span-5">
                  Label and operating metrics sourced from the oracle contract; trust level is derived from reputation (high ≥ 90, moderate ≥ 70).
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}