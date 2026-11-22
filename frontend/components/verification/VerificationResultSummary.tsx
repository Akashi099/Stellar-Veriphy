import type { ConfidenceResult } from "@stellarveriphy/shared/scoring";
import type { VerificationStatus } from "@stellarveriphy/shared/types";

import ConfidenceExplanation from "@/components/ConfidenceExplanation";
import ConfidenceScore from "@/components/ConfidenceScore";
import StatusBadge from "@/components/StatusBadge";
import { cn } from "@/utils/cn";

interface OutcomeCopy {
  headline: string;
  summary: string;
  nextSteps: string[];
  tone: string;
}

/** Plain-language outcome copy, one entry per verification status. */
const OUTCOME: Record<VerificationStatus, OutcomeCopy> = {
  certified: {
    headline: "Verified and certified",
    summary: "This content has a complete verification record.",
    nextSteps: [
      "Share this page to show the verification proof.",
      "Open the certificate to review minting and ownership details.",
    ],
    tone: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  },
  processing: {
    headline: "Verification in progress",
    summary: "The verification service is still checking this content.",
    nextSteps: ["No action needed. This page shows the result once the checks finish."],
    tone: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
  },
  pending: {
    headline: "Awaiting verification",
    summary: "This content has been recorded but has not been checked yet.",
    nextSteps: ["No action needed yet. Results appear here when verification starts."],
    tone: "border-slate-200 bg-slate-50 text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
  },
  cancelled: {
    headline: "Verification cancelled",
    summary: "Processing stopped before verification completed.",
    nextSteps: ["Submit a new verification request if needed."],
    tone: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
  },
  failed: {
    headline: "Verification did not pass",
    summary: "One or more required checks failed or could not be completed.",
    nextSteps: [
      "Review the checks that need attention below.",
      "Correct the manifest or content, then submit it for verification again.",
    ],
    tone: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
  },
};

interface VerificationResultSummaryProps {
  status: VerificationStatus;
  confidence: ConfidenceResult;
  /** Whether a certificate has been minted for this record. */
  hasCertificate: boolean;
}

/**
 * Leads the verification result page: the outcome first, then the checks
 * split into passed and needing attention, then concrete next steps.
 */
export function VerificationResultSummary({
  status,
  confidence,
  hasCertificate,
}: VerificationResultSummaryProps) {
  const copy = OUTCOME[status];
  const passed = confidence.breakdown.filter((f) => f.earned >= f.weight);
  const needsAttention = confidence.breakdown.filter((f) => f.earned < f.weight);

  return (
    <section
      aria-labelledby="verification-summary-heading"
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-6"
    >
      {/* Primary outcome */}
      <div
        className={cn(
          "flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
          copy.tone
        )}
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-xs font-medium uppercase tracking-wide opacity-75">Outcome</span>
          </div>
          <h2 id="verification-summary-heading" className="text-xl font-semibold">
            {copy.headline}
          </h2>
          <p className="text-sm opacity-90">{copy.summary}</p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
          <span className="text-sm font-medium opacity-80">Confidence</span>
          <ConfidenceScore result={confidence} size="lg" />
        </div>
      </div>

      {/* Supporting evidence, grouped */}
      <div className="grid gap-4 md:grid-cols-2">
        <EvidenceGroup
          title="Passed"
          count={passed.length}
          total={confidence.breakdown.length}
          empty="No checks have passed yet."
          items={passed.map((f) => ({
            key: f.key,
            label: f.label,
            detail: `${f.earned} of ${f.weight} points`,
          }))}
          tone="text-emerald-700 dark:text-emerald-400"
        />
        <EvidenceGroup
          title="Needs attention"
          count={needsAttention.length}
          total={confidence.breakdown.length}
          empty="All checks are complete."
          items={needsAttention.map((f) => ({
            key: f.key,
            label: f.label,
            detail: f.earned === 0 ? "Not passed" : `${f.earned} of ${f.weight} points`,
          }))}
          tone="text-amber-700 dark:text-amber-400"
        />
      </div>

      {/* Next steps */}
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Next steps</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-gray-300">
          {copy.nextSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {!hasCertificate && status === "certified" && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            The certificate is still pending on-chain minting.
          </p>
        )}
      </div>

      {/* Full method, collapsed by default to keep the summary scannable */}
      <details className="group rounded-lg border border-slate-200 p-4 dark:border-gray-800">
        <summary className="cursor-pointer select-none rounded text-sm font-medium text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-indigo-400">
          How the confidence score is calculated
        </summary>
        <div className="mt-4">
          <ConfidenceExplanation result={confidence} />
        </div>
      </details>
    </section>
  );
}

interface EvidenceItem {
  key: string;
  label: string;
  detail: string;
}

function EvidenceGroup({
  title,
  count,
  total,
  empty,
  items,
  tone,
}: {
  title: string;
  count: number;
  total: number;
  empty: string;
  items: EvidenceItem[];
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 p-4 dark:border-gray-800">
      <h3 className={cn("text-sm font-semibold", tone)}>
        {title}{" "}
        <span className="font-normal text-slate-500 dark:text-gray-400">
          ({count} of {total})
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-gray-400">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-gray-800">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
            >
              <span className="min-w-0 text-sm text-slate-900 dark:text-gray-100">
                {item.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-gray-400">
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default VerificationResultSummary;
