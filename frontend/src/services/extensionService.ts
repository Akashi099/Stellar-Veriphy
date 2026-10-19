import type {
  ApiResponse,
  ExtensionVerificationRequest,
  ExtensionVerificationResult,
} from "@stellarveriphy/shared";

const API_BASE = "/api";

export const extensionService = {
  async verifyContent(
    request: ExtensionVerificationRequest,
  ): Promise<ApiResponse<ExtensionVerificationResult>> {
    const response = await fetch(`${API_BASE}/extension/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  },

  async getCertificateByHash(contentHash: string): Promise<ApiResponse<ExtensionVerificationResult>> {
    const response = await fetch(`${API_BASE}/extension/certificate/${contentHash}`);
    return response.json();
  },

  async reportBadCertificate(
    certificateId: string,
    reason: string,
  ): Promise<ApiResponse<{ reported: boolean }>> {
    const response = await fetch(`${API_BASE}/extension/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificateId, reason }),
    });
    return response.json();
  },

  async getExtensionStats(): Promise<
    ApiResponse<{
      totalVerifications: number;
      verifiedThisSession: number;
      averageVerificationTime: number;
    }>
  > {
    const response = await fetch(`${API_BASE}/extension/stats`);
    return response.json();
  },

  async logVerificationEvent(
    event: string,
    metadata?: Record<string, unknown>,
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/extension/log-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, metadata }),
    });
    return response.json();
  },
};
