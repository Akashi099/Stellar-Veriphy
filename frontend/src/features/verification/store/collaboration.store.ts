import { create } from "zustand";

import type { SharedVerificationDocument, VerificationTeam } from "@stellarveriphy/shared";

interface CollaborationState {
  teams: VerificationTeam[];
  selectedTeamId: string | null;
  sharedDocuments: SharedVerificationDocument[];
  selectedDocumentId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface CollaborationActions {
  setTeams: (teams: VerificationTeam[]) => void;
  setSelectedTeam: (teamId: string | null) => void;
  addTeam: (team: VerificationTeam) => void;
  setSharedDocuments: (documents: SharedVerificationDocument[]) => void;
  setSelectedDocument: (documentId: string | null) => void;
  addSharedDocument: (document: SharedVerificationDocument) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialState: CollaborationState = {
  teams: [],
  selectedTeamId: null,
  sharedDocuments: [],
  selectedDocumentId: null,
  isLoading: false,
  error: null,
};

export const useCollaborationStore = create<CollaborationState & CollaborationActions>((set) => ({
  ...initialState,

  setTeams: (teams) => set({ teams }),

  setSelectedTeam: (teamId) => set({ selectedTeamId: teamId }),

  addTeam: (team) =>
    set((state) => ({
      teams: [...state.teams, team],
    })),

  setSharedDocuments: (documents) => set({ sharedDocuments: documents }),

  setSelectedDocument: (documentId) => set({ selectedDocumentId: documentId }),

  addSharedDocument: (document) =>
    set((state) => ({
      sharedDocuments: [...state.sharedDocuments, document],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));
