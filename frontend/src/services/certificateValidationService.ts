import type {
  ApiResponse,
  CertificateDetails,
  CertificateValidation,
} from "@stellarveriphy/shared";

const API_BASE = "/api";

export const certificateValidationService = {
  async validateCertificate(
    certificateId: string,
  ): Promise<ApiResponse<CertificateValidation>> {
    const response = await fetch(`${API_BASE}/certificates/${certificateId}/validate`, {
      method: "POST",
    });
    return response.json();
  },

  async getCertificateDetails(
    certificateId: string,
  ): Promise<ApiResponse<CertificateDetails>> {
    const response = await fetch(`${API_BASE}/certificates/${certificateId}`);
    return response.json();
  },

  async verifyCertificateChain(
    certificateId: string,
  ): Promise<ApiResponse<{ isValid: boolean; chainDetails: unknown }>> {
    const response = await fetch(`${API_BASE}/certificates/${certificateId}/chain-verify`, {
      method: "POST",
    });
    return response.json();
  },

  async checkCertificateRevocation(
    certificateId: string,
  ): Promise<ApiResponse<{ isRevoked: boolean; revokedAt?: number }>> {
    const response = await fetch(`${API_BASE}/certificates/${certificateId}/revocation-status`);
    return response.json();
  },

  async searchCertificates(
    query: string,
    limit: number = 10,
  ): Promise<ApiResponse<CertificateDetails[]>> {
    const response = await fetch(`${API_BASE}/certificates/search?q=${query}&limit=${limit}`);
    return response.json();
  },

  async getCertificatesByCreator(
    creatorPublicKey: string,
  ): Promise<ApiResponse<CertificateDetails[]>> {
    const response = await fetch(`${API_BASE}/certificates/creator/${creatorPublicKey}`);
    return response.json();
  },

  async calculateTrustScore(certificateId: string): Promise<ApiResponse<number>> {
    const response = await fetch(`${API_BASE}/certificates/${certificateId}/trust-score`);
    return response.json();
  },
};
