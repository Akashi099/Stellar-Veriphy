import type {
  ApiResponse,
  ContentVersion,
  VersionComparison,
  VersionHistory,
} from "@stellarveriphy/shared";

const API_BASE = "/api";

export const versioningService = {
  // Version Management
  async createVersion(
    contentHash: string,
    manifestHash: string,
    changeLog?: string,
  ): Promise<ApiResponse<ContentVersion>> {
    const response = await fetch(`${API_BASE}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentHash, manifestHash, changeLog }),
    });
    return response.json();
  },

  async getVersionHistory(contentHash: string): Promise<ApiResponse<VersionHistory>> {
    const response = await fetch(`${API_BASE}/versions/history/${contentHash}`);
    return response.json();
  },

  async getVersion(versionId: string): Promise<ApiResponse<ContentVersion>> {
    const response = await fetch(`${API_BASE}/versions/${versionId}`);
    return response.json();
  },

  async getAllVersions(contentHash: string): Promise<ApiResponse<ContentVersion[]>> {
    const response = await fetch(`${API_BASE}/versions?contentHash=${contentHash}`);
    return response.json();
  },

  async getCurrentVersion(contentHash: string): Promise<ApiResponse<ContentVersion>> {
    const response = await fetch(`${API_BASE}/versions/current/${contentHash}`);
    return response.json();
  },

  // Version Comparison
  async compareVersions(versionAId: string, versionBId: string): Promise<ApiResponse<VersionComparison>> {
    const response = await fetch(
      `${API_BASE}/versions/compare?versionA=${versionAId}&versionB=${versionBId}`,
    );
    return response.json();
  },

  // Version Rollback
  async rollbackToVersion(contentHash: string, versionId: string): Promise<ApiResponse<ContentVersion>> {
    const response = await fetch(`${API_BASE}/versions/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentHash, versionId }),
    });
    return response.json();
  },

  // Version Metadata
  async updateVersionMetadata(
    versionId: string,
    changeLog?: string,
  ): Promise<ApiResponse<ContentVersion>> {
    const response = await fetch(`${API_BASE}/versions/${versionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeLog }),
    });
    return response.json();
  },

  async deleteVersion(versionId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/versions/${versionId}`, {
      method: "DELETE",
    });
    return response.json();
  },
};
