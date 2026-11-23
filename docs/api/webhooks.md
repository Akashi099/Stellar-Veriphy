# Verifying outbound webhook signatures

StellarVeriphy sends JSON webhook requests with an HMAC-SHA256 signature. Configure `WEBHOOK_SIGNING_SECRET` before enabling `WEBHOOK_ENDPOINTS`; the backend refuses to start with webhook endpoints configured and no signing key. Use a cryptographically random secret with at least 32 bytes.

## Signature format

The `X-Veriphy-Signature` header contains a Unix timestamp and one or more signatures:

```text
t=1760900000,v1=<hex HMAC>,v1=<hex HMAC from previous key>
```

The signed message is the exact decimal timestamp, a period, and the **raw request body bytes**:

```text
HMAC-SHA256(secret, timestamp + "." + rawBody)
```

Do not parse and re-serialize JSON before verifying; whitespace or key ordering changes the signed bytes. During key rotation, StellarVeriphy sends a `v1` signature for both `WEBHOOK_SIGNING_SECRET` and `WEBHOOK_SIGNING_SECRET_PREVIOUS`. Accept a matching signature for either configured key until rotation is complete.

## Receiver verification and replay protection

1. Read the raw body bytes and parse the `t` and all `v1` values from `X-Veriphy-Signature`.
2. Reject a missing/malformed timestamp, a timestamp more than **5 minutes** from the receiver's current Unix time, or a missing signature. Also require `X-Veriphy-Timestamp` to match the signed `t`.
3. Recompute HMAC-SHA256 for each active/previous receiver secret and compare candidate and supplied signature bytes in constant time. Reject unless at least one signature matches.
4. After signature and timestamp validation, atomically record `Idempotency-Key` (or `X-Veriphy-Delivery-Id`) before applying side effects. If that key was already processed, return 2xx without applying the event again. Keep deduplication records long enough to cover delayed retries and manual redelivery.

Example Node.js verification helper:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  secrets: string[],
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || secrets.length === 0) return false;

  const fields = signatureHeader.split(",");
  const timestamp = fields.find((field) => field.startsWith("t="))?.slice(2);
  const signatures = fields.filter((field) => field.startsWith("v1=")).map((field) => field.slice(3));
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || signatures.length === 0) return false;
  if (timestampHeader !== timestamp || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  if (signatures.some((signature) => !/^[a-f0-9]{64}$/i.test(signature))) return false;

  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest();
    return signatures.some((signature) => {
      const received = Buffer.from(signature, "hex");
      return received.length === expected.length && timingSafeEqual(received, expected);
    });
  });
}
```

Perform application-level deduplication only after the signature check. A valid signature proves authenticity and freshness, but a delivery can legitimately be retried if the receiver's response was lost.

## Retries and receiver responses

Each delivery has a bounded automatic attempt budget (`WEBHOOK_MAX_ATTEMPTS`, default 8, allowed range 1–20) with queue backoff. Return 2xx after accepting a valid event. Transient timeout/connection errors, HTTP 408/425/429 and 5xx responses are retried only until the configured budget is exhausted. Other 4xx responses are treated as permanent failures immediately. Operators can explicitly request a new bounded attempt budget for a failed delivery.

See [webhook operations](../operations/webhooks.md) for request headers, delivery inspection, redelivery, and operational metrics.
