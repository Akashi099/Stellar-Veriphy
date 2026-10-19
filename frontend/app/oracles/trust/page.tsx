/**
 * /oracles/trust
 *
 * Provider trust scores (#668): ranks oracle / verification providers using
 * historical outcomes, attestation consistency, dispute history, SLA health,
 * stake and recency, and surfaces high-risk providers first.
 */

import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { ProviderTrustDashboard } from "@/components/dashboard/ProviderTrustDashboard";

export const metadata: Metadata = {
  title: "Provider Trust Scores — StellarVeriphy",
  description: "Trust scores for oracle and verification providers, with explainable factor breakdowns.",
};

export default function ProviderTrustPage() {
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <div>
          <a href="/oracles" className="text-sm text-blue-600 hover:underline">← Oracle registry</a>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">Provider trust scores</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Scores combine historical outcomes, attestation consistency, dispute history, availability, latency,
            stake and recent activity. Small histories are pulled toward a neutral prior and carry low confidence.
            See <code>docs/features/provider-trust-scoring.md</code> for the model.
          </p>
        </div>
        <ProviderTrustDashboard />
      </div>
    </main>
  );
}
