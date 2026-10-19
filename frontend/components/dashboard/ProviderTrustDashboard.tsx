"use client";

/**
 * ProviderTrustDashboard (#668)
 *
 * Ranks verification providers by trust score, surfaces high-risk providers
 * first-class, explains every score through its factor breakdown, and lets
 * maintainers preview weight changes before adopting them.
 */

import { useCallback, useEffect, useState } from "react";
import {
  TRUST_FLAG_LABELS,
  type ProviderTrustScore,
  type TrustFactorKey,
  type TrustScoreConfig,
  type TrustTier,
} from "@stellarveriphy/shared";
import { RetryableError } from "@/components/ui/RetryableError";
import { fetchJson } from "@/lib/apiErrors";
import { DashboardEmptyState } from "./DashboardEmptyState";

const TIER_STYLES: Record<TrustTier, string> = {
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  low: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  untrusted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const WEIGHT_LABELS: Record<TrustFactorKey, string> = {
  outcomes: "Historical outcomes",
  attestationConsistency: "Attestation consistency",
  disputes: "Dispute history",
  availability: "Availability",
  latency: "Latency",
  stake: "Economic stake",
  recency: "Recent activity",
};

interface TrustResponse {
  scores: ProviderTrustScore[];
  config: TrustScoreConfig;
  source: "oracle-contract" | "sample" | "preview";
  computedAt: string;
}

function shorten(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

function ScoreBar({ value }: { value: number }) {
  const color = value >= 85 ? "bg-green-500" : value >= 65 ? "bg-blue-500" : value >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700" aria-hidden>
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.max(2, value)}%` }} />
    </div>
  );
}

function ProviderRow({ s }: { s: ProviderTrustScore }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`rounded-lg border p-4 ${s.highRisk ? "border-red-300 dark:border-red-800" : "border-gray-200 dark:border-gray-700"} bg-white dark:bg-gray-800`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[10rem] flex-1">
          <p className="font-medium text-gray-900 dark:text-gray-100">{s.label ?? shorten(s.providerId)}</p>
          <p className="font-mono text-xs text-gray-500" title={s.providerId}>{shorten(s.providerId)}</p>
        </div>
        <div className="w-40">
          <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
            {s.score.toFixed(1)}
            <span className="ml-1 text-xs font-normal text-gray-500">/ 100</span>
          </p>
          <ScoreBar value={s.score} />
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[s.tier]}`}>{s.tier}</span>
        <span className="text-xs text-gray-500" title="How much history backs this score">
          confidence {Math.round(s.confidence * 100)}%
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs text-blue-600 hover:underline">
          {open ? "Hide factors" : "Explain score"}
        </button>
      </div>
      {s.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {s.flags.map((f) => (
            <span key={f} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {TRUST_FLAG_LABELS[f]}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1 pr-3">Factor</th>
                <th className="py-1 pr-3">Value</th>
                <th className="py-1 pr-3">Weight</th>
                <th className="py-1 pr-3">Points</th>
                <th className="py-1">Why</th>
              </tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-300">
              {s.factors.map((f) => (
                <tr key={f.key} className="border-t border-gray-100 dark:border-gray-700">
                  <td className="py-1 pr-3">{f.label}</td>
                  <td className="py-1 pr-3 tabular-nums">{Math.round(f.value * 100)}%</td>
                  <td className="py-1 pr-3 tabular-nums">{Math.round(f.weight * 100)}%</td>
                  <td className="py-1 pr-3 tabular-nums">{f.contribution.toFixed(1)}</td>
                  <td className="py-1">{f.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}

export function ProviderTrustDashboard() {
  const [data, setData] = useState<TrustResponse | null>(null);
  const [weights, setWeights] = useState<Record<TrustFactorKey, number> | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<{ error: unknown; weights: Record<TrustFactorKey, number> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const body = await fetchJson<{ success: boolean; data: TrustResponse; error?: string }>("/api/oracles/trust", {
        cache: "no-store",
      });
      if (!body.success) throw new Error(body.error ?? "Failed to load trust scores.");
      setData(body.data);
      setWeights(body.data.config.weights);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = useCallback(async (next: Record<TrustFactorKey, number>) => {
    setWeights(next);
    setPreviewError(null);
    try {
      const body = await fetchJson<{ success: boolean; data: TrustResponse; error?: string }>("/api/oracles/trust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { weights: next } }),
      });
      if (body.success) setData(body.data);
    } catch (err) {
      // Keep the last good scores on screen; offer to re-run just the preview.
      setPreviewError({ error: err, weights: next });
    }
  }, []);

  if (loadError && !data) {
    return (
      <RetryableError error={loadError} title="Couldn't load trust scores" onRetry={load} retrying={loading} />
    );
  }
  if (!data || !weights) {
    return (
      <p className="text-sm text-gray-500" role="status" aria-busy="true">
        Computing trust scores…
      </p>
    );
  }

  const risky = data.scores.filter((s) => s.highRisk);
  const others = data.scores.filter((s) => !s.highRisk);

  if (data.scores.length === 0) {
    return (
      <div className="space-y-6">
        <DashboardEmptyState
          heading="No provider trust scores yet"
          body="Trust scores are calculated after providers are registered and have verification history to evaluate."
          actionLabel="Open oracle registry"
          actionHref="/oracles"
        />
        <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-gray-100">
            Tune model weights (preview only)
          </summary>
          <p className="mt-2 text-xs text-gray-500">
            Weights are normalised to sum to 100%. Changes here only preview results — adopt new defaults by editing
            <code className="mx-1">DEFAULT_TRUST_CONFIG</code> in packages/shared/scoring/providerTrust.ts.
          </p>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {previewError && (
        <RetryableError
          variant="inline"
          error={previewError.error}
          title="Preview failed"
          onRetry={() => preview(previewError.weights)}
        />
      )}
      <p className="text-xs text-gray-500">
        Source: {data.source === "sample" ? "sample data (oracle contract not configured)" : data.source} · computed{" "}
        {new Date(data.computedAt).toLocaleString()} · model v{data.scores[0]?.modelVersion}
      </p>

      {risky.length > 0 && (
        <section aria-labelledby="risky-heading" className="space-y-2">
          <h2 id="risky-heading" className="text-sm font-semibold text-red-700 dark:text-red-400">
            High-risk providers ({risky.length}) — deprioritise or review
          </h2>
          <ul className="space-y-2">
            {risky.map((s) => (
              <ProviderRow key={s.providerId} s={s} />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="trusted-heading" className="space-y-2">
        <h2 id="trusted-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Providers ({others.length})
        </h2>
        {others.length === 0 ? (
          <DashboardEmptyState
            heading="No providers meet the trust threshold"
            body="Every scored provider currently needs review before it can appear in the trusted list."
            actionLabel="Review high-risk providers"
            actionHref="#risky-heading"
          />
        ) : (
          <ul className="space-y-2">
            {others.map((s) => (
              <ProviderRow key={s.providerId} s={s} />
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-gray-100">
          Tune model weights (preview only)
        </summary>
        <p className="mt-2 text-xs text-gray-500">
          Weights are normalised to sum to 100%. Changes here only preview results — adopt new defaults by editing
          <code className="mx-1">DEFAULT_TRUST_CONFIG</code> in packages/shared/scoring/providerTrust.ts.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.keys(WEIGHT_LABELS) as TrustFactorKey[]).map((key) => (
            <label key={key} className="text-xs text-gray-700 dark:text-gray-300">
              {WEIGHT_LABELS[key]}: {Math.round(weights[key] * 100)}
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={weights[key]}
                onChange={(e) => void preview({ ...weights, [key]: Number(e.target.value) })}
                className="w-full"
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
