"use client";

/**
 * API Key Management Demo Page — Issue #219
 */

import { APIKeyManagement } from "@/components/APIKeyManagement";
import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { useWallet } from "@/context/WalletContext";

export default function APIKeysPage() {
  const { connected, publicKey } = useWallet();

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <div className="max-w-5xl mx-auto px-6">
        <Breadcrumbs />
      </div>
      <div className="max-w-5xl mx-auto px-6 py-12">
        <p className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
          Keys on this page are stored in your browser only. Server-enforced tokens with expiry, rotation and
          surface-scoped access are managed at <a href="/admin/api-tokens" className="underline">Admin → API Tokens</a>.
        </p>
        {!connected ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-6">
              <svg
                className="w-10 h-10 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
              Wallet Connection Required
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Please connect your Stellar wallet to manage API keys. API keys are scoped to your
              wallet address for security.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Click &quot;Connect Wallet&quot; in the top navigation to get started.
            </p>
          </div>
        ) : (
          <APIKeyManagement
            userAddress={publicKey!}
            className="bg-gray-50 dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800"
          />
        )}
      </div>
    </main>
  );
}
