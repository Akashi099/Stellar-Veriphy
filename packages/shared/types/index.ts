import type { PaginationMeta } from "../validation/pagination";
import type { FieldError } from "../validation/result";

// ---------------------------------------------------------------------------
// Core content manifest
// ---------------------------------------------------------------------------

export interface ContentManifest {
  schemaVersion?: string;
  contentHash: string;
  creator: string;
  timestamp: string;
  metadata?: {
    device?: string;
    location?: string;
    aiModel?: string;
    [key: string]: string | undefined;
  };
  media?: {
    fileName?: string;
    fileType?: string;
    fileSizeBytes?: number;
  };
}

// ---------------------------------------------------------------------------
// Provenance certificate
// ---------------------------------------------------------------------------

export interface ProvenanceCert {
  id: string;
  storageRef: string;
  manifestHash: string;
  attestationHash: string;
  /** Original content creator; remains unchanged when ownership is transferred. */
  creator: string;
  /** Current certificate owner, resolved separately from the on-chain owner lookup. */
  owner?: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Verification status
// ---------------------------------------------------------------------------

export type VerificationStatus = "pending" | "processing" | "certified" | "failed";

// ---------------------------------------------------------------------------
// Upload metadata — POST /api/uploads
// ---------------------------------------------------------------------------

export interface UploadMetadata {
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  creator: string;
  title?: string;
  description?: string;
  tags: string[];
  manifest: ContentManifest;
}

export interface UploadRecord extends UploadMetadata {
  id: string;
  createdAt: string;
  manifestHash: string;
}

// ---------------------------------------------------------------------------
// Verification job (API / frontend tracking)
// ---------------------------------------------------------------------------

export interface VerificationJob {
  id: string;
  uploadId: string;
  status: VerificationStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: { manifestHash: string };
}

export interface VerificationJobView extends VerificationJob {
  queuePosition: number | null;
  estimatedWaitMs: number | null;
  averageDurationMs: number | null;
}

// ---------------------------------------------------------------------------
// Attestation evidence
// ---------------------------------------------------------------------------

export interface AttestationEvidence {
  enclave: string;
  attestationHash: string;
  attestationValid: boolean;
  teeCodeHash: string;
  teeCodeHashApproved: boolean;
  contentHashMatches: boolean;
  creatorSigned: boolean;
}

// ---------------------------------------------------------------------------
// Provenance event types (legacy — used by VerificationRecord)
// ---------------------------------------------------------------------------

export type LegacyProvenanceEventType =
  | "manifest_created"
  | "uploaded"
  | "verification_requested"
  | "attestation_generated"
  | "certificate_minted"
  | "verification_failed";

export interface LegacyProvenanceEvent {
  type: LegacyProvenanceEventType;
  timestamp: string;
  actor?: string;
  detail?: string;
  txHash?: string;
}

// ---------------------------------------------------------------------------
// Verification record (frontend domain object)
// ---------------------------------------------------------------------------

export interface VerificationRecord {
  id: string;
  title: string;
  mediaType: "image" | "video" | "audio" | "document";
  status: VerificationStatus;
  manifest: ContentManifest;
  cert?: ProvenanceCert;
  evidence?: AttestationEvidence;
  timeline: LegacyProvenanceEvent[];
}

// ---------------------------------------------------------------------------
// Verification mode
// ---------------------------------------------------------------------------

export type VerificationMode = "standard" | "advanced";

// ---------------------------------------------------------------------------
// Wallet connection status
// ---------------------------------------------------------------------------

export type WalletConnectionStatus = "disconnected" | "connecting" | "connected";

// ---------------------------------------------------------------------------
// CertificateDetails — mirrors the on-chain ProvenanceCert struct
// ---------------------------------------------------------------------------

export interface CertificateDetails {
  id: string;
  storageRef: string;
  manifestHash: string;
  attestationHash: string;
  creator: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// VerificationJob (on-chain Oracle job — note: separate from UploadVerificationJob)
// ---------------------------------------------------------------------------

export type VerificationJobStatus = "pending" | "processing" | "verified" | "rejected" | "failed";

export interface OracleVerificationJob {
  jobId: string;
  status: VerificationJobStatus;
  contentHash: string;
  manifestHash: string;
  certificateId?: string;
}

// ---------------------------------------------------------------------------
// ApiResponse — generic wrapper
// ---------------------------------------------------------------------------

// `pagination` is present on collection endpoints (docs/api/pagination.md);
// `errors` lists field-level problems when the request failed validation.
export type ApiResponse<T> =
  | { success: true; data: T; error?: never; pagination?: PaginationMeta }
  | { success: false; error: string; data?: never; errors?: FieldError[] };

// ---------------------------------------------------------------------------
// SLA tracking
// ---------------------------------------------------------------------------

export interface ProviderSLA {
  targetResponseTimeSeconds: number;
  targetUptimePercentage: number;
  targetSuccessRate: number;
  actualResponseTime: number;
  actualUptime: number;
  actualSuccessRate: number;
  totalRequests: number;
  successful: number;
  totalResponseSum: number;
}

export interface SLACompliance {
  responseTimeOk: boolean;
  uptimeOk: boolean;
  successRateOk: boolean;
  compliancePercent: number;
  suspended: boolean;
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

export type PriorityLevel = "low" | "normal" | "high" | "urgent";
export type ContentComplexity = "simple" | "moderate" | "complex";

export interface ProviderPricing {
  baseFeeStroops: number;
  perKbFeeStroops: number;
}

export interface CostEstimate {
  baseFee: number;
  sizeFee: number;
  priorityFee: number;
  complexityFee: number;
  total: number;
}

// ---------------------------------------------------------------------------
// TEE hash certificate references
// ---------------------------------------------------------------------------

export interface TeeHashCertRef {
  issuer: string;
  validFrom: number;
  validUntil: number;
  certUri?: string;
  codeHash: string;
}

export interface TeeHashWithCert {
  approved: boolean;
  certRef?: TeeHashCertRef;
}

// ---------------------------------------------------------------------------
// Provenance events, records & export (#616–#619)
// ---------------------------------------------------------------------------

export type ProvenanceEventType =
  | "verification_submitted"
  | "verification_completed"
  | "verification_failed"
  | "certificate_minted"
  | "metadata_updated"
  | "ownership_transferred"
  | "certificate_renewed"
  | "certificate_linked"
  | "certificate_revoked";

export interface ProvenanceEvent {
  id: string;
  certificateId: string;
  type: ProvenanceEventType;
  actor: string;
  timestamp: number;
  details?: string;
  changes?: Record<string, { from?: string; to?: string }>;
  relatedCertificateId?: string;
  txHash?: string;
}

export interface ProvenanceRecord extends CertificateDetails {
  contentHash: string;
  status: "active" | "revoked" | "expired";
  fileName?: string;
  fileType?: string;
  eventCount: number;
  lastEventAt: number;
}

export type ProvenanceExportFormat = "json" | "csv" | "ndjson";

export interface ProvenanceExportMeta {
  schemaVersion: string;
  exportedAt: string;
  exportedBy: string;
  scope: "own" | "all";
  recordCount: number;
  part: number;
  totalParts: number;
}

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is { success: true; data: T; error?: never } {
  return response.success === true;
}

export function isApiError<T>(
  response: ApiResponse<T>,
): response is { success: false; error: string; data?: never } {
  return response.success === false;
}

export function isVerificationStatus(status: string): status is VerificationStatus {
  return (
    status === "pending" ||
    status === "processing" ||
    status === "certified" ||
    status === "failed"
  );
}

export function isVerificationJobStatus(status: string): status is VerificationJobStatus {
  return (
    status === "pending" ||
    status === "processing" ||
    status === "verified" ||
    status === "rejected" ||
    status === "failed"
  );
}

export function isCertificateDetails(value: unknown): value is CertificateDetails {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.storageRef === "string" &&
    typeof v.manifestHash === "string" &&
    typeof v.attestationHash === "string" &&
    typeof v.creator === "string" &&
    typeof v.timestamp === "number"
  );
}

export function isContentManifest(value: unknown): value is ContentManifest {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.contentHash === "string" &&
    typeof v.creator === "string" &&
    typeof v.timestamp === "string"
  );
}

// ---------------------------------------------------------------------------
// Generic utility types
// ---------------------------------------------------------------------------

export type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type ApiData<R extends ApiResponse<unknown>> = R extends { success: true; data: infer D }
  ? D
  : never;

export type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// ---------------------------------------------------------------------------
// Collaborative Verification (#468)
// ---------------------------------------------------------------------------

export type TeamRole = "owner" | "editor" | "reviewer" | "viewer";

export type Permission =
  | "view_verification"
  | "edit_verification"
  | "approve_verification"
  | "manage_team"
  | "export_data";

export interface TeamMember {
  publicKey: string;
  role: TeamRole;
  addedAt: number;
  permissions: Permission[];
}

export interface VerificationTeam {
  id: string;
  name: string;
  description?: string;
  owner: string;
  members: TeamMember[];
  createdAt: number;
  updatedAt: number;
}

export interface SharedVerificationDocument {
  id: string;
  teamId: string;
  certificateId?: string;
  title: string;
  description?: string;
  contentHash: string;
  manifestHash: string;
  status: "draft" | "in_review" | "approved" | "rejected";
  createdBy: string;
  createdAt: number;
  lastModifiedBy: string;
  lastModifiedAt: number;
  editors: string[];
}

export interface WorkflowStep {
  id: string;
  documentId: string;
  stepNumber: number;
  approverRole: TeamRole;
  status: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: number;
  comment?: string;
}

export interface AuditLogEntry {
  id: string;
  entityType:
    | "team"
    | "document"
    | "workflow"
    | "verification"
    | "dispute_evidence"
    | "api_token"
    | "provenance_recovery";
  entityId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export interface VerificationNotification {
  id: string;
  recipientPublicKey: string;
  type: "team_invite" | "document_shared" | "approval_requested" | "verification_complete";
  relatedEntityId: string;
  message: string;
  read: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Content Versioning (#469)
// ---------------------------------------------------------------------------

export interface ContentVersion {
  id: string;
  certificateId?: string;
  versionNumber: number;
  contentHash: string;
  manifestHash: string;
  creator: string;
  createdAt: number;
  changeLog?: string;
  previousVersionId?: string;
  nextVersionId?: string;
  isCurrentVersion: boolean;
}

export interface VersionHistory {
  id: string;
  contentHash: string;
  contentTitle?: string;
  versions: ContentVersion[];
  totalVersions: number;
  createdAt: number;
  updatedAt: number;
}

export interface VersionComparison {
  versionA: ContentVersion;
  versionB: ContentVersion;
  differences: VersionDifference[];
}

export interface VersionDifference {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: "added" | "removed" | "modified";
}

// ---------------------------------------------------------------------------
// Asset versioning — rollback metadata (#658)
// ---------------------------------------------------------------------------

export type RollbackReason =
  | "data_corruption"
  | "incorrect_attestation"
  | "creator_request"
  | "legal_requirement"
  | "operational_error"
  | "other";

export interface RollbackMetadata {
  id: string;
  contentHash: string;
  fromVersionId: string;
  fromVersionNumber: number;
  toVersionId: string;
  toVersionNumber: number;
  initiatedBy: string;
  initiatedAt: string;
  reason: RollbackReason;
  notes?: string;
  txHash?: string;
  targetManifestHash: string;
}

export interface RollbackHistory {
  contentHash: string;
  rollbacks: RollbackMetadata[];
  totalRollbacks: number;
}

// ---------------------------------------------------------------------------
// Admin moderation queue (#655)
// ---------------------------------------------------------------------------

export type ModerationTrigger =
  | "disputed_provenance"
  | "suspicious_attestation"
  | "creator_dispute"
  | "legal_flag"
  | "automated_anomaly"
  | "manual_escalation";

export type ModerationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected"
  | "escalated"
  | "resolved";

export interface ModerationQueueItem {
  id: string;
  assetId: string;
  contentHash: string;
  status: ModerationStatus;
  trigger: ModerationTrigger;
  reportedBy?: string;
  creatorAddress?: string;
  summary: string;
  evidence?: string[];
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  reviewNotes?: string;
  resolvedAt?: string;
  escalationChain?: string[];
}

export interface ModerationQueueSummary {
  total: number;
  pending: number;
  underReview: number;
  escalated: number;
  resolvedToday: number;
}

// ---------------------------------------------------------------------------
// Analytics Dashboard (#470)
// ---------------------------------------------------------------------------

export interface VerificationStatistics {
  totalVerifications: number;
  successfulVerifications: number;
  failedVerifications: number;
  successRate: number;
  averageProcessingTime: number;
}

export interface UsageTrendData {
  date: string;
  verifications: number;
  uniqueUsers: number;
  successfulCertificates: number;
}

export interface UsageTrends {
  period: "day" | "week" | "month" | "year";
  data: UsageTrendData[];
}

export interface ContentTypeMetric {
  contentType: string;
  count: number;
  percentage: number;
}

export interface PopularContentData {
  contentTypes: ContentTypeMetric[];
  topContentHashes: Array<{
    contentHash: string;
    verificationCount: number;
    lastVerifiedAt: number;
  }>;
}

export interface GeographicDistribution {
  country: string;
  region?: string;
  userCount: number;
  verificationCount: number;
  latitude?: number;
  longitude?: number;
}

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  verificationsByUser: Array<{
    publicKey: string;
    verificationCount: number;
    successfulVerifications: number;
  }>;
}

export interface AnalyticsReport {
  id: string;
  generatedAt: number;
  generatedBy: string;
  period: string;
  statistics: VerificationStatistics;
  trends: UsageTrends;
  contentPopularity: PopularContentData;
  geographicDistribution: GeographicDistribution[];
  userAnalytics: UserAnalytics;
  format: "pdf" | "csv" | "json";
}

// ---------------------------------------------------------------------------
// Browser Extension (#471)
// ---------------------------------------------------------------------------

export interface ExtensionConfig {
  apiBase: string;
  enableNotifications: boolean;
  autoVerifyImages: boolean;
  autoVerifyLinks: boolean;
  certificateValidationEnabled: boolean;
}

export interface ExtensionVerificationRequest {
  contentHash: string;
  contentType: "image" | "link" | "page" | "file";
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface ExtensionVerificationResult {
  contentHash: string;
  isVerified: boolean;
  certificateId?: string;
  certificateData?: CertificateDetails;
  validationStatus: "valid" | "invalid" | "expired" | "not_found";
  timestamp: number;
}

export interface CertificateValidation {
  certificateId: string;
  isValid: boolean;
  creator: string;
  createdAt: number;
  expiresAt?: number;
  trustScore: number;
  validationDetails: {
    signatureVerified: boolean;
    chainVerified: boolean;
    notRevoked: boolean;
    timestampValid: boolean;
  };
}

// ---------------------------------------------------------------------------
// Multi-anchor provenance (ADR-0008)
// ---------------------------------------------------------------------------
export * from "./anchors";
// Oracle Analytics Dashboard (Feature: analytics/operations/oracle)
// ---------------------------------------------------------------------------

/** A single time-series data point for oracle throughput */
export interface OracleThroughputPoint {
  /** Unix timestamp (seconds) for the start of this bucket */
  timestamp: number;
  /** ISO 8601 label for display (e.g. "2026-09-27T12:00") */
  label: string;
  /** Total verification requests processed in this bucket */
  total: number;
  /** Successful verifications */
  successful: number;
  /** Failed verifications */
  failed: number;
}

/** Oracle health status enum */
export type OracleHealthStatus = "healthy" | "degraded" | "critical" | "unknown";

/** Attestation health snapshot for a single oracle provider */
export interface OracleAttestationHealth {
  providerId: string;
  status: OracleHealthStatus;
  /** Success rate 0–100 */
  successRate: number;
  /** Average response time in seconds */
  avgResponseTimeSeconds: number;
  /** Uptime percentage 0–100 */
  uptimePercent: number;
  lastCheckedAt: number;
  /** Whether the provider is currently suspended */
  suspended: boolean;
  /** Whether a TEE hash near-expiry warning is active */
  teeHashNearExpiry: boolean;
}

/** Quality metrics across all oracle providers */
export interface OracleQualityMetrics {
  /** Total verifications across all providers */
  totalVerifications: number;
  /** Overall success rate (%) */
  overallSuccessRate: number;
  /** Average latency in seconds */
  avgLatencySeconds: number;
  /** Number of active providers */
  activeProviderCount: number;
  /** Number of suspended providers */
  suspendedProviderCount: number;
  /** Providers with critical health status */
  criticalProviderCount: number;
  /** Timestamp when metrics were last computed */
  computedAt: number;
}

/** Anomaly detected in oracle operations */
export interface OracleAnomaly {
  id: string;
  providerId?: string;
  type:
    | "high_failure_rate"
    | "latency_spike"
    | "tee_expiry"
    | "provider_suspended"
    | "low_throughput";
  severity: "warning" | "critical";
  description: string;
  detectedAt: number;
  resolved: boolean;
}

/** Full oracle analytics dashboard data */
export interface OracleDashboardData {
  quality: OracleQualityMetrics;
  providerHealth: OracleAttestationHealth[];
  throughput: OracleThroughputPoint[];
  anomalies: OracleAnomaly[];
  /** ISO 8601 timestamp of this snapshot */
  snapshotAt: string;
}

// ---------------------------------------------------------------------------
// Provenance Snapshot Diff (Feature: audit/feature/data)
// ---------------------------------------------------------------------------

export interface ProvenanceSnapshot {
  id: string;
  certificateId: string;
  manifestHash: string;
  attestationHash: string;
  storageRef: string;
  creator: string;
  actor: string;
  timestamp: number;
  verificationLevel?: string;
  revoked?: boolean;
  expiresAt?: number | null;
  metadata?: Record<string, string | undefined>;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Manifest Signing (Feature: security/blockchain/data)
// ---------------------------------------------------------------------------

export interface ManifestSignatureStatus {
  signed: boolean;
  verified: boolean;
  signerPublicKey?: string;
  signedAt?: string;
  reason?: string;
}
