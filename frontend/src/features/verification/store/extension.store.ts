import { create } from "zustand";

import type { ExtensionVerificationResult } from "@stellarveriphy/shared";

interface ExtensionState {
  isExtensionActive: boolean;
  recentVerifications: ExtensionVerificationResult[];
  currentVerification: ExtensionVerificationResult | null;
  extensionStats: {
    totalVerifications: number;
    verifiedThisSession: number;
    averageVerificationTime: number;
  };
  isLoading: boolean;
  error: string | null;
}

interface ExtensionActions {
  setExtensionActive: (active: boolean) => void;
  setRecentVerifications: (verifications: ExtensionVerificationResult[]) => void;
  addRecentVerification: (verification: ExtensionVerificationResult) => void;
  setCurrentVerification: (verification: ExtensionVerificationResult | null) => void;
  setExtensionStats: (stats: ExtensionState["extensionStats"]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialState: ExtensionState = {
  isExtensionActive: false,
  recentVerifications: [],
  currentVerification: null,
  extensionStats: {
    totalVerifications: 0,
    verifiedThisSession: 0,
    averageVerificationTime: 0,
  },
  isLoading: false,
  error: null,
};

export const useExtensionStore = create<ExtensionState & ExtensionActions>((set) => ({
  ...initialState,

  setExtensionActive: (active) => set({ isExtensionActive: active }),

  setRecentVerifications: (verifications) => set({ recentVerifications: verifications }),

  addRecentVerification: (verification) =>
    set((state) => ({
      recentVerifications: [verification, ...state.recentVerifications].slice(0, 10),
    })),

  setCurrentVerification: (verification) => set({ currentVerification: verification }),

  setExtensionStats: (stats) => set({ extensionStats: stats }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));
