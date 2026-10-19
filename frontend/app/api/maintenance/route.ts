import { NextResponse } from "next/server";

/**
 * Maintenance status for the banner (#787).
 *
 * Proxies the backend's `GET /api/status/maintenance` so the flag can be toggled at runtime
 * (no frontend rebuild). If the backend can't be reached we report `enabled: false` rather
 * than guessing; `NEXT_PUBLIC_MAINTENANCE_MODE=true` is a static fallback for windows where
 * the backend itself is offline.
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";
const TIMEOUT_MS = 2_000;

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true") {
    return NextResponse.json(
      {
        enabled: true,
        message: process.env.NEXT_PUBLIC_MAINTENANCE_MESSAGE ?? null,
        source: "static",
      },
      { headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const res = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/api/status/maintenance`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      enabled?: boolean;
      message?: string;
      startedAt?: string;
      endsAt?: string;
    };
    return NextResponse.json(
      body.enabled
        ? {
            enabled: true,
            message: body.message ?? null,
            startedAt: body.startedAt ?? null,
            endsAt: body.endsAt ?? null,
          }
        : { enabled: false },
      { headers: { "cache-control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { enabled: false, unavailable: true },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
