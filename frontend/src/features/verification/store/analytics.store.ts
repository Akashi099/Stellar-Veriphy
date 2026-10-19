import { create } from "zustand";

import type {
  AnalyticsReport,
  GeographicDistribution,
  PopularContentData,
  UserAnalytics,
  VerificationStatistics,
  UsageTrends,
} from "@stellarveriphy/shared";

interface AnalyticsState {
  statistics: VerificationStatistics | null;
  trends: UsageTrends | null;
  popularContent: PopularContentData | null;
  geographicDistribution: GeographicDistribution[];
  userAnalytics: UserAnalytics | null;
  reports: AnalyticsReport[];
  selectedReportId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AnalyticsActions {
  setStatistics: (stats: VerificationStatistics | null) => void;
  setTrends: (trends: UsageTrends | null) => void;
  setPopularContent: (content: PopularContentData | null) => void;
  setGeographicDistribution: (distribution: GeographicDistribution[]) => void;
  setUserAnalytics: (analytics: UserAnalytics | null) => void;
  setReports: (reports: AnalyticsReport[]) => void;
  setSelectedReport: (reportId: string | null) => void;
  addReport: (report: AnalyticsReport) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialState: AnalyticsState = {
  statistics: null,
  trends: null,
  popularContent: null,
  geographicDistribution: [],
  userAnalytics: null,
  reports: [],
  selectedReportId: null,
  isLoading: false,
  error: null,
};

export const useAnalyticsStore = create<AnalyticsState & AnalyticsActions>((set) => ({
  ...initialState,

  setStatistics: (stats) => set({ statistics: stats }),

  setTrends: (trends) => set({ trends }),

  setPopularContent: (content) => set({ popularContent: content }),

  setGeographicDistribution: (distribution) => set({ geographicDistribution: distribution }),

  setUserAnalytics: (analytics) => set({ userAnalytics: analytics }),

  setReports: (reports) => set({ reports }),

  setSelectedReport: (reportId) => set({ selectedReportId: reportId }),

  addReport: (report) =>
    set((state) => ({
      reports: [...state.reports, report],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),
}));
