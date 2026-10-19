import { create } from "zustand";

import type { ContentVersion, VersionHistory } from "@stellarveriphy/shared";

interface VersioningState {
  versions: ContentVersion[];
  versionHistory: VersionHistory | null;
  selectedVersionId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface VersioningActions {
  setVersions: (versions: ContentVersion[]) => void;
  setVersionHistory: (history: VersionHistory | null) => void;
  setSelectedVersion: (versionId: string | null) => void;
  addVersion: (version: ContentVersion) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialState: VersioningState = {
  versions: [],
  versionHistory: null,
  selectedVersionId: null,
  isLoading: false,
  error: null,
};

export const useVersioningStore = create<VersioningState & VersioningActions>((set) => ({
  ...initialState,

  setVersions: (versions) => set({ versions }),

  setVersionHistory: (history) => set({ versionHistory: history }),

  setSelectedVersion: (versionId) => set({ selectedVersionId: versionId }),

  addVersion: (version) =>
    set((state) => ({
      versions: [...state.versions, version],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));
