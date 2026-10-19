"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";

import type {
  FileInfo,
  ManifestData,
  VerificationMode,
} from "@/src/features/verification/types/wizard.types";

// Re-export so existing imports of VerificationMode from this file keep working.
export type { VerificationMode };

/** sessionStorage key for persisting wizard state across navigations. */
const SESSION_KEY = "sv_wizard_ctx";

interface PersistedWizardState {
  mode: VerificationMode | null;
  fileInfo: FileInfo | null;
  contentHash: string;
  advancedContentHash: string;
  advancedManifestHash: string;
  manifest: ManifestData | null;
  manifestHash: string;
}

function readSession(): PersistedWizardState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedWizardState) : null;
  } catch {
    return null;
  }
}

function writeSession(state: PersistedWizardState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

interface WizardContextValue {
  mode: VerificationMode | null;
  setMode: (mode: VerificationMode) => void;
  file: File | null;
  setFile: (file: File | null) => void;
  fileInfo: FileInfo | null;
  contentHash: string;
  setContentHash: (hash: string) => void;
  advancedContentHash: string;
  setAdvancedContentHash: (hash: string) => void;
  advancedManifestHash: string;
  setAdvancedManifestHash: (hash: string) => void;
  manifest: ManifestData | null;
  setManifest: (manifest: ManifestData | null) => void;
  manifestHash: string;
  setManifestHash: (hash: string) => void;
  hashProgress: number;
  setHashProgress: (progress: number) => void;
  /** Reset all wizard state and clear sessionStorage. */
  reset: () => void;
}

const WizardContext = createContext<WizardContextValue | undefined>(undefined);

const DEFAULT_STATE: PersistedWizardState = {
  mode: null,
  fileInfo: null,
  contentHash: "",
  advancedContentHash: "",
  advancedManifestHash: "",
  manifest: null,
  manifestHash: "",
};

export function WizardProvider({ children }: { children: ReactNode }) {
  const saved = readSession() ?? DEFAULT_STATE;

  const [mode, setModeState] = useState<VerificationMode | null>(saved.mode);
  const [file, setFileState] = useState<File | null>(null); // File objects cannot be serialised
  const [fileInfo, setFileInfoState] = useState<FileInfo | null>(saved.fileInfo);
  const [contentHash, setContentHashState] = useState(saved.contentHash);
  const [advancedContentHash, setAdvancedContentHashState] = useState(saved.advancedContentHash);
  const [advancedManifestHash, setAdvancedManifestHashState] = useState(saved.advancedManifestHash);
  const [manifest, setManifestState] = useState<ManifestData | null>(saved.manifest);
  const [manifestHash, setManifestHashState] = useState(saved.manifestHash);
  const [hashProgress, setHashProgress] = useState(0);

  /** Persist serialisable fields whenever they change. */
  useEffect(() => {
    writeSession({
      mode,
      fileInfo,
      contentHash,
      advancedContentHash,
      advancedManifestHash,
      manifest,
      manifestHash,
    });
  }, [mode, fileInfo, contentHash, advancedContentHash, advancedManifestHash, manifest, manifestHash]);

  const setMode = useCallback((m: VerificationMode) => setModeState(m), []);

  const setFile = useCallback((f: File | null) => {
    setFileState(f);
    setFileInfoState(f ? { name: f.name, size: f.size, type: f.type } : null);
  }, []);

  const setContentHash = useCallback((h: string) => setContentHashState(h), []);
  const setAdvancedContentHash = useCallback((h: string) => setAdvancedContentHashState(h), []);
  const setAdvancedManifestHash = useCallback((h: string) => setAdvancedManifestHashState(h), []);
  const setManifest = useCallback((m: ManifestData | null) => setManifestState(m), []);
  const setManifestHash = useCallback((h: string) => setManifestHashState(h), []);

  const reset = useCallback(() => {
    setModeState(null);
    setFileState(null);
    setFileInfoState(null);
    setContentHashState("");
    setAdvancedContentHashState("");
    setAdvancedManifestHashState("");
    setManifestState(null);
    setManifestHashState("");
    setHashProgress(0);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
  }, []);

  return (
    <WizardContext.Provider
      value={{
        mode,
        setMode,
        file,
        setFile,
        fileInfo,
        contentHash,
        setContentHash,
        advancedContentHash,
        setAdvancedContentHash,
        advancedManifestHash,
        setAdvancedManifestHash,
        manifest,
        setManifest,
        manifestHash,
        setManifestHash,
        hashProgress,
        setHashProgress,
        reset,
      }}
    >
      {children}
    </WizardContext.Provider>
  );
}

export function useWizard() {
  const context = useContext(WizardContext);
  if (!context) {
    throw new Error("useWizard must be used within WizardProvider");
  }
  return context;
}
