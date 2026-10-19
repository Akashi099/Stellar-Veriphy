"use client";

import { useState } from "react";

import { ChainCompatibilityNotice } from "@/components/wallet/ChainCompatibilityNotice";
import { type ChainFeature, checkChainCompatibility } from "@/lib/network/chainCompatibility";
import { useWalletStore } from "@/store/useWalletStore";

import { useWizardStore } from "../store/wizard.store";

interface WizardNavigationProps {
  onSubmit?: (() => void | Promise<void>) | undefined;
  isLoading?: boolean | undefined;
  /** When set, submission is blocked while a connected wallet is on a network that can't run this feature. */
  chainFeature?: ChainFeature | undefined;
}

const TOTAL_STEPS = 5;

export function WizardNavigation({
  onSubmit,
  isLoading = false,
  chainFeature,
}: WizardNavigationProps) {
  const [validationMessage, setValidationMessage] = useState("");
  const wizard = useWizardStore();
  const { currentStep, setStep, setStepComplete, reset } = wizard;

  const isLastStep = currentStep === TOTAL_STEPS - 1;
  const isFirstStep = currentStep === 0;

  const getStepError = (step: number): string => {
    switch (step) {
      case 0:
        return wizard.mode ? "" : "Choose a verification mode before continuing.";
      case 1:
        if (!wizard.fileInfo || wizard.fileInfo.size <= 0) {
          return "Select a non-empty media file before continuing.";
        }
        return /^[a-f\d]{64}$/i.test(wizard.contentHash)
          ? ""
          : "Wait for the media SHA-256 hash to finish before continuing.";
      case 2:
        if (!wizard.manifest || !wizard.manifestHash) {
          return "Attach a valid JSON or XML manifest before continuing.";
        }
        return /^[a-f\d]{64}$/i.test(wizard.manifestHash)
          ? ""
          : "Wait for the manifest SHA-256 hash to finish before continuing.";
      case 3:
        return "";
      default:
        return "Complete the required verification steps before submitting.";
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setStep(currentStep - 1);
    }
  };

  const nextStep = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      const message = getStepError(currentStep);
      if (message) {
        setValidationMessage(message);
        return;
      }
      setStepComplete(currentStep, true);
      setValidationMessage("");
      setStep(currentStep + 1);
    }
  };

  const handleSubmit = async () => {
    const missingStep = [0, 1, 2].find((step) => getStepError(step));
    if (missingStep !== undefined) {
      setStep(missingStep);
      setValidationMessage(getStepError(missingStep));
      return;
    }
    if (chainFeature) {
      const { connected, network, adapter } = useWalletStore.getState();
      const compatibility = connected
        ? checkChainCompatibility({
            feature: chainFeature,
            network,
            walletName: adapter?.name ?? "your wallet",
          })
        : { compatible: true as const };
      if (!compatibility.compatible) {
        setValidationMessage(compatibility.message);
        return;
      }
    }
    if (onSubmit) {
      await onSubmit();
    }
    reset();
  };

  return (
    <div className="border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
      {isLastStep && chainFeature && <ChainCompatibilityNotice feature={chainFeature} />}
      {validationMessage && (
        <p
          id="wizard-step-error"
          role="alert"
          className="mb-3 text-sm text-red-700 dark:text-red-300"
        >
          {validationMessage}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={prevStep}
          disabled={isFirstStep}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Back
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Submitting..." : "Submit"}
          </button>
        ) : (
          <button
            type="button"
            onClick={nextStep}
            aria-describedby={validationMessage ? "wizard-step-error" : undefined}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
