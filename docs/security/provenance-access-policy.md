# Dynamic Policy Engine for Provenance Access Controls

This document describes the rule-based access-control engine that governs what
provenance data can be shared and with whom, based on content type, jurisdiction,
user role, and trust posture.

Closes #684.

> **Warning:** The implementation described here is the design-phase
> specification. Do not test; implement only.

---

## Overview

The access-control engine is defined in
`packages/shared/access-policy/index.ts`. It evaluates an
`AccessPolicyContext` — facts about the actor, the resource, and the requested
action — against an ordered list of `AccessPolicyRule` items and returns an
`AccessPolicyDecision`.

The `defaultAccessRuleSet` (v1.0.0) encodes StellarVeriphy's baseline access
policy. It can be extended or replaced per deployment without modifying the
evaluation engine.

---

## User roles

| Role         | Description                                         |
| ------------ | --------------------------------------------------- |
| `creator`    | Content creator; full access to own certificates    |
| `verifier`   | Oracle worker or internal verification service      |
| `admin`      | Platform administrator; bypasses all standard rules |
| `consumer`   | Unauthenticated or read-only user                   |
| `enterprise` | Enterprise tenant member                            |
| `auditor`    | Compliance auditor; read-only                       |
| `regulator`  | External regulator; elevated read rights            |

---

## Actions

| Action               | Description                                        |
| -------------------- | -------------------------------------------------- |
| `read:certificate`   | Read certificate metadata and provenance record    |
| `read:full_manifest` | Read the full (potentially sensitive) manifest     |
| `read:attestation`   | Read attestation evidence                          |
| `read:analytics`     | Read analytics derived from this resource          |
| `share:certificate`  | Re-publish / link the certificate to a third party |
| `export:certificate` | Export certificate to PDF or external format       |
| `write:manifest`     | Update or annotate the manifest                    |
| `revoke:certificate` | Revoke the certificate                             |
| `transfer:ownership` | Transfer the certificate to another account        |
| `admin:override`     | Admin-only: bypass standard access rules           |

---

## Default rule summary (v1.0.0)

Rules are evaluated in order. The first `allow` or `deny` match terminates
evaluation. `condition` rules accumulate notices without stopping.

| Rule ID                              | Effect    | Applies when                                                                              |
| ------------------------------------ | --------- | ----------------------------------------------------------------------------------------- |
| `deny-revoked-resource`              | deny      | Resource is revoked (except `admin:override`)                                             |
| `deny-locked-modification`           | deny      | Resource is locked and action modifies it                                                 |
| `allow-admin-override`               | allow     | Actor role is `admin`                                                                     |
| `allow-owner-full-access`            | allow     | Actor address matches resource owner                                                      |
| `allow-regulator-read`               | allow     | Role is `regulator`, action is a read                                                     |
| `allow-auditor-read`                 | allow     | Role is `auditor`, action is a read                                                       |
| `allow-trusted-verifier-attestation` | allow     | Role is `verifier` with `high`/`medium` trust, action is `read:attestation`               |
| `deny-untrusted-verifier`            | deny      | Role is `verifier` with `low`/`untrusted` trust, action is `read:attestation`             |
| `deny-legal-unverified-identity`     | deny      | Content is legal/medical/financial, action is `read:full_manifest`, identity not verified |
| `eu-gdpr-access-condition`           | condition | EU jurisdiction, consumer role, `read:certificate`                                        |
| `allow-public-certificate-read`      | allow     | Resource is publicly shareable, action is `read:certificate`                              |
| `allow-public-share`                 | allow     | Resource is publicly shareable, action is `share:certificate`                             |
| `allow-enterprise-read`              | allow     | Role is `enterprise`, action is read/export                                               |
| `deny-consumer-government-document`  | deny      | Content is `government_document`, role is `consumer`                                      |
| `allow-creator-self-actions`         | allow     | Role is `creator`, action is read/write/share/export                                      |
| `allow-consumer-basic-read`          | allow     | Role is `consumer`, non-sensitive content type, `read:certificate`                        |
| `deny-non-admin-override`            | deny      | Action is `admin:override`, role is not `admin`                                           |
| `default_deny`                       | deny      | No allow rule matched                                                                     |

---

## Evaluation flow

```
Request arrives
      │
      ▼
Evaluate rules in order:
  ├── deny rule matches? ──▶ DENY (immediately)
  ├── allow rule matches? ──▶ ALLOW (with accumulated conditions)
  ├── condition rule matches? ──▶ add to conditions, continue
  └── no more rules ──▶ DENY (default_deny)
```

---

## Conditions

Some rules produce conditions rather than allow/deny outcomes. Conditions are
accumulated in `AccessPolicyDecision.conditions` and must be presented to the
end user by the calling frontend.

Example condition: `"GDPR Notice: this access has been logged. The data
subject may request erasure of off-chain metadata under Article 17 GDPR."`

---

## Trust posture

The `TrustPosture` type maps a numeric provider trust score (0–100) to a
qualitative tier:

| Score  | Posture     |
| ------ | ----------- |
| 75–100 | `high`      |
| 50–74  | `medium`    |
| 25–49  | `low`       |
| 0–24   | `untrusted` |

Use `trustPostureFromScore(score)` to convert before constructing
`AccessActor.trustPosture`.

---

## Extending the policy

Add a new rule to the rule set for any new jurisdiction, role, or content type:

```typescript
import { defaultAccessRuleSet, AccessPolicyRuleSet } from "@stellarveriphy/shared/access-policy";

const myRuleSet: AccessPolicyRuleSet = {
  ...defaultAccessRuleSet,
  id: "my-deployment-policy",
  version: "1.1.0",
  rules: [
    // New rule: block consumers from reading AI-generated medical data
    {
      id: "deny-consumer-ai-medical",
      description: "Consumers may not read AI-generated medical records.",
      predicate: (ctx) =>
        ctx.actor.role === "consumer" &&
        ctx.resource.contentType === "medical_record" &&
        ctx.requestedAction === "read:certificate",
      effect: "deny",
      reason: "content_type_restriction",
    },
    // Followed by all default rules
    ...defaultAccessRuleSet.rules,
  ],
};
```

---

## Audit trail

Every `AccessPolicyDecision` records:

- `appliedRuleId` — which rule produced the decision.
- `policyVersion` — the rule set version at evaluation time.
- `decidedAt` — ISO 8601 timestamp.

These fields should be logged alongside the actor identity and resource ID
in the compliance audit trail (`frontend/lib/compliance/complianceAuditTrail.ts`).

---

## Related

- `packages/shared/access-policy/index.ts` — implementation
- `docs/adr/0014-dynamic-provenance-access-policy.md` — decision record
- `frontend/lib/security/permissionModel.ts` — role-level permission model
- `packages/shared/policy/index.ts` — compliance policy engine
- `docs/security/consent-model.md` — consent grant model
