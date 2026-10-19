import type {
  ApiResponse,
  AuditLogEntry,
  SharedVerificationDocument,
  VerificationNotification,
  VerificationTeam,
  WorkflowStep,
} from "@stellarveriphy/shared";

const API_BASE = "/api";

export const collaborationService = {
  // Team Management
  async createTeam(name: string, description?: string): Promise<ApiResponse<VerificationTeam>> {
    const response = await fetch(`${API_BASE}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    return response.json();
  },

  async getTeam(teamId: string): Promise<ApiResponse<VerificationTeam>> {
    const response = await fetch(`${API_BASE}/teams/${teamId}`);
    return response.json();
  },

  async getUserTeams(): Promise<ApiResponse<VerificationTeam[]>> {
    const response = await fetch(`${API_BASE}/teams`);
    return response.json();
  },

  async addTeamMember(
    teamId: string,
    publicKey: string,
    role: string,
  ): Promise<ApiResponse<VerificationTeam>> {
    const response = await fetch(`${API_BASE}/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey, role }),
    });
    return response.json();
  },

  async removeTeamMember(teamId: string, publicKey: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/teams/${teamId}/members/${publicKey}`, {
      method: "DELETE",
    });
    return response.json();
  },

  async updateTeamMemberRole(
    teamId: string,
    publicKey: string,
    role: string,
  ): Promise<ApiResponse<VerificationTeam>> {
    const response = await fetch(`${API_BASE}/teams/${teamId}/members/${publicKey}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    return response.json();
  },

  // Shared Documents
  async createSharedDocument(
    teamId: string,
    title: string,
    contentHash: string,
    manifestHash: string,
    description?: string,
  ): Promise<ApiResponse<SharedVerificationDocument>> {
    const response = await fetch(`${API_BASE}/teams/${teamId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, contentHash, manifestHash, description }),
    });
    return response.json();
  },

  async getTeamDocuments(teamId: string): Promise<ApiResponse<SharedVerificationDocument[]>> {
    const response = await fetch(`${API_BASE}/teams/${teamId}/documents`);
    return response.json();
  },

  async getDocument(documentId: string): Promise<ApiResponse<SharedVerificationDocument>> {
    const response = await fetch(`${API_BASE}/documents/${documentId}`);
    return response.json();
  },

  async updateDocumentStatus(
    documentId: string,
    status: "draft" | "in_review" | "approved" | "rejected",
  ): Promise<ApiResponse<SharedVerificationDocument>> {
    const response = await fetch(`${API_BASE}/documents/${documentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return response.json();
  },

  async addDocumentEditor(documentId: string, publicKey: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/documents/${documentId}/editors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });
    return response.json();
  },

  // Workflow Management
  async createWorkflowStep(
    documentId: string,
    stepNumber: number,
    approverRole: string,
  ): Promise<ApiResponse<WorkflowStep>> {
    const response = await fetch(`${API_BASE}/documents/${documentId}/workflow-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepNumber, approverRole }),
    });
    return response.json();
  },

  async getDocumentWorkflow(documentId: string): Promise<ApiResponse<WorkflowStep[]>> {
    const response = await fetch(`${API_BASE}/documents/${documentId}/workflow-steps`);
    return response.json();
  },

  async approveWorkflowStep(
    stepId: string,
    comment?: string,
  ): Promise<ApiResponse<WorkflowStep>> {
    const response = await fetch(`${API_BASE}/workflow-steps/${stepId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    return response.json();
  },

  async rejectWorkflowStep(
    stepId: string,
    comment?: string,
  ): Promise<ApiResponse<WorkflowStep>> {
    const response = await fetch(`${API_BASE}/workflow-steps/${stepId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    return response.json();
  },

  // Audit Logs
  async getAuditLogs(entityId: string): Promise<ApiResponse<AuditLogEntry[]>> {
    const response = await fetch(`${API_BASE}/audit-logs?entityId=${entityId}`);
    return response.json();
  },

  async logAction(
    entityType: string,
    entityId: string,
    action: string,
    details?: Record<string, unknown>,
  ): Promise<ApiResponse<AuditLogEntry>> {
    const response = await fetch(`${API_BASE}/audit-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, action, details }),
    });
    return response.json();
  },

  // Notifications
  async getNotifications(): Promise<ApiResponse<VerificationNotification[]>> {
    const response = await fetch(`${API_BASE}/notifications`);
    return response.json();
  },

  async markNotificationRead(notificationId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method: "POST",
    });
    return response.json();
  },

  async deleteNotification(notificationId: string): Promise<ApiResponse<void>> {
    const response = await fetch(`${API_BASE}/notifications/${notificationId}`, {
      method: "DELETE",
    });
    return response.json();
  },
};
