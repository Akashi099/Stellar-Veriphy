"use client";

/**
 * usePreferencesStore.ts — Zustand user preferences store (Issue #462)
 *
 * Centralizes user-customizable application settings that are not already
 * covered by a dedicated store (theme lives here too so it can participate
 * in the "sync across devices" flow, but {@link "../components/ThemeProvider"}
 * remains the source of truth for applying the theme to the DOM).
 *
 * Persistence
 * ───────────
 * All fields persist to `localStorage` under the key `sv_user_preferences`
 * via zustand's `persist` middleware.
 *
 * Sync across devices
 * ────────────────────
 * `syncAcrossDevices` is a user-facing toggle. When enabled, {@link syncNow}
 * would push/pull preferences to a backend profile; today it is stubbed
 * (simulated round-trip) since no such backend endpoint exists yet.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePreference = "light" | "dark" | "system";
export type DefaultView = "list" | "gallery" | "timeline";

export interface UserPreferences {
  theme: ThemePreference;
  language: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
  defaultView: DefaultView;
  syncAcrossDevices: boolean;
}

interface PreferencesState extends UserPreferences {
  setPreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  resetPreferences: () => void;
  /** Simulated round-trip that would push/pull preferences from a backend profile. */
  syncNow: () => Promise<void>;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  language: "en",
  emailNotifications: true,
  pushNotifications: false,
  defaultView: "list",
  syncAcrossDevices: false,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,

      setPreference: (key, value) => set({ [key]: value } as Partial<PreferencesState>),

      resetPreferences: () => set({ ...DEFAULT_PREFERENCES }),

      syncNow: async () => {
        if (!get().syncAcrossDevices) return;
        // Simulated network round-trip; a real backend profile sync would
        // POST the current preferences and merge the server's response.
        await new Promise((resolve) => setTimeout(resolve, 400));
      },
    }),
    { name: "sv_user_preferences" }
  )
);

/** Convenience hook for reading a single preference without extra re-renders. */
export function usePreference<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
  return usePreferencesStore((s) => s[key]);
}
