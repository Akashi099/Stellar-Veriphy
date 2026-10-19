import type { VerificationStatus } from "@stellarveriphy/shared/types";

const STATUS = {
  certified: { label: "Certified", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100" },
  processing: { label: "Processing", className: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100" },
  pending: { label: "Pending", className: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100" },
  failed: { label: "Verification failed", className: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100" },
} as const satisfies Record<VerificationStatus, { label: string; className: string }>;

export default function StatusBadge({ status }: { status: VerificationStatus }) {
  const s = STATUS[status];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}
