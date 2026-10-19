"use client";

/**
 * CertificateFilterPanel.tsx
 *
 * Advanced filtering UI for the certificate explorer (issue #464):
 * creator, status, verification level, and date-range filters, plus
 * named filter presets saved to localStorage.
 */

import { useEffect, useState } from "react";

import {
  type CertificateFilterPreset,
  deleteFilterPreset,
  listFilterPresets,
  saveFilterPreset,
} from "@/lib/certificateFilterPresets";
import type { CertificateSearchFilters } from "@/services/certificateVerificationService";

const STATUS_OPTIONS = ["Active", "Revoked", "Expired", "Locked"];
const LEVEL_OPTIONS = ["Basic", "Standard"];

interface CertificateFilterPanelProps {
  filters: CertificateSearchFilters;
  onChange: (filters: CertificateSearchFilters) => void;
}

function toDateInputValue(unixSeconds?: number): string {
  if (!unixSeconds) return "";
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  return Math.floor(new Date(value).getTime() / 1000);
}

export function CertificateFilterPanel({ filters, onChange }: CertificateFilterPanelProps) {
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<CertificateFilterPreset[]>([]);

  useEffect(() => {
    setPresets(listFilterPresets());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const update = (patch: Partial<CertificateSearchFilters>) => {
    onChange({ ...filters, ...patch, offset: 0 });
  };

  const handleReset = () => onChange({ offset: 0, limit: filters.limit ?? 10 });

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    saveFilterPreset(presetName.trim(), filters);
    setPresets(listFilterPresets());
    setPresetName("");
  };

  const handleDeletePreset = (id: string) => {
    deleteFilterPreset(id);
    setPresets(listFilterPresets());
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6">
      <div className="mb-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <h2 className="text-lg font-semibold text-white">Filters</h2>
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          <kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1">
            Esc
          </kbd>
          <span>to reset</span>
          <span>•</span>
          <kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1">
            Tab
          </kbd>
          <span>to navigate</span>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Creator address
          <input
            type="text"
            value={filters.creator ?? ""}
            onChange={(e) => update({ creator: e.target.value || undefined })}
            placeholder="Filter by creator address (e.g., GXYZ...)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Status
          <select
            value={filters.status ?? ""}
            onChange={(e) => update({ status: e.target.value || undefined })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Verification level
          <select
            value={filters.verificationLevel ?? ""}
            onChange={(e) => update({ verificationLevel: e.target.value || undefined })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          >
            <option value="">All levels</option>
            {LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          From date
          <input
            type="date"
            value={toDateInputValue(filters.startTime)}
            onChange={(e) => update({ startTime: fromDateInputValue(e.target.value) })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-300">
          To date
          <input
            type="date"
            value={toDateInputValue(filters.endTime)}
            onChange={(e) => update({ endTime: fromDateInputValue(e.target.value) })}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleReset}
          aria-label="Reset all filters (Esc)"
          title="Press Esc to reset filters"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
        >
          Reset filters
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="e.g., Verified-2024, Pending-Review"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
          >
            Save preset
          </button>
        </div>
      </div>

      {presets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-slate-200"
            >
              <button type="button" onClick={() => onChange({ ...preset.filters, offset: 0 })}>
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => handleDeletePreset(preset.id)}
                aria-label={`Delete preset ${preset.name}`}
                className="text-slate-500 hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
