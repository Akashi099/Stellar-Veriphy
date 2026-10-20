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

export type AuthRole = AuthSessionInfo["role"];

export interface AuthSessionValue {
  status: AuthSessionStatus;
  session: AuthSessionInfo | null;
  error: ApiClientError | null;
  // Role of the current actor, or null when there is no usable session.
  role: AuthRole | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  // True once the persisted session has been read and validated on mount.
  hydrated: boolean;
  // Set when the browser refused to persist or read the session (private mode, quota, corrupt data).
  persistenceError: string | null;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  // Resolves to a usable access token, refreshing first if it is due. Null when signed out.
  getAccessToken: () => Promise<string | null>;
}

// Must match the cookie/storage contract in lib/server/auth.ts so middleware and the client agree.
const STORAGE_KEY = "sv_auth_session";
const SUPERSEDED_SETTLE_MS = 300;
const PERSISTENCE_ERROR_MESSAGE = "Your session could not be saved in this browser. You may be signed out after a reload.";
const CORRUPT_SESSION_MESSAGE = "Your saved session could not be read and was cleared. Please sign in again.";

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

type ReadResult = { session: IssuedSession | null; error: string | null };

function isIssuedSession(value: unknown): value is IssuedSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IssuedSession>;
  const session = candidate.session as Partial<AuthSessionInfo> | undefined;
  return (
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string" &&
    !!session &&
    typeof session.sessionId === "string" &&
    typeof session.subject === "string" &&
    typeof session.refreshExpiresAt === "string" &&
    typeof session.refreshAfter === "string"
  );
}

function readStored(): ReadResult {
  if (typeof window === "undefined") return { session: null, error: null };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { session: null, error: PERSISTENCE_ERROR_MESSAGE };
  }
  if (!raw) return { session: null, error: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isIssuedSession(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return { session: null, error: CORRUPT_SESSION_MESSAGE };
    }
    return { session: parsed, error: null };
  } catch {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: the corrupt value is unusable either way.
    }
    return { session: null, error: CORRUPT_SESSION_MESSAGE };
  }
}

function writeStored(value: IssuedSession | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    // Storage unavailable (private mode, quota); the session still works for this tab.
    return PERSISTENCE_ERROR_MESSAGE;
  }
}

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  // Read the persisted session synchronously so the first render already reflects it (no flicker/reset).
  const initial = useMemo(() => readStored(), []);
  const initialValid = !!initial.session && Date.parse(initial.session.session.refreshExpiresAt) > Date.now();

  const [status, setStatus] = useState<AuthSessionStatus>(() => {
    if (initialValid) return "active";
    if (initial.session) return "expired";
    return "signed_out";
  });
  const [error, setError] = useState<ApiClientError | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(initial.error);
  const tokens = useRef<IssuedSession | null>(initialValid ? initial.session : null);
  const [session, setSession] = useState<AuthSessionInfo | null>(initialValid ? initial.session!.session : null);
  const [hydrated, setHydrated] = useState(false);
  const inflight = useRef<Promise<void> | null>(null);

  const adopt = useCallback((issued: IssuedSession | null, persist = true) => {
    tokens.current = issued;
    setSession(issued?.session ?? null);
    if (persist) setPersistenceError(writeStored(issued));
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
    // Validate the stored session once on mount; surface failures through the error field.
    const stored = readStored();
    if (stored.error) setPersistenceError(stored.error);
    if (stored.session && Date.parse(stored.session.refreshExpiresAt) > Date.now()) {
      adopt(stored.session, false);
      setStatus("active");
    } else if (stored.session) {
      end("expired", null);
    } else if (initial.session) {
      // The value we hydrated from is no longer valid (e.g. cleared by another tab).
      end("signed_out", null);
    }
    setHydrated(true);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const next = readStored();
      if (next.error) setPersistenceError(next.error);
      if (next.session && Date.parse(next.session.refreshExpiresAt) > Date.now()) {
        adopt(next.session, false);
        setError(null);
        setStatus("active");
      } else {
        adopt(null, false);
        setStatus("signed_out");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        if (stored.error) setPersistenceError(stored.error);
        if (stored.session && stored.session.refreshToken !== current.refreshToken) {
          adopt(stored.session, false);
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

  const isAuthenticated = status === "active" || status === "refreshing";
  const role = isAuthenticated ? (session?.role ?? null) : null;

  const value = useMemo<AuthSessionValue>(
    () => ({
      status,
      session,
      error,
      role,
      isAuthenticated,
      isAdmin: role === "admin",
      login,
      logout,
      refresh,
      getAccessToken,
    }),
    [status, session, error, role, isAuthenticated, login, logout, refresh, getAccessToken],
    () => ({ status, session, error, hydrated, persistenceError, login, logout, refresh, getAccessToken }),
    [status, session, error, hydrated, persistenceError, login, logout, refresh, getAccessToken],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionValue {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used inside <AuthSessionProvider>");
  return value;
}
