"use client";

/**
 * /report-issue
 *
 * Two tabs:
 *   1. "Report a bug or feature" — opens a pre-filled GitHub issue
 *   2. "Dispute a provenance record" — raises a content dispute via the API
 */

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AutoSaveIndicator } from "@/components/ui/AutoSaveIndicator";
import { HelpIcon } from "@/components/ui/HelpIcon";
import { useAutoSave } from "@/hooks/useAutoSave";
import DisputeSubmissionForm from "@/components/DisputeSubmissionForm";

// ─── Bug/Feature report form ─────────────────────────────────────────────────

type IssueType = "bug" | "feature" | "other";

interface ReportIssueFormValues {
  issueType: IssueType;
  title: string;
  description: string;
  stepsToReproduce: string;
}

const GITHUB_REPO = "your-org/Stellar-Veriphy";
const GITHUB_NEW_ISSUE_URL = `https://github.com/${GITHUB_REPO}/issues/new`;

const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  bug: "🐛 Bug Report",
  feature: "✨ Feature Request",
  other: "💬 Other",
};

const ISSUE_TYPE_GITHUB_LABELS: Record<IssueType, string> = {
  bug: "bug",
  feature: "enhancement",
  other: "question",
};

function buildGitHubUrl(values: ReportIssueFormValues): string {
  const typeLabel = ISSUE_TYPE_LABELS[values.issueType];
  const githubLabel = ISSUE_TYPE_GITHUB_LABELS[values.issueType];
  const body = [
    `## Description\n${values.description}`,
    values.issueType === "bug"
      ? `## Steps to Reproduce\n${values.stepsToReproduce}`
      : "",
    `---\n*Submitted via the in-app report form.*`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const params = new URLSearchParams({
    title: `[${typeLabel}] ${values.title}`,
    body,
    labels: githubLabel,
  });
  return `${GITHUB_NEW_ISSUE_URL}?${params.toString()}`;
}

function BugFeatureForm() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReportIssueFormValues>({
    defaultValues: { issueType: "bug", title: "", description: "", stepsToReproduce: "" },
  });
  const formValues = watch();
  const { state: autoSaveState, clearSaved } = useAutoSave({
    key: "report-issue-form",
    data: formValues,
    interval: 15000,
  });

  useEffect(() => {
    const saved = localStorage.getItem("report-issue-form");
    if (saved) {
      try {
        reset(JSON.parse(saved) as ReportIssueFormValues);
      } catch { /* noop */ }
    }
  }, [reset]);

  const issueType = watch("issueType");

  const onSubmit = (values: ReportIssueFormValues) => {
    clearSaved();
    window.open(buildGitHubUrl(values), "_blank", "noopener,noreferrer");
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div role="alert" className="p-4 rounded-lg bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700">
        <p className="text-green-800 dark:text-green-200 font-medium">
          ✓ A GitHub issue tab has been opened. Thank you for your feedback!
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="mt-2 text-sm text-green-700 dark:text-green-300 underline hover:no-underline"
        >
          Submit another report
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <AutoSaveIndicator
          lastSaved={autoSaveState.lastSaved}
          isSaving={autoSaveState.isSaving}
          hasUnsaved={autoSaveState.hasUnsaved}
        />
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
        <fieldset>
          <legend className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Issue Type <span aria-hidden="true" className="text-red-500">*</span>
          </legend>
          <div className="grid grid-cols-3 gap-3">
            {(["bug", "feature", "other"] as IssueType[]).map((type) => (
              <label
                key={type}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer text-sm font-medium transition-colors ${
                  issueType === type
                    ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-500"
                    : "border-gray-200 text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300"
                }`}
              >
                <input type="radio" value={type} className="sr-only" {...register("issueType", { required: true })} />
                {ISSUE_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="title" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Title <span aria-hidden="true" className="text-red-500">*</span>
            <HelpIcon content="Provide a concise summary that helps identify the issue at a glance." className="ml-1.5" />
          </label>
          <input
            id="title"
            type="text"
            placeholder="Short, descriptive summary"
            aria-invalid={!!errors.title}
            className={`w-full px-4 py-2.5 rounded-lg border text-gray-900 dark:text-white bg-white dark:bg-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${errors.title ? "border-red-500" : "border-gray-300 dark:border-gray-700"}`}
            {...register("title", {
              required: "Title is required.",
              minLength: { value: 5, message: "Title must be at least 5 characters." },
              maxLength: { value: 120, message: "Title must be 120 characters or fewer." },
            })}
          />
          {errors.title && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title.message}</p>}
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Description <span aria-hidden="true" className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            rows={5}
            placeholder="Describe the issue or feature request in detail"
            aria-invalid={!!errors.description}
            className={`w-full px-4 py-2.5 rounded-lg border text-gray-900 dark:text-white bg-white dark:bg-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y transition ${errors.description ? "border-red-500" : "border-gray-300 dark:border-gray-700"}`}
            {...register("description", {
              required: "Description is required.",
              minLength: { value: 20, message: "Please provide at least 20 characters." },
            })}
          />
          {errors.description && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description.message}</p>}
        </div>

        {issueType === "bug" && (
          <div>
            <label htmlFor="stepsToReproduce" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Steps to Reproduce <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <textarea
              id="stepsToReproduce"
              rows={4}
              placeholder={`1. Go to ...\n2. Click on ...\n3. Observe that ...`}
              aria-invalid={!!errors.stepsToReproduce}
              className={`w-full px-4 py-2.5 rounded-lg border text-gray-900 dark:text-white bg-white dark:bg-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono text-sm transition ${errors.stepsToReproduce ? "border-red-500" : "border-gray-300 dark:border-gray-700"}`}
              {...register("stepsToReproduce", issueType === "bug" ? {
                required: "Steps to reproduce are required for bug reports.",
                minLength: { value: 10, message: "Please provide at least 10 characters." },
              } : {})}
            />
            {errors.stepsToReproduce && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.stepsToReproduce.message}</p>}
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSubmitting ? "Opening GitHub…" : "Open GitHub Issue →"}
          </button>
          <p className="mt-3 text-xs text-center text-gray-500 dark:text-gray-500">
            Opens a pre-filled GitHub issue in a new tab for you to review and submit.
          </p>
        </div>
      </form>
    </>
  );
}

// ─── Page tabs ────────────────────────────────────────────────────────────────

type Tab = "bug" | "dispute";

function ReportIssueContent() {
  const searchParams = useSearchParams();
  const defaultTab = (searchParams.get("tab") as Tab) ?? "bug";
  const certId = searchParams.get("certificateId") ?? "";
  const contentHash = searchParams.get("contentHash") ?? "";

  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [disputeSuccess, setDisputeSuccess] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "bug", label: "Report a bug or feature" },
    { id: "dispute", label: "Dispute a provenance record" },
  ];

  return (
    <main className="min-h-screen bg-white dark:bg-gray-950 py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Report</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Report a bug, request a feature, or raise a dispute about a provenance certificate.
          </p>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Report type"
          className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-8"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700 dark:text-indigo-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Bug/Feature panel */}
        <div
          id="panel-bug"
          role="tabpanel"
          aria-labelledby="tab-bug"
          hidden={activeTab !== "bug"}
        >
          {activeTab === "bug" && <BugFeatureForm />}
        </div>

        {/* Dispute panel */}
        <div
          id="panel-dispute"
          role="tabpanel"
          aria-labelledby="tab-dispute"
          hidden={activeTab !== "dispute"}
        >
          {activeTab === "dispute" && (
            <>
              <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                <strong>Before you dispute:</strong> Disputes are reviewed by operators and recorded permanently in an auditable log. Only raise a dispute if you have a genuine concern about the provenance record — not for general feedback. See the{" "}
                <a
                  href="/docs/security/dispute-workflow"
                  className="underline hover:no-underline"
                >
                  dispute workflow documentation
                </a>{" "}
                for what to expect.
              </div>

              {disputeSuccess ? (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-6 space-y-2">
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                    Dispute submitted — reference <span className="font-mono">{disputeSuccess}</span>
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    An operator will review your dispute and the evidence you provided.
                  </p>
                  <button
                    onClick={() => setDisputeSuccess(null)}
                    className="mt-2 text-sm text-emerald-700 dark:text-emerald-400 underline hover:no-underline"
                  >
                    Raise another dispute
                  </button>
                </div>
              ) : (
                <DisputeSubmissionForm
                  initialCertificateId={certId}
                  initialContentHash={contentHash}
                  onSuccess={(id) => setDisputeSuccess(id)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ReportIssuePage() {
  return (
    <Suspense fallback={null}>
      <ReportIssueContent />
    </Suspense>
  );
}
