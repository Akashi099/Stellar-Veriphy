"use client";

/**
 * CertificateVerificationPanel.tsx
 *
 * Top-level panel that orchestrates certificate verification flow:
 *   1. User enters search query (ID, code, or creator)
 *   2. Service looks up the certificate
 *   3. Result card is displayed with options to verify authenticity
 *   4. History timeline is shown below the result
 *
 * This component manages all the state for the lookup and delegates
 * rendering to sub-components.
 */

import { useState, useCallback, useEffect } from "react";
import { useCallback, useState } from "react";

import { CertificateCardSkeleton } from "@/components/ui/Skeleton";
import { recordVerificationEvent } from "@/lib/verificationHistory";
import type {
  CertificateLookupMethod,
  CertificateSearchResult,
  CertificateVerificationResult,
} from "@/services/certificateVerificationService";
import {
  generateVerificationCode,
  getCertificateByCode,
  getCertificateById,
  getCertificatesByCreator,
  verifyCertificateAuthenticity,
} from "@/services/certificateVerificationService";

import type { HistoryEvent } from "./CertificateHistoryTimeline";
import { CertificateHistoryTimeline, generateMockHistory } from "./CertificateHistoryTimeline";
import { CertificateLookupForm } from "./CertificateLookupForm";
import { CertificateResultCard } from "./CertificateResultCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LookupState =
  | { status: "idle" }
  | { status: "loading"; method: CertificateLookupMethod; value: string }
  | { status: "loaded"; result: CertificateVerificationResult }
  | { status: "multiple"; result: CertificateSearchResult }
  | { status: "error"; message: string }
  | { status: "verifying"; certificateId: string }
  | { status: "verified"; certificateId: string; details: string[] };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CertificateVerificationPanelProps {
  /** When set, the certificate is looked up by ID on mount (e.g. opened in a new tab). */
  initialCertificateId?: string | null;
}

export function CertificateVerificationPanel({ initialCertificateId }: CertificateVerificationPanelProps = {}) {
  const [lookupState, setLookupState] = useState<LookupState>({ status: "idle" });
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [historyEvents, setHistoryEvents] = useState<HistoryEvent[]>([]);

  // ── Search handler ──────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (method: CertificateLookupMethod, value: string) => {
    setGeneratedCode(null);
    setHistoryEvents([]);
    setLookupState({ status: "loading", method, value });

    let response;

    switch (method) {
      case "id":
        response = await getCertificateById(value);
        break;
      case "code":
        response = await getCertificateByCode(value);
        break;
      case "creator":
        response = await getCertificatesByCreator(value);
        break;
      default:
        setLookupState({ status: "error", message: "Invalid lookup method" });
        return;
    }

    if (!response.success || !response.data) {
      recordVerificationEvent({
        method,
        query: value,
        status: "not_found",
        details: response.error,
      });
      setLookupState({ status: "error", message: response.error ?? "Unknown error" });
      return;
    }

    const data = response.data;

    if ("certificate" in data) {
      // Single result
      const result = data as CertificateVerificationResult;
      setLookupState({ status: "loaded", result });
      recordVerificationEvent({
        method,
        query: value,
        certificateId: result.certificate.id,
        status: result.isRevoked ? "revoked" : "verified",
        details: result.statusLabel,
      });
      // Populate mock history
      setHistoryEvents(
        generateMockHistory(
          result.certificate.id,
          result.certificate.creator,
          result.certificate.timestamp
        )
      );
    } else {
      // Multiple results (creator search)
      const searchResult = data as CertificateSearchResult;
      if (searchResult.certificates.length === 0) {
        recordVerificationEvent({ method, query: value, status: "not_found" });
        setLookupState({ status: "error", message: "No certificates found for this creator" });
      } else {
        recordVerificationEvent({
          method,
          query: value,
          status: "verified",
          details: `${searchResult.certificates.length} result(s)`,
        });
        setLookupState({ status: "multiple", result: searchResult });
      }
    }
  }, []);

  useEffect(() => {
    if (initialCertificateId) handleSearch("id", initialCertificateId);
  }, [initialCertificateId, handleSearch]);

  // ── Authenticity verification handler ───────────────────────────────────────

  const handleVerifyAuthenticity = useCallback(async (id: string) => {
    setLookupState({ status: "verifying", certificateId: id });
    const response = await verifyCertificateAuthenticity(id);
    if (response.success && response.data) {
      recordVerificationEvent({
        method: "authenticity",
        query: id,
        certificateId: id,
        status: response.data.authentic ? "verified" : "error",
        details: response.data.details.join("; "),
      });
      setLookupState({
        status: "verified",
        certificateId: id,
        details: response.data.details,
      });
    } else {
      recordVerificationEvent({
        method: "authenticity",
        query: id,
        certificateId: id,
        status: "error",
        details: response.error,
      });
      setLookupState({ status: "error", message: response.error ?? "Verification failed" });
    }
  }, []);

  // ── Generate verification code handler ─────────────────────────────────────

  const handleGenerateCode = useCallback(async (id: string) => {
    const response = await generateVerificationCode(id);
    if (response.success && response.data) {
      setGeneratedCode(response.data);
    }
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setLookupState({ status: "idle" });
    setGeneratedCode(null);
    setHistoryEvents([]);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Search section ── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Verify a Certificate
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">
          Look up a provenance certificate by its ID, verification code, or creator address.
        </p>
        <CertificateLookupForm
          onSearch={handleSearch}
          isLoading={lookupState.status === "loading"}
          error={lookupState.status === "error" ? lookupState.message : null}
        />
      </div>

      {/* ── Loading state ── */}
      {lookupState.status === "loading" && <CertificateCardSkeleton />}

      {/* ── Single result ── */}
      {lookupState.status === "loaded" && (
        <div className="space-y-6">
          <CertificateResultCard
            result={lookupState.result}
            onVerifyAuthenticity={handleVerifyAuthenticity}
            onGenerateCode={handleGenerateCode}
            isVerifying={false}
            generatedCode={generatedCode}
          />

          {/* History timeline */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              Certificate History
            </h3>
            <CertificateHistoryTimeline events={historyEvents} />
          </div>

          <div className="text-center">
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              ← Verify another certificate
            </button>
          </div>
        </div>
      )}

      {/* ── Multiple results ── */}
      {lookupState.status === "multiple" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Found{" "}
              <span className="font-semibold text-gray-900 dark:text-white">
                {lookupState.result.total}
              </span>{" "}
              certificate(s)
            </p>
            <button
              onClick={handleReset}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              New search
            </button>
          </div>

          <div className="grid gap-4">
            {lookupState.result.certificates.map((cert) => (
              <div
                key={cert.id}
                className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors duration-200 ease-out motion-reduce:transition-none cursor-pointer"
                onClick={() => {
                  setLookupState({ status: "loading", method: "id", value: cert.id });
                  handleSearch("id", cert.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Certificate #{cert.id}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">
                      {cert.creator.slice(0, 8)}...{cert.creator.slice(-4)}
                    </p>
                  </div>
                  <time className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(cert.timestamp * 1000).toLocaleDateString()}
                  </time>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Verification progress ── */}
      {lookupState.status === "verifying" && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
          <svg
            className="animate-spin h-8 w-8 mb-3 text-emerald-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm">Verifying certificate authenticity...</p>
        </div>
      )}

      {/* ── Verified result ── */}
      {lookupState.status === "verified" && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              ✓
            </div>
            <div>
              <h3 className="text-base font-semibold text-emerald-800 dark:text-emerald-200">
                Certificate Verified
              </h3>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Certificate #{lookupState.certificateId} is authentic
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {lookupState.details.map((detail, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300"
              >
                <span className="shrink-0 mt-0.5">✓</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
