import { auditLogger } from "./auditLogger";

export type Role = "creator" | "verifier" | "admin" | "consumer";

export type ProvenanceAction =
  | "view:certificate"
  | "submit:request"
  | "execute:verification"
  | "mint:certificate"
  | "transfer:certificate"
  | "revoke:certificate"
  | "lock:certificate"
  | "modify:manifest"
  | "manage:provider"
  | "approve:tee_hash"
  | "pause:oracle"
  | "slash:stake"
  | "view:analytics";

export type ConsentScope =
  | "read:certificate"
  | "read:analytics"
  | "share:provenance"
  | "verify:delegate"
  | "write:manifest"
  | "admin:registry";

export interface ConsentGrant {
  grantee: string;
  grantor: string;
  scopes: ConsentScope[];
  grantedAt: string;
  expiresAt?: string;
}

export interface PermissionContext {
  actor: string;
  role: Role;
  resourceOwner?: string;
  consentGrants?: ConsentGrant[];
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
}

const STORAGE_KEY = "sv_consent_grants";

function readGrants(): ConsentGrant[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as ConsentGrant[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGrants(grants: ConsentGrant[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(grants));
}

function isGrantActive(grant: ConsentGrant): boolean {
  if (!grant.expiresAt) return true;
  return new Date(grant.expiresAt) > new Date();
}

function actorHasScope(actor: string, scope: ConsentScope): boolean {
  const grants = readGrants();
  return grants.some(
    (g) => g.grantee === actor && g.scopes.includes(scope) && isGrantActive(g)
  );
}

export function checkPermission(
  ctx: PermissionContext,
  action: ProvenanceAction
): PermissionResult {
  const { actor, role, resourceOwner } = ctx;

  const deny = (reason: string): PermissionResult => {
    void auditLogger.logEvent({
      actor,
      category: "auth",
      action: "permission_denied",
      severity: "warning",
      details: `action=${action} role=${role} reason=${reason}`,
    });
    return { allowed: false, reason };
  };

  const allow = (): PermissionResult => {
    void auditLogger.logEvent({
      actor,
      category: "auth",
      action: "permission_checked",
      severity: "info",
      details: `action=${action} role=${role}`,
    });
    return { allowed: true, reason: "permitted" };
  };

  switch (action) {
    case "view:certificate": {
      if (role === "admin") return allow();
      if (role === "creator" && actor === resourceOwner) return allow();
      if (role === "verifier") return allow();
      if (actorHasScope(actor, "read:certificate")) return allow();
      return deny("requires read:certificate consent or ownership");
    }

    case "submit:request": {
      if (role === "creator" || role === "admin") return allow();
      return deny("only creators and admins may submit verification requests");
    }

    case "execute:verification": {
      if (role === "verifier") return allow();
      return deny("only registered oracle providers may execute verification");
    }

    case "mint:certificate": {
      if (role === "verifier") return allow();
      return deny("certificate minting is oracle-gated; only verifiers may mint");
    }

    case "transfer:certificate": {
      if (role === "creator" && actor === resourceOwner) return allow();
      return deny("only the certificate owner may transfer it");
    }

    case "revoke:certificate": {
      if (role === "admin") return allow();
      if (role === "creator" && actor === resourceOwner) return allow();
      return deny("revocation requires ownership or admin authority");
    }

    case "lock:certificate": {
      if (role === "admin") return allow();
      if (role === "creator" && actor === resourceOwner) return allow();
      return deny("locking requires ownership or admin authority");
    }

    case "modify:manifest": {
      if (role === "creator" && actor === resourceOwner) return allow();
      if (actorHasScope(actor, "write:manifest")) return allow();
      return deny("manifest modification requires ownership or write:manifest consent");
    }

    case "manage:provider":
    case "approve:tee_hash":
    case "pause:oracle":
    case "slash:stake": {
      if (role === "admin") return allow();
      return deny("administrative actions require admin role");
    }

    case "view:analytics": {
      if (role === "admin") return allow();
      if (actorHasScope(actor, "read:analytics")) return allow();
      return deny("analytics access requires admin role or read:analytics consent");
    }

    default:
      return deny("unknown action");
  }
}

export async function grantConsent(
  grantor: string,
  grantee: string,
  scopes: ConsentScope[],
  expiresAt?: string
): Promise<ConsentGrant> {
  const grant: ConsentGrant = {
    grantee,
    grantor,
    scopes,
    grantedAt: new Date().toISOString(),
    expiresAt,
  };

  const grants = readGrants();
  const filtered = grants.filter(
    (g) => !(g.grantee === grantee && g.grantor === grantor)
  );
  filtered.push(grant);
  writeGrants(filtered);

  await auditLogger.logEvent({
    actor: grantor,
    category: "auth",
    action: "consent_granted",
    severity: "info",
    details: `grantee=${grantee} scopes=${scopes.join(",")}`,
  });

  return grant;
}

export async function revokeConsent(grantor: string, grantee: string): Promise<void> {
  const grants = readGrants();
  const filtered = grants.filter(
    (g) => !(g.grantee === grantee && g.grantor === grantor)
  );
  writeGrants(filtered);

  await auditLogger.logEvent({
    actor: grantor,
    category: "auth",
    action: "consent_revoked",
    severity: "info",
    details: `grantee=${grantee}`,
  });
}

export function getActiveGrants(actor: string): ConsentGrant[] {
  return readGrants().filter(
    (g) => (g.grantee === actor || g.grantor === actor) && isGrantActive(g)
  );
}
