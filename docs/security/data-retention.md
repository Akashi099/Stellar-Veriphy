# Data Retention Policy Summary

This document describes how user and asset data are retained, archived, and removed across the platform. It is intended for both end users (who want to understand what happens to their data) and contributors (who need to implement or modify retention behavior).

For the broader security posture, see the other documents in [`docs/security`](./). For project-level context, see [`README_PROJECT.md`](../../README_PROJECT.md).

---

## 1. Data Categories

The platform stores several categories of data, each with its own retention characteristics:

| Category | Examples | Owner | Typical lifetime |
| --- | --- | --- | --- |
| **Account data** | User profile, email, authentication credentials, preferences | User | Life of the account |
| **Asset data** | Uploaded files, generated artifacts, asset metadata | User | Life of the asset, then archival window |
| **Activity / audit data** | Access logs, audit trails, security events | Platform | Fixed retention window |
| **Operational data** | Sessions, caches, temporary uploads, job records | Platform | Short-lived, cleaned up automatically |
| **Derived data** | Thumbnails, indexes, search metadata | Platform | Tied to the source asset |

Each category is handled by the retention rules described below.

---

## 2. Active vs. Archival Records

A key distinction in this policy is between **active** and **archival** records.

- **Active records** are the live, primary copies of data that the platform serves to users. They are fully accessible, indexed, and included in normal queries and API responses.
- **Archival records** are retained copies of data that are no longer active but have not yet been permanently deleted. They are kept for a defined retention window to support recovery, compliance, and audit needs. Archival records are **not** served through normal user-facing queries and are not considered part of the active dataset.

The lifecycle of a record generally follows this progression:

```
active  ──(archive trigger)──▶  archival  ──(deletion trigger)──▶  permanently deleted
```

- **Archival** moves a record out of the active set without destroying it. This happens when a record is superseded, when an account or asset is deactivated, or when it ages past its active retention window.
- **Deletion** permanently removes a record once its archival retention window has elapsed, or when an explicit deletion is requested and the applicable grace period has passed.

Users should treat archival records as recoverable for a limited time only. Contributors should treat archival records as read-only and excluded from active queries.

---

## 3. Retention Windows

The following windows define how long each category is kept. Exact values are configured in the backend and may be tuned per deployment; the defaults are listed here for reference.

| Category | Active retention | Archival retention | Notes |
| --- | --- | --- | --- |
| **Account data** | While the account is active | Grace period after deletion request, then removed | Deletion requests start the archival window |
| **Asset data** | While the asset is active | Archival window after deactivation or supersession | Assets are removed after the archival window |
| **Activity / audit data** | Fixed window | — | Retained for security and compliance; not user-deletable |
| **Operational data** | Short-lived | — | Cleaned up automatically; no archival copy |
| **Derived data** | Tied to source | Tied to source | Removed when the source asset is removed |

> **Note:** Retention windows are enforced by scheduled cleanup jobs (see Section 5). A record may persist slightly beyond its nominal window until the next cleanup run executes.

---

## 4. Archival and Deletion Triggers

Records transition between states in response to the following triggers:

**Archival triggers**
- A user deactivates or requests deletion of an account or asset.
- An asset is superseded by a newer version.
- A record ages past its active retention window.
- An administrative action marks a record as inactive.

**Deletion triggers**
- The archival retention window for a record has elapsed.
- An explicit deletion request has passed its grace period.
- Operational data has exceeded its short-lived window.
- Derived data whose source asset has been permanently deleted.

Deletion is **permanent and irreversible**. Once a record is deleted, it cannot be recovered through the platform.

---

## 5. Backend Implementation

Retention is enforced by two components in the backend:

### `backend/src/maintenance/cleanup.ts`

This module contains the core cleanup logic. It is responsible for:

- Identifying records that have exceeded their active or archival retention windows.
- Transitioning eligible records from active to archival state.
- Permanently deleting records whose archival window has elapsed.
- Cascading deletions to derived data when a source asset is removed.

The cleanup logic is written to be idempotent and safe to run repeatedly.

### `backend/src/scripts/retention-cleanup.ts`

This is the entry point used to invoke the cleanup logic, typically on a schedule (for example, via a cron job or scheduled task). It:

- Loads the configured retention windows.
- Invokes the cleanup routines in `cleanup.ts`.
- Logs a summary of archived and deleted records for observability.

Contributors adding new data categories or changing retention windows should update the configuration consumed by these scripts and extend `cleanup.ts` with the corresponding logic. Any change to retention behavior should be reflected in this document.

---

## 6. Summary for Users

- Your **active** data is what you see and use in the platform.
- When data is no longer active, it may be moved to **archival** storage for a limited time, during which it is not shown in normal views.
- After the archival window ends, data is **permanently deleted** and cannot be recovered.
- **Audit and security logs** are retained for a fixed period for compliance and are not user-deletable.
- **Temporary and operational data** is cleaned up automatically and is never archived.

## 7. Summary for Contributors

- Retention behavior lives in `backend/src/maintenance/cleanup.ts` and is invoked by `backend/src/scripts/retention-cleanup.ts`.
- Respect the active/archival distinction: archival records must be excluded from active queries.
- Keep cleanup logic idempotent and log archival/deletion actions.
- When introducing a new data category, define its active and archival windows and document them in Section 3.

---

*Related: [`docs/security`](./), [`README_PROJECT.md`](../../README_PROJECT.md), [`docs/README.md`](../README.md)*