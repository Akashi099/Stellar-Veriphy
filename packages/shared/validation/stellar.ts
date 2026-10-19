// Stellar StrKey validation for ed25519 public keys ("G..." addresses).
// Format: base32(versionByte + 32-byte key + crc16-xmodem checksum, little-endian).

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PUBLIC_KEY_VERSION_BYTE = 6 << 3; // encodes to a leading "G"
const PUBLIC_KEY_LENGTH = 56;

function base32Decode(input: string): Uint8Array | null {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of input) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

// Returns null when valid, otherwise a user-facing reason and hint.
export function checkStellarPublicKey(key: string): { message: string; hint: string } | null {
  if (key.startsWith("S")) {
    return {
      message: "This looks like a Stellar secret key.",
      hint: "Never share your secret key. Enter your public key instead; it starts with \"G\".",
    };
  }
  if (!key.startsWith("G")) {
    return { message: "Stellar public keys start with \"G\".", hint: "Copy the public address from your wallet." };
  }
  if (key.length !== PUBLIC_KEY_LENGTH) {
    return {
      message: `Stellar public keys are ${PUBLIC_KEY_LENGTH} characters long (got ${key.length}).`,
      hint: "Check that the whole address was copied.",
    };
  }
  const decoded = base32Decode(key);
  if (!decoded) {
    return { message: "The key contains characters that are not allowed.", hint: "Only A–Z and 2–7 are valid." };
  }
  const payload = decoded.subarray(0, 33);
  const checksum = decoded[33] | (decoded[34] << 8);
  if (payload[0] !== PUBLIC_KEY_VERSION_BYTE || crc16Xmodem(payload) !== checksum) {
    return { message: "The key checksum is invalid.", hint: "The address may contain a typo. Copy it again from your wallet." };
  }
  return null;
}

export function isStellarPublicKey(key: string): boolean {
  return checkStellarPublicKey(key) === null;
}
