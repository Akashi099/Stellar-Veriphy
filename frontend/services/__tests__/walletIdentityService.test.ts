/**
 * walletIdentityService.test.ts
 *
 * Tests for wallet-based identity binding (#652).
 */

import {
  buildIdentityChallenge,
  isValidStellarPublicKey,
  shortPublicKey,
} from "@/services/walletIdentityService";

// ---------------------------------------------------------------------------
// buildIdentityChallenge
// ---------------------------------------------------------------------------

describe("buildIdentityChallenge", () => {
  const KEY = "GCREATOR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
  const NONCE = "abc123nonce";
  const ISSUED_AT = "2026-09-27T12:00:00.000Z";

  it("includes the public key", () => {
    const msg = buildIdentityChallenge(KEY, NONCE, ISSUED_AT);
    expect(msg).toContain(KEY);
  });

  it("includes the nonce", () => {
    const msg = buildIdentityChallenge(KEY, NONCE, ISSUED_AT);
    expect(msg).toContain(NONCE);
  });

  it("includes the issued-at timestamp", () => {
    const msg = buildIdentityChallenge(KEY, NONCE, ISSUED_AT);
    expect(msg).toContain(ISSUED_AT);
  });

  it("produces a human-readable, multi-line message", () => {
    const msg = buildIdentityChallenge(KEY, NONCE, ISSUED_AT);
    const lines = msg.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(3);
  });

  it("includes a consent statement about Stellar key control", () => {
    const msg = buildIdentityChallenge(KEY, NONCE, ISSUED_AT);
    expect(msg.toLowerCase()).toContain("stellar");
    expect(msg.toLowerCase()).toContain("key");
  });

  it("produces different messages for different nonces", () => {
    const a = buildIdentityChallenge(KEY, "nonce-a", ISSUED_AT);
    const b = buildIdentityChallenge(KEY, "nonce-b", ISSUED_AT);
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// isValidStellarPublicKey
// ---------------------------------------------------------------------------

describe("isValidStellarPublicKey", () => {
  it("accepts a valid G... Stellar public key (56 chars)", () => {
    expect(
      isValidStellarPublicKey("GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC"),
    ).toBe(true);
  });

  it("rejects a key that does not start with G", () => {
    expect(
      isValidStellarPublicKey("SBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC"),
    ).toBe(false);
  });

  it("rejects a key that is too short", () => {
    expect(isValidStellarPublicKey("GABCDEFG")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidStellarPublicKey("")).toBe(false);
  });

  it("rejects a key with invalid characters (lowercase)", () => {
    expect(
      isValidStellarPublicKey("Gbzx4tqk7zj6qh2vj3ncw5x4ulfyb7z6d2mrxk3qw5pevj7tl4y2anhc"),
    ).toBe(false);
  });

  it("rejects a key that is too long", () => {
    expect(
      isValidStellarPublicKey("GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHCEXTRA"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shortPublicKey
// ---------------------------------------------------------------------------

describe("shortPublicKey", () => {
  it("abbreviates a long key", () => {
    const full = "GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC";
    const short = shortPublicKey(full);
    expect(short.length).toBeLessThan(full.length);
    expect(short).toContain("…");
  });

  it("returns the key unchanged when it is short enough", () => {
    const short = "GABCD";
    expect(shortPublicKey(short)).toBe(short);
  });

  it("preserves the first 6 characters", () => {
    const full = "GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC";
    expect(shortPublicKey(full).startsWith("GBZX4T")).toBe(true);
  });

  it("preserves the last 4 characters", () => {
    const full = "GBZX4TQK7ZJ6QH2VJ3NCW5X4ULFYB7Z6D2MRXK3QW5PEVJ7TL4Y2ANHC";
    expect(shortPublicKey(full).endsWith("ANHC")).toBe(true);
  });
});
