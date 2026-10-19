export const REQUEST_ID_HEADER = "X-Request-Id";

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

// Reuses an upstream request id (load balancer, client) when it looks safe to
// echo, otherwise mints a new one.
export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  if (incoming && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return globalThis.crypto.randomUUID();
}
