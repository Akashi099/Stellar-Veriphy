import { NextResponse } from "next/server";

/** Never inject the backend admin token. Cancellation forwards only caller authentication. */
export async function verificationProxy(request: Request, jobId: string, cancel = false) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const base = process.env.VERIFICATION_BACKEND_URL ?? "http://localhost:4000";
  const headers: Record<string, string> = { accept: "application/json" };
  if (request.headers.has("authorization")) headers.authorization = request.headers.get("authorization")!;
  try {
    const response = await fetch(base.replace(/\/+$/, "") + "/api/verifications/" + encodeURIComponent(jobId) + (cancel ? "/cancel" : ""), {
      method: cancel ? "POST" : "GET", headers, cache: "no-store", signal: AbortSignal.timeout(10_000), redirect: "error",
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "PROVIDER_UNAVAILABLE", error: "Verification service is unavailable" }, { status: 503 });
  }
}
