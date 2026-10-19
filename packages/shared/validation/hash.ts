export const SHA256_HEX_LENGTH = 64;

// Accepts common copy/paste variants ("0x…", "sha256:…", spaces, uppercase)
// and returns the canonical lowercase hex form.
export function normalizeHash(input: string): string {
  return input
    .trim()
    .replace(/^sha256[:\-]/i, "")
    .replace(/^0x/i, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

// Returns null when valid, otherwise a user-facing reason and hint. Expects a normalized hash.
export function checkSha256Hex(value: string): { message: string; hint: string } | null {
  if (value.length === 0) {
    return { message: "Hash is empty.", hint: "Provide a SHA-256 hash (64 hexadecimal characters)." };
  }
  if (/[^0-9a-f]/.test(value)) {
    return {
      message: "Hash contains characters other than 0–9 and a–f.",
      hint: "SHA-256 hashes are hexadecimal. Check for stray characters or a different encoding (e.g. base64).",
    };
  }
  if (value.length !== SHA256_HEX_LENGTH) {
    return {
      message: `SHA-256 hashes are ${SHA256_HEX_LENGTH} characters long (got ${value.length}).`,
      hint: value.length === 40 || value.length === 32
        ? "This length matches SHA-1 or MD5, which StellarVeriphy does not use."
        : "Check that the whole hash was copied.",
    };
  }
  return null;
}
