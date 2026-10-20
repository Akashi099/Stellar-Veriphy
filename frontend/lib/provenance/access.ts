/**
 * Role resolution for provenance bulk export.
 *
 * - admin   : address listed in NEXT_PUBLIC_ADMIN_ADDRESSES (comma separated) — may export all records
 * - creator : any connected wallet — may export records it currently owns
 * - guest   : not connected — export unavailable
 */
export type ExportRole = "admin" | "creator" | "guest";

const ADMINS = (process.env.NEXT_PUBLIC_ADMIN_ADDRESSES ?? "")
  .split(",")
  .map((a) => a.trim().toUpperCase())
  .filter(Boolean);

export function resolveExportRole(publicKey: string | null): ExportRole {
  if (!publicKey) return "guest";
  return ADMINS.includes(publicKey.toUpperCase()) ? "admin" : "creator";
}

/**
 * Permissions that may be required for provenance actions.
 */
export type ProvenancePermission = "export:all" | "export:owned";

/**
 * Describes why an action is outside the current access scope, so the
 * request-access UI can explain the restriction and what is required.
 */
export interface AccessRestriction {
  /** Whether the action is currently allowed for the resolved role. */
  allowed: boolean;
  /** The role the user currently holds. */
  currentRole: ExportRole;
  /** The permission required to perform the action. */
  requiredPermission: ProvenancePermission;
  /** The role(s) that satisfy the required permission. */
  requiredRoles: ExportRole[];
  /** Short machine-readable reason code. */
  reason: "allowed" | "not-connected" | "insufficient-role";
  /** Human-readable explanation of why access is restricted. */
  message: string;
}

const PERMISSION_ROLES: Record<ProvenancePermission, ExportRole[]> = {
  "export:all": ["admin"],
  "export:owned": ["admin", "creator"],
};

const PERMISSION_LABELS: Record<ProvenancePermission, string> = {
  "export:all": "export all provenance records",
  "export:owned": "export provenance records you own",
};

/**
 * Detects whether an action requiring `permission` is outside the current
 * access scope for the given wallet, and describes the restriction.
 */
export function describeAccessRestriction(
  publicKey: string | null,
  permission: ProvenancePermission,
): AccessRestriction {
  const currentRole = resolveExportRole(publicKey);
  const requiredRoles = PERMISSION_ROLES[permission];
  const allowed = requiredRoles.includes(currentRole);

  if (allowed) {
    return {
      allowed: true,
      currentRole,
      requiredPermission: permission,
      requiredRoles,
      reason: "allowed",
      message: `You have access to ${PERMISSION_LABELS[permission]}.`,
    };
  }

  if (currentRole === "guest") {
    return {
      allowed: false,
      currentRole,
      requiredPermission: permission,
      requiredRoles,
      reason: "not-connected",
      message: `Connect your wallet to ${PERMISSION_LABELS[permission]}.`,
    };
  }

  return {
    allowed: false,
    currentRole,
    requiredPermission: permission,
    requiredRoles,
    reason: "insufficient-role",
    message: `Your current role (${currentRole}) does not allow you to ${PERMISSION_LABELS[permission]}. Request access to continue.`,
  };
}