"use client";

/**
 * AuthSessionContext.tsx (#783)
 *
 * Client side of the auth session lifecycle in docs/security/auth-session-refresh.md.
 * Login and renewal share one state machine, so every consumer sees the same
 * transitions:
 *
 *   signed_out ─login─▶ authenticating ─▶ active ─▶ refreshing ─▶ active
 *                            │                          │
 *                            └──────── error ◀──────────┤
 *                                                       ├─▶ expired  (SESSION_EXPIRED / SESSION_INVALID)
 *                                                       └─▶ revoked  (SESSION_REVOKED)
 *
 * Tokens are shared across tabs through localStorage. Only one refresh runs at
 * a time per tab; when another tab wins the race the server answers
 * SESSION_REFRESH_SUPERSEDED and this tab adopts the newer tokens it stored.
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "@/lib/api/client";

export type AuthSessionStatus = "signed_out" | "authenticating" | "active" | "refreshing" | "expired" | "revoked" | "error";

export interface AuthSessionInfo {
  sessionId: string;
  subject: string;
  role: "admin" | "moderator" | "user";
  state: "active" | "expired" | "revoked";
  generation: number;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  absoluteExpiresAt: string;
  refreshAfter: string;
  createdAt: string;
}

interface IssuedSession {
  session: AuthSessionInfo;
  accessToken: string;
  refreshToken: string;
}

export interface AuthSessionValue {
  status: AuthSessionStatus;
  session: AuthSessionInfo | null;
  error: ApiClientError | null;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  // Resolves to a usable access token, refreshing first if it is due. Null when signed out.
  getAccessToken: () => Promise<string | null>;
}

const STORAGE_KEY = "sv_auth_session";
const SUPERSEDED_SETTLE_MS = 300;

// Pure transition rules for a failed refresh, exported so they can be unit tested.
export function statusAfterRefreshError(error: unknown): AuthSessionStatus {
  if (!(error instanceof ApiClientError)) return "error";
  switch (error.code) {
    case "SESSION_REVOKED":
      return "revoked";
    case "SESSION_EXPIRED":
    case "SESSION_INVALID":
    case "UNAUTHENTICATED":
      return "expired";
    default:
      // Network trouble or 5xx: keep the tokens, the next attempt may succeed.
      return error.retryable ? "active" : "error";
  }
}

function readStored(): IssuedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as IssuedSession) : null;
  } catch {
    return null;
  }
}

function writeStored(value: IssuedSession | null) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode); the session still works for this tab.
  }
}

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthSessionStatus>("signed_out");
  const [error, setError] = useState<ApiClientError | null>(null);
  const tokens = useRef<IssuedSession | null>(null);
  const [session, setSession] = useState<AuthSessionInfo | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const adopt = useCallback((issued: IssuedSession | null, persist = true) => {
    tokens.current = issued;
    setSession(issued?.session ?? null);
    if (persist) writeStored(issued);
  }, []);

  const end = useCallback(
    (next: AuthSessionStatus, err: ApiClientError | null) => {
      adopt(null);
      setError(err);
      setStatus(next);
    },
    [adopt],
  );

  useEffect(() => {
    const stored = readStored();
    if (stored && Date.parse(stored.session.refreshExpiresAt) > Date.now()) {
      adopt(stored, false);
      setStatus("active");
    } else if (stored) {
      end("expired", null);
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readStored();
      adopt(next, false);
      setStatus(next ? "active" : "signed_out");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [adopt, end]);

  const runRefresh = useCallback(async () => {
    const current = tokens.current;
    if (!current) return;
    setStatus("refreshing");
    try {
      const issued = await apiRequest<IssuedSession>("/api/v1/auth/session/refresh", {
        method: "POST",
        body: { refreshToken: current.refreshToken },
      });
      adopt(issued);
      setError(null);
      setStatus("active");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "SESSION_REFRESH_SUPERSEDED") {
        // Another tab rotated the tokens; give its write a moment to land, then use them.
        await new Promise((resolve) => setTimeout(resolve, SUPERSEDED_SETTLE_MS));
        const stored = readStored();
        if (stored && stored.refreshToken !== current.refreshToken) {
          adopt(stored, false);
          setError(null);
          setStatus("active");
          return;
        }
      }
      const next = statusAfterRefreshError(err);
      const clientError = err instanceof ApiClientError ? err : null;
      if (next === "active") {
        setError(clientError);
        setStatus("active");
      } else {
        end(next, clientError);
      }
    }
  }, [adopt, end]);

  const refresh = useCallback(() => {
    inflight.current ??= runRefresh().finally(() => {
      inflight.current = null;
    });
    return inflight.current;
  }, [runRefresh]);

  // Refresh proactively at the server-advertised time rather than waiting for a 401.
  useEffect(() => {
    if (status !== "active" || !session) return;
    const delay = Math.max(Date.parse(session.refreshAfter) - Date.now(), 0);
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [status, session, refresh]);

  const login = useCallback(
    async (credential: string) => {
      setStatus("authenticating");
      setError(null);
      try {
        const issued = await apiRequest<IssuedSession>("/api/v1/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${credential}` },
        });
        adopt(issued);
        setStatus("active");
      } catch (err) {
        adopt(null);
        setError(err instanceof ApiClientError ? err : null);
        setStatus("error");
        throw err;
      }
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    const current = tokens.current;
    end("signed_out", null);
    if (!current) return;
    // Best effort: the local session is already gone even if the server call fails.
    await apiRequest("/api/v1/auth/session", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${current.accessToken}` },
    }).catch(() => undefined);
  }, [end]);

  const getAccessToken = useCallback(async () => {
    if (inflight.current) await inflight.current;
    const current = tokens.current;
    if (!current) return null;
    if (Date.parse(current.session.refreshAfter) <= Date.now()) {
      await refresh();
    }
    return tokens.current?.accessToken ?? null;
  }, [refresh]);

  const value = useMemo<AuthSessionValue>(
    () => ({ status, session, error, login, logout, refresh, getAccessToken }),
    [status, session, error, login, logout, refresh, getAccessToken],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used inside <AuthSessionProvider>");
  return value;
}
