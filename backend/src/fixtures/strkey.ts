/**
 * Minimal Stellar StrKey encoding for ed25519 public keys (G... addresses), used to build fixture
 * accounts that pass the same format checks as real ones (#810).
 *
 * Only public keys are produced. No secret keys (S...) exist in this module, so fixtures cannot
 * sign or spend anything.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ED25519_PUBLIC_KEY_VERSION = 6 << 3; // 'G' prefix
const PUBLIC_KEY_LENGTH = 32;

function crc16Xmodem(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of text) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`invalid base32 character: ${char}`);
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** Encodes 32 raw ed25519 public-key bytes as a G... address. */
export function encodeEd25519PublicKey(key: Uint8Array): string {
  if (key.length !== PUBLIC_KEY_LENGTH) {
    throw new Error(`ed25519 public key must be ${PUBLIC_KEY_LENGTH} bytes, got ${key.length}`);
  }
  const payload = new Uint8Array(PUBLIC_KEY_LENGTH + 3);
  payload[0] = ED25519_PUBLIC_KEY_VERSION;
  payload.set(key, 1);
  const checksum = crc16Xmodem(payload.subarray(0, PUBLIC_KEY_LENGTH + 1));
  payload[PUBLIC_KEY_LENGTH + 1] = checksum & 0xff;
  payload[PUBLIC_KEY_LENGTH + 2] = checksum >> 8;
  return base32Encode(payload);
}

/** True when `address` is a well-formed G... public key with a valid checksum. */
export function isValidEd25519PublicKey(address: string): boolean {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return false;
  const bytes = base32Decode(address);
  if (bytes.length !== PUBLIC_KEY_LENGTH + 3) return false;
  if (bytes[0] !== ED25519_PUBLIC_KEY_VERSION) return false;
  const checksum = crc16Xmodem(bytes.subarray(0, PUBLIC_KEY_LENGTH + 1));
  return bytes[PUBLIC_KEY_LENGTH + 1] === (checksum & 0xff) && bytes[PUBLIC_KEY_LENGTH + 2] === checksum >> 8;
}
