import {
  CONFIDENCE_FACTORS,
  CONFIDENCE_LEVELS,
  type ConfidenceResult,
} from "@stellarveriphy/shared/scoring";
import Tooltip from "./Tooltip";

const LEVEL_STYLES = {
  high: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  medium: "bg-amber-50 text-amber-800 ring-amber-600/20",
  low: "bg-rose-50 text-rose-800 ring-rose-600/20",
} as const;

/** Tooltip copy is built from the shared scoring model so it can't drift from it. */
export function ConfidenceScoreHelp() {
  return (
    <>
      <span className="block">
        The confidence score (0–100) shows how much verified evidence backs this content. Each check below
        adds points when it passes.
      </span>
      <span className="mt-2 block space-y-1">
        {CONFIDENCE_FACTORS.map((f) => (
          <span key={f.key} className="flex justify-between gap-3">
            <span>{f.label}</span>
            <span className="tabular-nums text-slate-500">+{f.weight}</span>
          </span>
        ))}
      </span>
      <span className="mt-2 block text-slate-500">
        {CONFIDENCE_LEVELS.map((l, i) => {
          const max = i === 0 ? 100 : CONFIDENCE_LEVELS[i - 1].min - 1;
          return `${l.label} ${l.min}–${max}`;
        }).join(" · ")}
        . A high score means strong evidence, not a guarantee the content is true.
      </span>
    </>
  );
}

interface ConfidenceScoreProps {
  result: ConfidenceResult;
  size?: "sm" | "lg";
}

export default function ConfidenceScore({ result, size = "sm" }: ConfidenceScoreProps) {
  const levelLabel = CONFIDENCE_LEVELS.find((l) => l.level === result.level)!.label;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-baseline gap-1 rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset ${LEVEL_STYLES[result.level]} ${size === "lg" ? "text-base" : "text-xs"}`}
      >
        <span className="sr-only">Confidence score:</span>
        <span className="tabular-nums">{result.score}</span>
        <span aria-hidden="true">/100</span>
        <span className="sr-only">out of 100,</span>
        <span>· {levelLabel}</span>
      </span>
      <Tooltip label="What does the confidence score mean?">
        <ConfidenceScoreHelp />
      </Tooltip>
    </span>
  );
}
