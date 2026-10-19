"use client";

import { useWizardStore } from "../store/wizard.store";

const STEP_LABELS = ["Mode", "Media", "Manifest", "Options", "Results"];

export function WizardStepper() {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);

  return (
    <nav
      aria-label="Verification steps"
      className="overflow-x-auto border-b border-gray-200 dark:border-gray-700"
    >
      <ol className="flex min-w-max items-center px-4 py-4 sm:px-6">
        {STEP_LABELS.map((label, index) => {
          const isCurrent = index === currentStep;
          const isAvailable = index <= currentStep;
          return (
            <li key={label} className="flex items-center">
              <button
                type="button"
                onClick={() => isAvailable && setStep(index)}
                disabled={!isAvailable || isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded px-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default ${
                  index <= currentStep
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    index <= currentStep
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="text-sm font-medium">{label}</span>
              </button>
              {index < STEP_LABELS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`mx-2 h-1 w-6 shrink-0 transition-colors sm:mx-4 sm:w-10 ${
                    index < currentStep ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
