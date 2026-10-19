// Hashing helpers that work in both the browser and Node 18+ via Web Crypto.
// (utils/hash.ts depends on Node's "crypto" module and is server-only.)
import { checkSha256Hex, normalizeHash } from "../validation/hash";

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array<ArrayBuffer> | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

// Hashes the raw bytes of a file. The bytes are never decoded or re-encoded,
// so the result is the same for every file type and matches `sha256sum`.
export async function hashFile(file: Blob): Promise<string> {
  return sha256Hex(await file.arrayBuffer());
}

// JSON with object keys sorted, so equal manifests always produce the same hash.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashManifest(manifest: object): Promise<string> {
  return sha256Hex(canonicalJson(manifest));
}

export type HashComparison =
  | { status: "match"; local: string; stored: string }
  | {
      status: "mismatch";
      local: string;
      stored: string;
      firstDifferenceAt: number;   // 0-based character index
      differingCharacters: number;
    }
  | { status: "invalid"; which: "local" | "stored"; message: string; hint: string };

// Compares a locally computed hash with a stored provenance hash after
// normalizing formatting differences (case, "0x" prefix, whitespace).
export function compareHashes(localInput: string, storedInput: string): HashComparison {
  const local = normalizeHash(localInput);
  const stored = normalizeHash(storedInput);
  const localProblem = checkSha256Hex(local);
  if (localProblem) return { status: "invalid", which: "local", ...localProblem };
  const storedProblem = checkSha256Hex(stored);
  if (storedProblem) return { status: "invalid", which: "stored", ...storedProblem };

  if (local === stored) return { status: "match", local, stored };
  let firstDifferenceAt = -1;
  let differingCharacters = 0;
  for (let i = 0; i < local.length; i++) {
    if (local[i] !== stored[i]) {
      if (firstDifferenceAt === -1) firstDifferenceAt = i;
      differingCharacters++;
    }
  }
  return { status: "mismatch", local, stored, firstDifferenceAt, differingCharacters };
}
