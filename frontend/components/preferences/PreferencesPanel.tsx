"use client";

/**
 * PreferencesPanel.tsx
 *
 * UI for the user preferences system (Issue #462): theme, language,
 * notification, and default-view preferences, plus a "sync across devices"
 * toggle backed by {@link usePreferencesStore}.
 */

import { useToastHelpers } from "@/components/ToastProvider";
import {
  type DefaultView,
  type ThemePreference,
  usePreferencesStore,
} from "@/store/usePreferencesStore";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
];

export interface PreferencesPanelProps {
  className?: string;
}

export function PreferencesPanel({ className = "" }: PreferencesPanelProps) {
  const toast = useToastHelpers();
  const prefs = usePreferencesStore();

  const handleSync = async () => {
    await prefs.syncNow();
    toast.success("Preferences synced across your devices.");
  };

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Preferences</h3>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pref-theme" className="block text-sm text-gray-700 dark:text-gray-300">
            Theme
          </label>
          <select
            id="pref-theme"
            value={prefs.theme}
            onChange={(e) => prefs.setPreference("theme", e.target.value as ThemePreference)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div>
          <label htmlFor="pref-language" className="block text-sm text-gray-700 dark:text-gray-300">
            Language
          </label>
          <select
            id="pref-language"
            value={prefs.language}
            onChange={(e) => prefs.setPreference("language", e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="pref-default-view"
            className="block text-sm text-gray-700 dark:text-gray-300"
          >
            Default view
          </label>
          <select
            id="pref-default-view"
            value={prefs.defaultView}
            onChange={(e) => prefs.setPreference("defaultView", e.target.value as DefaultView)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          >
            <option value="list">List</option>
            <option value="gallery">Gallery</option>
            <option value="timeline">Timeline</option>
          </select>
        </div>
      </div>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm text-gray-700 dark:text-gray-300">Notifications</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.emailNotifications}
            onChange={(e) => prefs.setPreference("emailNotifications", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Email notifications</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={prefs.pushNotifications}
            onChange={(e) => prefs.setPreference("pushNotifications", e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Push notifications</span>
        </label>
      </fieldset>

      <div className="mt-4 flex items-center justify-between rounded-md bg-gray-50 p-3 dark:bg-gray-800/60">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Sync across devices
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Keep these preferences in sync wherever you sign in.
          </p>
        </div>
        <input
          type="checkbox"
          checked={prefs.syncAcrossDevices}
          onChange={(e) => prefs.setPreference("syncAcrossDevices", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={handleSync}
          disabled={!prefs.syncAcrossDevices}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-primary/90"
        >
          Sync now
        </button>
        <button
          onClick={() => {
            prefs.resetPreferences();
            toast.info("Preferences reset to defaults.");
          }}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-800"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

export default PreferencesPanel;
