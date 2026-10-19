"use client";

import type { ChainFeature } from "@/lib/network/chainCompatibility";

import { WizardNavigation } from "./WizardNavigation";
import { WizardStepper } from "./WizardStepper";

interface WizardPageShellProps {
  title: string;
  description?: string | undefined;
  children: React.ReactNode;
  onSubmit?: (() => void | Promise<void>) | undefined;
  isLoading?: boolean | undefined;
  chainFeature?: ChainFeature | undefined;
}

export function WizardPageShell({
  title,
  description,
  children,
  onSubmit,
  isLoading,
  chainFeature,
}: WizardPageShellProps) {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900">
      <WizardStepper />

      <div className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
          {description && <p className="text-gray-600 dark:text-gray-400">{description}</p>}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">{children}</div>
      </div>

      <WizardNavigation onSubmit={onSubmit} isLoading={isLoading} chainFeature={chainFeature} />
    </div>
  );
}
