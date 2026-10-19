/**
 * backup.ts
 *
 * Categorized backup, encrypted export, and import for this browser's
 * local data (issue #467). Builds on `localData.ts`'s full export/erasure
 * helpers, scoped to StellarVeriphy's local-only storage model: there is
 * no server-side database, so "certificates" and "manifests" here mean
 * the locally cached records about them (recent lookups, verification
 * history, drafts) — the certificates themselves live on the Stellar
 * ledger and are exported from `/certificates` instead.
 */

import { readAllLocalData } from "./localData";

export type BackupCategory = "settings" | "drafts" | "certificates" | "auditLog" | "apiKeys";

const CATEGORY_KEY_PATTERNS: Record<BackupCategory, RegExp> = {
  settings:
    /^(theme|stellarproof-theme|sv-keyboard-shortcuts|sv-onboarding-completed|sv-tutorial-seen|stellar-veriphy-notification|sv_consent_ack)/i,
  drafts: /^(autosave|draft|manifest)/i,
  certificates: /^(sv_recent_searches|sv_verification_history|sv_certificate_filter_presets)/i,
  auditLog: /^sv_audit_events/i,
  apiKeys: /^sv_api_keys/i,
};

export function categorizeKey(key: string): BackupCategory | "other" {
  for (const [category, pattern] of Object.entries(CATEGORY_KEY_PATTERNS) as [
    BackupCategory,
    RegExp,
  ][]) {
    if (pattern.test(key)) return category;
  }
  return "other";
}

export function readDataByCategories(categories: BackupCategory[]): Record<string, unknown> {
  const all = readAllLocalData();
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) {
    if (categories.includes(categorizeKey(key) as BackupCategory)) {
      result[key] = value;
    }
  }
  return result;
}

interface BackupPayload {
  version: 1;
  exportedAt: string;
  origin: string;
  categories: BackupCategory[] | "all";
  encrypted: boolean;
  data?: Record<string, unknown>;
  salt?: string;
  iv?: string;
  ciphertext?: string;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: 150_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Builds a backup JSON string, optionally scoped to categories and/or
 * encrypted with a passphrase (AES-GCM, PBKDF2-derived key).
 */
export async function createBackup(options: {
  categories?: BackupCategory[];
  passphrase?: string;
}): Promise<string> {
  const data = options.categories ? readDataByCategories(options.categories) : readAllLocalData();

  const base: Omit<BackupPayload, "encrypted"> = {
    version: 1,
    exportedAt: new Date().toISOString(),
    origin: typeof window !== "undefined" ? window.location.origin : "",
    categories: options.categories ?? "all",
  };

  if (!options.passphrase) {
    const payload: BackupPayload = { ...base, encrypted: false, data };
    return JSON.stringify(payload, null, 2);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(options.passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded as BufferSource
  );

  const payload: BackupPayload = {
    ...base,
    encrypted: true,
    salt: bufferToBase64(salt.buffer),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext),
  };
  return JSON.stringify(payload, null, 2);
}

export function downloadBackup(
  json: string,
  filename = `stellarveriphy-backup-${Date.now()}.json`
): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Restores a backup file into localStorage. Existing keys are overwritten;
 * keys not present in the backup are left untouched.
 */
export async function importBackup(
  json: string,
  passphrase?: string
): Promise<{ importedKeys: number }> {
  const payload = JSON.parse(json) as BackupPayload;

  let data: Record<string, unknown>;
  if (payload.encrypted) {
    if (!passphrase) throw new Error("This backup is encrypted — a passphrase is required.");
    if (!payload.salt || !payload.iv || !payload.ciphertext) {
      throw new Error("Malformed encrypted backup file.");
    }
    const salt = new Uint8Array(base64ToBuffer(payload.salt));
    const iv = new Uint8Array(base64ToBuffer(payload.iv));
    const key = await deriveKey(passphrase, salt);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        base64ToBuffer(payload.ciphertext)
      );
      data = JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      throw new Error("Failed to decrypt backup — wrong passphrase or corrupted file.");
    }
  } else {
    data = payload.data ?? {};
  }

  for (const [key, value] of Object.entries(data)) {
    window.localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  return { importedKeys: Object.keys(data).length };
}
