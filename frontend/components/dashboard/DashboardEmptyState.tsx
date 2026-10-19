import Link from "next/link";

interface DashboardEmptyStateProps {
  heading: string;
  body: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function DashboardEmptyState({ heading, body, actionLabel, actionHref, onAction }: DashboardEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 dark:border-gray-600 dark:bg-gray-900/60" role="status">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{heading}</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{body}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-3 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-blue-400 dark:focus:ring-offset-gray-900"
        >
          {actionLabel} →
        </Link>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-blue-400 dark:focus:ring-offset-gray-900"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}
