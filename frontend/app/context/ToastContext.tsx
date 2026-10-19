"use client";

import type { ReactNode } from "react";
import { ToastProvider as StandardToastProvider, useToastHelpers } from "@/components/ToastProvider";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return <StandardToastProvider>{children}</StandardToastProvider>;
}

export function useToast(): ToastContextValue {
  const helpers = useToastHelpers();
  return {
    showToast: (message, type = "info") => helpers[type](message),
  };
}
