"use client";

import type { VerificationJobView, VerificationStatus } from "@stellarveriphy/shared";

export const STATUS_COPY: Record<VerificationStatus, { label: string; description: string; next: string }> = {
  pending: {
    label: "Queued",
    description: "Your submission is waiting for an independent verification service to pick it up.",
    next: "Review starts automatically. You can leave this page; your progress is saved.",
  },
  processing: {
    label: "Running",
    description: "The verifier is checking your manifest and content hash.",
    next: "This usually finishes shortly. The status will update on its own.",
  },
  certified: {
    label: "Complete",
    description: "Verification finished and the provenance record is confirmed.",
    next: "Anyone can now compare a copy of the file against the recorded hash.",
  },
  failed: {
    label: "Failed",
    description: "Verification could not be completed.",
    next: "Review the reason below, fix the issue, and submit the content again.",
  },
};

const STEPS: { status: VerificationStatus; label: string }[] = [
  { status: "pending", label: "Queued" },
  { status: "processing", label: "Running" },
  { status: "certified", label: "Complete" },
];

export function formatDuration(ms: number): string {
  if (ms < 1000) return "less than a second";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `about ${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

export function JobStatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_COPY[status].label}</span>;
}

function stepState(step: VerificationStatus, job: VerificationJobView): "done" | "current" | "failed" | "upcoming" {
  const order = STEPS.map((s) => s.status);
  if (job.status === "failed") {
    // Failure happens while running; earlier steps completed.
    const failedAt = job.startedAt ? 1 : 0;
    const index = order.indexOf(step);
    return index < failedAt ? "done" : index === failedAt ? "failed" : "upcoming";
  }
  const current = order.indexOf(job.status);
  const index = order.indexOf(step);
  if (index < current || job.status === "certified") return "done";
  return index === current ? "current" : "upcoming";
}

function timingText(job: VerificationJobView): string | null {
  if (job.status === "pending") {
    const position = job.queuePosition
      ? job.queuePosition === 1 ? "You are next in the queue." : `Position ${job.queuePosition} in the queue.`
      : null;
    const eta = job.estimatedWaitMs !== null
      ? `Estimated wait: ${formatDuration(job.estimatedWaitMs)}.`
      : "An estimate will be available once recent jobs have completed.";
    return [position, eta].filter(Boolean).join(" ");
  }
  if (job.status === "processing") {
    return job.estimatedWaitMs !== null
      ? `Estimated time remaining: ${formatDuration(job.estimatedWaitMs)}.`
      : "No timing history yet, so there is no estimate.";
  }
  if (job.startedAt && job.completedAt) {
    return `Took ${formatDuration(Date.parse(job.completedAt) - Date.parse(job.startedAt))}.`;
  }
  return null;
}

export function JobProgress({ job }: { job: VerificationJobView }) {
  const copy = STATUS_COPY[job.status];
  const timing = timingText(job);

  return (
    <div className="job-progress" aria-live="polite">
      <ol className="steps">
        {STEPS.map((step) => {
          const state = stepState(step.status, job);
          return (
            <li key={step.status} className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined}>
              {state === "failed" ? "Failed" : step.label}
            </li>
          );
        })}
      </ol>
      <p><strong>{copy.label}:</strong> {copy.description}</p>
      {timing && <p className="muted">{timing}</p>}
      {job.status === "failed" && job.error && <p className="error-text">Reason: {job.error}</p>}
      {job.status === "certified" && job.result && (
        <p className="muted">
          Manifest hash: <code className="hash">{job.result.manifestHash}</code>
        </p>
      )}
      <p className="muted">Next: {copy.next}</p>
    </div>
  );
}
