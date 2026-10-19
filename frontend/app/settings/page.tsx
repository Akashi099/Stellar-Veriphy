"use client";

/**
 * Settings Page — Issues #460, #462, #466, #467
 *
 * #460, #462: User preferences and email notification settings
 * #466 "Mobile app version": StellarVeriphy ships as an installable PWA
 * rather than a native app (see PWA_SETUP_GUIDE.md) — this page surfaces
 * install status, push notification opt-in, and offline cache controls.
 * #467 "Backup and export": categorized JSON export/import of this
 * browser's local data, with an optional passphrase-encrypted backup.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Header } from "@/components/Header";
import { EmailNotificationSettings } from "@/components/notifications";
import { PreferencesPanel } from "@/components/preferences";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { usePWA } from "@/hooks/usePWA";
import {
  type BackupCategory,
  createBackup,
  downloadBackup,
  importBackup,
} from "@/lib/privacy/backup";
import {
  clearAllCaches,
  getCacheSize,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from "@/lib/pwa";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const CATEGORY_OPTIONS: { value: BackupCategory; label: string }[] = [
  { value: "certificates", label: "Certificates & verification records" },
  { value: "drafts", label: "Manifest drafts" },
  { value: "settings", label: "Settings & preferences" },
  { value: "auditLog", label: "Audit log" },
  { value: "apiKeys", label: "API keys" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export default function SettingsPage() {
  const { isInstalled, registration } = usePWA();
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [cacheSize, setCacheSize] = useState<number | null>(null);

  const [selectedCategories, setSelectedCategories] = useState<BackupCategory[]>([]);
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (registration) {
      void registration.pushManager
        .getSubscription()
        .then((sub) => setPushSubscribed(Boolean(sub)));
    }
  }, [registration]);

  const refreshCacheSize = useCallback(() => {
    void getCacheSize().then(setCacheSize);
  }, []);

  useEffect(() => {
    refreshCacheSize();
  }, [refreshCacheSize]);

  const togglePush = async () => {
    if (!registration) return;
    if (pushSubscribed) {
      await unsubscribeFromPushNotifications();
      setPushSubscribed(false);
    } else {
      if (!VAPID_PUBLIC_KEY) {
        setStatusMessage("Push notifications are not configured for this deployment.");
        return;
      }
      const sub = await subscribeToPushNotifications(registration, VAPID_PUBLIC_KEY);
      setPushSubscribed(Boolean(sub));
    }
  };

  const handleClearCache = async () => {
    await clearAllCaches();
    refreshCacheSize();
  };

  const toggleCategory = (category: BackupCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const handleExport = async () => {
    if (encrypt && !passphrase) {
      setStatusMessage("Enter a passphrase to create an encrypted backup.");
      return;
    }
    const json = await createBackup({
      ...(selectedCategories.length > 0 && { categories: selectedCategories }),
      ...(encrypt && { passphrase }),
    });
    downloadBackup(json);
    setStatusMessage("Backup downloaded.");
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const { importedKeys } = await importBackup(text, importPassphrase || undefined);
      setStatusMessage(
        `Imported ${importedKeys} item(s) from backup. Reload the app to see changes.`
      );
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to import backup.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <Header />
      <div className="mx-auto max-w-4xl px-6">
        <Breadcrumbs variant="dark" />
      </div>
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold">App Settings</h1>
          <p className="max-w-3xl text-lg text-slate-300">
            Manage your preferences and notifications, install StellarVeriphy on your device, manage
            offline storage, and back up your locally stored data.
          </p>
        </div>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-2xl font-semibold text-white">Preferences</h2>
          <PreferencesPanel />
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-2xl font-semibold text-white">Email notifications</h2>
          <EmailNotificationSettings />
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-2xl font-semibold text-white">App &amp; notifications</h2>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <p className="font-medium text-slate-100">Install status</p>
              <p className="text-sm text-slate-400">
                {isInstalled
                  ? "Installed — you're running the app in standalone mode."
                  : 'Not installed. Use your browser\'s "Install app" / "Add to Home Screen" option.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <p className="font-medium text-slate-100">Push notifications</p>
              <p className="text-sm text-slate-400">
                Get notified about verification and transaction status changes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void togglePush()}
              disabled={!registration}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              {pushSubscribed ? "Disable" : "Enable"}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-100">Offline cache</p>
              <p className="text-sm text-slate-400">
                {cacheSize === null
                  ? "Calculating…"
                  : `${formatBytes(cacheSize)} cached for offline use`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleClearCache()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              Clear cache
            </button>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
          <h2 className="text-2xl font-semibold text-white">Backup &amp; export</h2>
          <p className="text-sm text-slate-400">
            Choose which categories to export (leave empty to export everything), then optionally
            encrypt the backup with a passphrase before downloading.
          </p>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-sm text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(opt.value)}
                  onChange={() => toggleCategory(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={encrypt}
                onChange={(e) => setEncrypt(e.target.checked)}
              />
              Encrypt backup
            </label>
            {encrypt && (
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Passphrase"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
              />
            )}
            <button
              type="button"
              onClick={() => void handleExport()}
              className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Export backup
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
            <input
              type="password"
              value={importPassphrase}
              onChange={(e) => setImportPassphrase(e.target.value)}
              placeholder="Passphrase (if encrypted)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImport(file);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-sm text-slate-300"
            />
          </div>

          {statusMessage && (
            <p className="text-sm text-emerald-400" role="status">
              {statusMessage}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
