import type { AuditLogEntry, TeamRole, WorkflowStep } from "../types";

export type WorkflowAction = "approve" | "reject" | "escalate" | "request_changes";

export interface ReviewNote {
  stepId: string;
  author: string;
  content: string;
  createdAt: string;
  action: WorkflowAction;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: Array<{ role: TeamRole; label: string }>;
  // Minimum number of approvals needed before finalization is allowed.
  requiredApprovals: number;
  // Role that may perform the final finalization step.
  finalizerRole: TeamRole;
}

export type WorkflowInstanceStatus = "active" | "approved" | "rejected" | "escalated";

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  documentId: string;
  currentStep: number;
  steps: WorkflowStep[];
  reviewNotes: ReviewNote[];
  status: WorkflowInstanceStatus;
  createdAt: string;
  updatedAt: string;
  escalatedTo?: string;
  resolutionNote?: string;
}

export type WorkflowAdvanceResult =
  | { ok: true; instance: WorkflowInstance }
  | { ok: false; reason: string };

export function createWorkflowInstance(
  definition: WorkflowDefinition,
  documentId: string,
  instanceId: string,
  now = new Date(),
): WorkflowInstance {
  const ts = now.toISOString();
  return {
    id: instanceId,
    definitionId: definition.id,
    documentId,
    currentStep: 0,
    steps: definition.steps.map((s, i) => ({
      id: `${instanceId}-step-${i}`,
      documentId,
      stepNumber: i + 1,
      approverRole: s.role,
      status: "pending",
    })),
    reviewNotes: [],
    status: "active",
    createdAt: ts,
    updatedAt: ts,
  };
}

export function advanceWorkflow(
  instance: WorkflowInstance,
  actor: string,
  action: WorkflowAction,
  note?: string,
  now = new Date(),
): WorkflowAdvanceResult {
  if (instance.status !== "active") {
    return { ok: false, reason: `Workflow is already in terminal state: ${instance.status}.` };
  }

  const stepIndex = instance.currentStep;
  const step = instance.steps[stepIndex];
  if (!step) {
    return { ok: false, reason: "No active step found." };
  }

  const ts = now.toISOString();
  const reviewNote: ReviewNote = {
    stepId: step.id,
    author: actor,
    content: note ?? "",
    createdAt: ts,
    action,
  };

  const base: WorkflowInstance = {
    ...instance,
    reviewNotes: [...instance.reviewNotes, reviewNote],
    updatedAt: ts,
  };

  if (action === "reject") {
    const steps = base.steps.map((s, i) =>
      i === stepIndex
        ? { ...s, status: "rejected" as const, approvedBy: actor, approvedAt: now.getTime(), comment: note }
        : s,
    );
    return { ok: true, instance: { ...base, steps, status: "rejected", resolutionNote: note } };
  }

  if (action === "escalate") {
    return { ok: true, instance: { ...base, status: "escalated", escalatedTo: actor } };
  }

  if (action === "request_changes") {
    // Record the note but keep the step pending for re-submission.
    return { ok: true, instance: base };
  }

  // action === "approve"
  const steps = base.steps.map((s, i) =>
    i === stepIndex
      ? { ...s, status: "approved" as const, approvedBy: actor, approvedAt: now.getTime(), comment: note }
      : s,
  );

  const nextStep = stepIndex + 1;
  if (nextStep >= instance.steps.length) {
    return {
      ok: true,
      instance: { ...base, steps, currentStep: nextStep, status: "approved", resolutionNote: note },
    };
  }

  return { ok: true, instance: { ...base, steps, currentStep: nextStep } };
}

export function buildAuditEntry(
  instance: WorkflowInstance,
  actor: string,
  action: WorkflowAction,
  entryId: string,
  now = new Date(),
): AuditLogEntry {
  return {
    id: entryId,
    entityType: "workflow",
    entityId: instance.id,
    action,
    actor,
    details: { documentId: instance.documentId, currentStep: instance.currentStep },
    timestamp: now.getTime(),
  };
}

export function isWorkflowTerminal(instance: WorkflowInstance): boolean {
  return instance.status === "approved" || instance.status === "rejected";
}

export function pendingApproverRole(instance: WorkflowInstance): TeamRole | null {
  if (instance.status !== "active") return null;
  return instance.steps[instance.currentStep]?.approverRole ?? null;
}

export function reviewHistory(instance: WorkflowInstance): ReviewNote[] {
  return [...instance.reviewNotes];
}
