/**
 * certificateFilterPresets.ts
 *
 * Save/load/delete named certificate filter presets (issue #464), persisted
 * to this browser's localStorage in line with StellarVeriphy's local-only
 * storage model (see `lib/privacy/localData.ts`).
 */

import type { CertificateSearchFilters } from "@/services/certificateVerificationService";

const STORAGE_KEY = "sv_certificate_filter_presets";

export interface CertificateFilterPreset {
  id: string;
  name: string;
  createdAt: string;
  filters: CertificateSearchFilters;
}

function readPresets(): CertificateFilterPreset[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as CertificateFilterPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePresets(presets: CertificateFilterPreset[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function listFilterPresets(): CertificateFilterPreset[] {
  return readPresets();
}

export function saveFilterPreset(
  name: string,
  filters: CertificateSearchFilters
): CertificateFilterPreset {
  const preset: CertificateFilterPreset = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `preset-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    filters,
  };

  const presets = [...readPresets(), preset];
  writePresets(presets);
  return preset;
}

export function deleteFilterPreset(id: string): void {
  writePresets(readPresets().filter((preset) => preset.id !== id));
}
