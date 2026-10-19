"use client";

/**
 * EmailNotificationSettings.tsx
 *
 * Opt-in UI for the email notification system (Issue #460).
 *
 * Features:
 * - Opt-in toggle + email address capture
 * - Per-event preferences for verification, certificate, and operational updates
 * - Unsubscribe action
 * - "Send test email" button to verify delivery
 */

import { useEffect, useState } from "react";

import { useToastHelpers } from "@/components/ToastProvider";
import {
  type EmailPreferences,
  getEmailPreferences,
  saveEmailPreferences,
  sendTestEmail,
  unsubscribeFromEmails,
} from "@/services/emailNotificationService";

export interface EmailNotificationSettingsProps {
  className?: string;
}

export function EmailNotificationSettings({ className = "" }: EmailNotificationSettingsProps) {
  const toast = useToastHelpers();
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    setPrefs(getEmailPreferences());
  }, []);

  if (!prefs) return null;

  const update = (patch: Partial<EmailPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveEmailPreferences(next);
  };

  const handleUnsubscribe = () => {
    setPrefs(unsubscribeFromEmails());
    toast.success("You have been unsubscribed from email notifications.");
  };

  const handleSendTest = async () => {
    if (!prefs.email) {
      toast.error("Enter an email address first.");
      return;
    }
    setSendingTest(true);
    try {
      await sendTestEmail(prefs.email);
      toast.success(`Test email sent to ${prefs.email}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test email.");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Email notifications</h3>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Choose which updates reach your inbox. Your choices are saved on this device.
      </p>

      <label className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={prefs.optedIn}
          onChange={(e) => update({ optedIn: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          Opt in to email notifications
        </span>
      </label>

      <div className="mt-4">
        <label
          htmlFor="email-notif-address"
          className="block text-sm text-gray-700 dark:text-gray-300"
        >
          Email address
        </label>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          We&apos;ll use this email to notify you when verifications complete or request statuses
          change. Your email is kept private and never shared.
        </p>
        <input
          id="email-notif-address"
          type="email"
          value={prefs.email}
          onChange={(e) => update({ email: e.target.value })}
          placeholder="you@example.com"
          disabled={!prefs.optedIn}
          className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>

      <fieldset className="mt-5 space-y-4" disabled={!prefs.optedIn}>
        <legend className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
          Event preferences
        </legend>
        <div className="space-y-3 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Verification status</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.notifyOnVerificationComplete}
              onChange={(e) => update({ notifyOnVerificationComplete: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Verification complete</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.notifyOnRequestStatusUpdate}
              onChange={(e) => update({ notifyOnRequestStatusUpdate: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Request status updates</span>
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyOnCertificateUpdates}
            onChange={(e) => update({ notifyOnCertificateUpdates: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Certificate updates</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.notifyOnOperationalAlerts}
            onChange={(e) => update({ notifyOnOperationalAlerts: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Operational alerts</span>
        </label>
      </fieldset>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={handleSendTest}
          disabled={!prefs.optedIn || sendingTest}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary/90"
        >
          {sendingTest ? "Sending…" : "Send test email"}
        </button>
        <button
          onClick={handleUnsubscribe}
          disabled={!prefs.optedIn}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 ring-1 ring-gray-300 disabled:opacity-50 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-800"
        >
          Unsubscribe
        </button>
      </div>
    </div>
  );
}

export default EmailNotificationSettings;
