"use client";

/**
 * ApiTokenManager (#670)
 *
 * Admin UI for the server-side API token lifecycle: issue, rotate (with a
 * grace window), and revoke tokens segmented by product surface. Plaintext
 * secrets are displayed exactly once, immediately after issue/rotate.
 */

import {
  API_TOKEN_SURFACES,
  type ApiTokenScope,
  type ApiTokenStatus,
  type ApiTokenSurface,
  DEFAULT_ROTATION_GRACE_HOURS,
  type PublicApiToken,
  SURFACE_ALLOWED_SCOPES,
  SURFACE_TTL_DAYS,
} from "@stellarveriphy/shared";
import { useCallback, useEffect, useMemo, useState } from "react";

import { type MessageKey,t } from "@/lib/i18n";

const ADMIN_TOKEN_KEY = "sv_admin_api_token";

const STATUS_LABEL_KEYS: Record<ApiTokenStatus, MessageKey> = {
  active: "admin.tokens.status.active",
  expiring: "admin.tokens.status.expiring",
  rotating: "admin.tokens.status.rotating",
  expired: "admin.tokens.status.expired",
  revoked: "admin.tokens.status.revoked",
};

const STATUS_STYLES: Record<ApiTokenStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  expiring: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  rotating: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  expired: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
  revoked: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

function readAdminToken(): string {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function formatDate(iso?: string) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function ApiTokenManager() {
  const [adminToken, setAdminToken] = useState("");
  const [tokens, setTokens] = useState<PublicApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; secret: string } | null>(null);

  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [surface, setSurface] = useState<ApiTokenSurface>("sdk");
  const [scopes, setScopes] = useState<ApiTokenScope[]>([]);
  const [ttlDays, setTtlDays] = useState<number>(SURFACE_TTL_DAYS.sdk.default);

  useEffect(() => setAdminToken(readAdminToken()), []);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (adminToken) h.Authorization = `Bearer ${adminToken}`;
    return h;
  }, [adminToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tokens", { headers, cache: "no-store" });
      const data = await res.json();
      if (data.success) setTokens(data.data);
      else setError(data.error ?? t("admin.tokens.error.load"));
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveAdminToken = (value: string) => {
    setAdminToken(value);
    try {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, value);
    } catch {
      // Session storage unavailable — token stays in memory only.
    }
  };

  const changeSurface = (next: ApiTokenSurface) => {
    setSurface(next);
    setScopes((prev) => prev.filter((s) => SURFACE_ALLOWED_SCOPES[next].includes(s)));
    setTtlDays(SURFACE_TTL_DAYS[next].default);
  };

  const toggleScope = (scope: ApiTokenScope) =>
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  const mutate = async (url: string, init: RequestInit) => {
    setError(null);
    const res = await fetch(url, { ...init, headers });
    const data = await res.json();
    if (!data.success) {
      setError(data.error ?? t("admin.common.requestFailed"));
      return null;
    }
    await load();
    return data.data;
  };

  const issue = async () => {
    const data = await mutate("/api/tokens", {
      method: "POST",
      body: JSON.stringify({ name, owner: owner || undefined, surface, scopes, ttlDays }),
    });
    if (data) {
      setRevealed({ id: data.token.id, secret: data.secret });
      setName("");
      setScopes([]);
    }
  };

  const rotate = async (id: string, compromised = false) => {
    const data = await mutate(`/api/tokens/${id}/rotate`, {
      method: "POST",
      body: JSON.stringify({ graceHours: compromised ? 0 : DEFAULT_ROTATION_GRACE_HOURS }),
    });
    if (data) setRevealed({ id: data.token.id, secret: data.secret });
  };

  const revoke = async (id: string, reason: "user_requested" | "compromised") => {
    await mutate(`/api/tokens/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) });
  };

  const inputClass =
    "w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
        <label htmlFor="admin-token" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t("admin.tokens.adminToken.label")}
        </label>
        <input
          id="admin-token"
          type="password"
          autoComplete="off"
          value={adminToken}
          onChange={(e) => saveAdminToken(e.target.value)}
          placeholder="svk_admin_…"
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("admin.tokens.adminToken.help")}
        </p>
      </section>

      {revealed && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t("admin.tokens.reveal.copyNow")}
          </p>
          <code className="block break-all rounded bg-white dark:bg-gray-900 p-2 text-xs font-mono text-gray-900 dark:text-gray-100">
            {revealed.secret}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(revealed.secret)}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
            >
              {t("admin.tokens.reveal.copy")}
            </button>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200"
            >
              {t("admin.tokens.reveal.stored")}
            </button>
          </div>
        </div>
      )}

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t("admin.tokens.issue.heading")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="tok-name" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t("admin.tokens.issue.name")}</label>
            <input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="CI export job" />
          </div>
          <div>
            <label htmlFor="tok-owner" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t("admin.tokens.issue.owner")}</label>
            <input id="tok-owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass} placeholder="G… or svc-name" />
          </div>
          <div>
            <label htmlFor="tok-surface" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t("admin.tokens.issue.surface")}</label>
            <select id="tok-surface" value={surface} onChange={(e) => changeSurface(e.target.value as ApiTokenSurface)} className={inputClass}>
              {API_TOKEN_SURFACES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="tok-ttl" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
              {t("admin.tokens.issue.lifetime", { max: SURFACE_TTL_DAYS[surface].max })}
            </label>
            <input
              id="tok-ttl"
              type="number"
              min={1}
              max={SURFACE_TTL_DAYS[surface].max}
              value={ttlDays}
              onChange={(e) => setTtlDays(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <fieldset>
          <legend className="text-sm text-gray-700 dark:text-gray-300 mb-2">{t("admin.tokens.issue.scopes", { surface })}</legend>
          <div className="flex flex-wrap gap-2">
            {SURFACE_ALLOWED_SCOPES[surface].map((scope) => (
              <label key={scope} className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                {scope}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={() => void issue()}
          disabled={scopes.length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {t("admin.tokens.issue.submit")}
        </button>
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-4 py-2">{t("admin.tokens.table.token")}</th>
              <th className="px-4 py-2">{t("admin.tokens.table.surfaceScopes")}</th>
              <th className="px-4 py-2">{t("admin.tokens.table.status")}</th>
              <th className="px-4 py-2">{t("admin.tokens.table.expires")}</th>
              <th className="px-4 py-2">{t("admin.tokens.table.lastUsed")}</th>
              <th className="px-4 py-2 sr-only">{t("admin.tokens.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading && tokens.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t("admin.common.loading")}</td></tr>
            )}
            {!loading && tokens.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">{t("admin.tokens.table.empty")}</td></tr>
            )}
            {tokens.map((token) => {
              const live = token.status === "active" || token.status === "expiring";
              return (
                <tr key={token.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{token.name}</p>
                    <p className="font-mono text-xs text-gray-500">{token.displayPrefix}</p>
                    <p className="text-xs text-gray-400">{token.owner}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-900 dark:text-gray-100">{token.surface}</p>
                    <p className="text-xs text-gray-500">{token.scopes.join(", ")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[token.status]}`}>
                      {t(STATUS_LABEL_KEYS[token.status])}
                    </span>
                    {token.status === "rotating" && (
                      <p className="mt-1 text-xs text-gray-500">{t("admin.tokens.table.graceUntil", { date: formatDate(token.graceUntil) })}</p>
                    )}
                    {token.revocationReason && <p className="mt-1 text-xs text-gray-500">{token.revocationReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{formatDate(token.expiresAt)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{formatDate(token.lastUsedAt)}</td>
                  <td className="px-4 py-3">
                    {live && (
                      <div className="flex flex-col gap-1">
                        <button type="button" onClick={() => void rotate(token.id)} className="text-xs text-blue-600 hover:underline text-left">
                          {t("admin.tokens.action.rotate", { hours: DEFAULT_ROTATION_GRACE_HOURS })}
                        </button>
                        <button type="button" onClick={() => void revoke(token.id, "user_requested")} className="text-xs text-gray-600 dark:text-gray-300 hover:underline text-left">
                          {t("admin.tokens.action.revoke")}
                        </button>
                        <button type="button" onClick={() => void rotate(token.id, true)} className="text-xs text-red-600 hover:underline text-left">
                          {t("admin.tokens.action.rotateCompromised")}
                        </button>
                      </div>
                    )}
                    {token.status === "rotating" && (
                      <button type="button" onClick={() => void revoke(token.id, "compromised")} className="text-xs text-red-600 hover:underline text-left">
                        {t("admin.tokens.action.endGrace")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
