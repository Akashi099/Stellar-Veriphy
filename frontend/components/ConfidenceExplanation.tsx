import type { ConfidenceResult } from "@stellarveriphy/shared/scoring";

interface ConfidenceExplanationProps {
  result: ConfidenceResult;
}

export default function ConfidenceExplanation({ result }: ConfidenceExplanationProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-gray-300">
        The score adds points for verification evidence. Each factor shows how many points it
        contributed and the most it can contribute.
      </p>

      <ul className="divide-y divide-slate-100 dark:divide-gray-800">
        {result.breakdown.map((factor) => (
          <li
            key={factor.key}
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900 dark:text-white">{factor.label}</p>
              <p className="text-sm text-slate-500 dark:text-gray-400">{factor.description}</p>
            </div>
            <p className="shrink-0 text-sm tabular-nums sm:text-right">
              <span className="font-semibold text-slate-800 dark:text-gray-200">
                {factor.earned} of {factor.weight} points
              </span>
              <span className="block text-xs text-slate-500 dark:text-gray-400">
                {factor.earned === 0
                  ? "No points yet"
                  : factor.earned === factor.weight
                    ? "Full points"
                    : "Some points"}
              </span>
            </p>
          </li>
        ))}
      </ul>

      <p className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-gray-800 dark:text-gray-400">
        Origin details can earn partial points. Confidence reflects the strength of the verification
        evidence, not whether the content itself is true. “No points yet” may mean a check failed or
        has not run.
      </p>
    </div>
  );
}