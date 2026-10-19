/**
 * emailNotificationService.ts
 *
 * Service layer for the email notification system (Issue #460).
 *
 * Architecture
 * ------------
 *  In production this would call a backend/edge function that dispatches
 *  transactional email via a provider (e.g. Postmark, SES, Resend). For now
 *  it simulates delivery and persists subscriber preferences + a send log in
 *  `localStorage` so the UI can be fully exercised without a live backend —
 *  mirroring the mock-service pattern used by
 *  {@link "./certificateVerificationService"}.
 */

export type EmailNotificationType =
  | "verification_complete"
  | "request_status_update"
  | "certificate_update"
  | "operational_alert";

export interface EmailPreferences {
  /** Whether the subscriber has opted in to any email notifications. */
  optedIn: boolean;
  email: string;
  notifyOnVerificationComplete: boolean;
  notifyOnRequestStatusUpdate: boolean;
  notifyOnCertificateUpdates: boolean;
  notifyOnOperationalAlerts: boolean;
}

export interface SentEmailRecord {
  id: string;
  to: string;
  type: EmailNotificationType;
  subject: string;
  body: string;
  sentAt: number;
}

const PREFS_KEY = "sv_email_preferences";
const LOG_KEY = "sv_email_send_log";

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  optedIn: false,
  email: "",
  notifyOnVerificationComplete: true,
  notifyOnRequestStatusUpdate: true,
  notifyOnCertificateUpdates: true,
  notifyOnOperationalAlerts: true,
};

function delay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota exceeded) — no-op.
  }
}

/** Reads the current subscriber's email preferences. */
export function getEmailPreferences(): EmailPreferences {
  const stored = readJson<Partial<EmailPreferences>>(PREFS_KEY, {});
  return { ...DEFAULT_EMAIL_PREFERENCES, ...stored };
}

/** Persists the subscriber's email preferences (the "opt-in UI"). */
export function saveEmailPreferences(prefs: EmailPreferences): void {
  writeJson(PREFS_KEY, prefs);
}

/** Unsubscribes the current subscriber from all email notifications. */
export function unsubscribeFromEmails(): EmailPreferences {
  const next: EmailPreferences = { ...getEmailPreferences(), optedIn: false };
  saveEmailPreferences(next);
  return next;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function renderEmailTemplate(
  type: EmailNotificationType,
  vars: { certificateId?: string; status?: string }
): { subject: string; body: string } {
  switch (type) {
    case "verification_complete":
      return {
        subject: "Your certificate verification is complete",
        body: `Good news! Certificate ${vars.certificateId ?? "—"} has finished verification on StellarVeriphy. You can view the full result in your dashboard.`,
      };
    case "request_status_update":
      return {
        subject: `Request status update: ${vars.status ?? "updated"}`,
        body: `Your verification request for certificate ${vars.certificateId ?? "—"} is now "${vars.status ?? "updated"}".`,
      };
    case "certificate_update":
      return {
        subject: `Certificate update: ${vars.status ?? "updated"}`,
        body: `Certificate ${vars.certificateId ?? "—"} has an update: ${vars.status ?? "updated"}.`,
      };
    case "operational_alert":
      return {
        subject: `StellarVeriphy operational alert: ${vars.status ?? "notice"}`,
        body: vars.status ?? "There is an operational update for StellarVeriphy.",
      };
  }
}

// ---------------------------------------------------------------------------
// Sending (simulated)
// ---------------------------------------------------------------------------

export function getSentEmailLog(): SentEmailRecord[] {
  return readJson(LOG_KEY, []);
}

async function dispatch(
  to: string,
  type: EmailNotificationType,
  vars: { certificateId?: string; status?: string } = {}
): Promise<SentEmailRecord> {
  await delay();
  const { subject, body } = renderEmailTemplate(type, vars);
  const record: SentEmailRecord = {
    id: `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    to,
    type,
    subject,
    body,
    sentAt: Date.now(),
  };
  const log = [record, ...getSentEmailLog()].slice(0, 50);
  writeJson(LOG_KEY, log);
  return record;
}

/** Sends a "verification complete" notification if the subscriber opted in. */
export async function sendVerificationCompleteEmail(
  certificateId: string
): Promise<SentEmailRecord | null> {
  const prefs = getEmailPreferences();
  if (!prefs.optedIn || !prefs.notifyOnVerificationComplete || !prefs.email) return null;
  return dispatch(prefs.email, "verification_complete", { certificateId });
}

/** Sends a "request status update" notification if the subscriber opted in. */
export async function sendRequestStatusUpdateEmail(
  certificateId: string,
  status: string
): Promise<SentEmailRecord | null> {
  const prefs = getEmailPreferences();
  if (!prefs.optedIn || !prefs.notifyOnRequestStatusUpdate || !prefs.email) return null;
  return dispatch(prefs.email, "request_status_update", { certificateId, status });
}

/** Sends a certificate update when the subscriber has enabled that category. */
export async function sendCertificateUpdateEmail(
  certificateId: string,
  update: string
): Promise<SentEmailRecord | null> {
  const prefs = getEmailPreferences();
  if (!prefs.optedIn || !prefs.notifyOnCertificateUpdates || !prefs.email) return null;
  return dispatch(prefs.email, "certificate_update", { certificateId, status: update });
}

/** Sends an operational alert when the subscriber has enabled that category. */
export async function sendOperationalAlertEmail(
  alert: string
): Promise<SentEmailRecord | null> {
  const prefs = getEmailPreferences();
  if (!prefs.optedIn || !prefs.notifyOnOperationalAlerts || !prefs.email) return null;
  return dispatch(prefs.email, "operational_alert", { status: alert });
}

/** Sends a one-off test email to verify delivery, ignoring opt-in preferences. */
export async function sendTestEmail(email: string): Promise<SentEmailRecord> {
  if (!email) throw new Error("An email address is required to send a test email.");
  return dispatch(email, "verification_complete", { certificateId: "TEST-0000" });
}
