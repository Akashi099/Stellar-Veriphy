import type {
  ApiResponse,
  AnalyticsReport,
  VerificationStatistics,
  UsageTrends,
  PopularContentData,
  GeographicDistribution,
  UserAnalytics,
} from "@stellarveriphy/shared";

const API_BASE = "/api";

export const analyticsService = {
  // Statistics
  async getVerificationStatistics(): Promise<ApiResponse<VerificationStatistics>> {
    const response = await fetch(`${API_BASE}/analytics/statistics`);
    return response.json();
  },

  async getVerificationStatisticsForPeriod(
    startDate: number,
    endDate: number,
  ): Promise<ApiResponse<VerificationStatistics>> {
    const response = await fetch(
      `${API_BASE}/analytics/statistics?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.json();
  },

  // Usage Trends
  async getUsageTrends(
    period: "day" | "week" | "month" | "year" = "month",
  ): Promise<ApiResponse<UsageTrends>> {
    const response = await fetch(`${API_BASE}/analytics/trends?period=${period}`);
    return response.json();
  },

  async getUsageTrendsByDateRange(
    startDate: number,
    endDate: number,
  ): Promise<ApiResponse<UsageTrendData[]>> {
    const response = await fetch(
      `${API_BASE}/analytics/trends/range?startDate=${startDate}&endDate=${endDate}`,
    );
    return response.json();
  },

  // Content Popularity
  async getPopularContent(): Promise<ApiResponse<PopularContentData>> {
    const response = await fetch(`${API_BASE}/analytics/popular-content`);
    return response.json();
  },

  async getContentTypeMetrics(): Promise<ApiResponse<Array<{
    contentType: string;
    count: number;
    percentage: number;
  }>>> {
    const response = await fetch(`${API_BASE}/analytics/content-types`);
    return response.json();
  },

  // Geographic Distribution
  async getGeographicDistribution(): Promise<ApiResponse<GeographicDistribution[]>> {
    const response = await fetch(`${API_BASE}/analytics/geographic-distribution`);
    return response.json();
  },

  // User Analytics
  async getUserAnalytics(): Promise<ApiResponse<UserAnalytics>> {
    const response = await fetch(`${API_BASE}/analytics/user-analytics`);
    return response.json();
  },

  // Reports
  async generateReport(
    period: string,
    format: "pdf" | "csv" | "json" = "json",
  ): Promise<ApiResponse<AnalyticsReport>> {
    const response = await fetch(`${API_BASE}/analytics/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period, format }),
    });
    return response.json();
  },

  async exportReport(reportId: string, format: "pdf" | "csv" | "json"): Promise<Blob> {
    const response = await fetch(`${API_BASE}/analytics/report/${reportId}/export?format=${format}`);
    return response.blob();
  },

  async getReportHistory(): Promise<ApiResponse<AnalyticsReport[]>> {
    const response = await fetch(`${API_BASE}/analytics/reports`);
    return response.json();
  },

  async downloadReport(reportId: string): Promise<void> {
    const blob = await this.exportReport(reportId, "pdf");
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-report-${reportId}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};

interface UsageTrendData {
  date: string;
  verifications: number;
  uniqueUsers: number;
  successfulCertificates: number;
}
