import { auditLogger } from "../security/auditLogger";

export interface WrappedKey {
  wrappedKeyBase64: string;
  ivBase64: string;
  kekVersion: string;
  algorithm: "AES-GCM";
  createdAt: string;
}

export interface ArtifactEncryptionResult {
  ciphertextBase64: string;
  ivBase64: string;
  wrappedKey: WrappedKey;
}

export type KmsError =
  | "KeyGenerationFailed"
  | "EncryptionFailed"
  | "DecryptionFailed"
  | "KeyWrappingFailed"
  | "KeyUnwrappingFailed"
  | "InvalidWrappedKey"
  | "KekNotAvailable";

export class KmsServiceError extends Error {
  constructor(
    public readonly code: KmsError,
    message: string
  ) {
    super(message);
    this.name = "KmsServiceError";
  }
}

const KEY_ALGORITHM = { name: "AES-GCM", length: 256 } as const;
const WRAP_ALGORITHM = "AES-KW";
const IV_LENGTH_BYTES = 12;

function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function importKek(rawKeyBase64: string): Promise<CryptoKey> {
  const raw = fromBase64(rawKeyBase64);
  try {
    return await crypto.subtle.importKey("raw", raw, WRAP_ALGORITHM, false, ["wrapKey", "unwrapKey"]);
  } catch (err) {
    throw new KmsServiceError("KekNotAvailable", `Failed to import KEK: ${String(err)}`);
  }
}

export async function generateArtifactKey(): Promise<CryptoKey> {
  try {
    return await crypto.subtle.generateKey(KEY_ALGORITHM, true, ["encrypt", "decrypt"]);
  } catch (err) {
    throw new KmsServiceError("KeyGenerationFailed", `Failed to generate artifact CEK: ${String(err)}`);
  }
}

export async function encryptArtifact(
  plaintext: Uint8Array,
  actor: string,
  kekBase64: string,
  kekVersion: string
): Promise<ArtifactEncryptionResult> {
  let cek: CryptoKey;
  try {
    cek = await generateArtifactKey();
  } catch (err) {
    throw err;
  }

  const iv = randomIv();
  let ciphertext: ArrayBuffer;
  try {
    ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cek, plaintext);
  } catch (err) {
    throw new KmsServiceError("EncryptionFailed", `Artifact encryption failed: ${String(err)}`);
  }

  const kek = await importKek(kekBase64);
  let wrappedKey: ArrayBuffer;
  try {
    wrappedKey = await crypto.subtle.wrapKey("raw", cek, kek, WRAP_ALGORITHM);
  } catch (err) {
    throw new KmsServiceError("KeyWrappingFailed", `CEK wrapping failed: ${String(err)}`);
  }

  await auditLogger.logEvent({
    actor,
    category: "admin",
    action: "cek_generated",
    severity: "info",
    details: `kek_version=${kekVersion}`,
  });

  await auditLogger.logEvent({
    actor,
    category: "admin",
    action: "cek_wrapped",
    severity: "info",
    details: `kek_version=${kekVersion}`,
  });

  return {
    ciphertextBase64: toBase64(ciphertext),
    ivBase64: toBase64(iv),
    wrappedKey: {
      wrappedKeyBase64: toBase64(wrappedKey),
      ivBase64: toBase64(iv),
      kekVersion,
      algorithm: "AES-GCM",
      createdAt: new Date().toISOString(),
    },
  };
}

export async function decryptArtifact(
  ciphertextBase64: string,
  ivBase64: string,
  wrappedKey: WrappedKey,
  kekBase64: string,
  actor: string,
  isAdmin = false
): Promise<Uint8Array> {
  const kek = await importKek(kekBase64);

  let cek: CryptoKey;
  try {
    const wrappedBytes = fromBase64(wrappedKey.wrappedKeyBase64);
    cek = await crypto.subtle.unwrapKey(
      "raw",
      wrappedBytes,
      kek,
      WRAP_ALGORITHM,
      KEY_ALGORITHM,
      false,
      ["decrypt"]
    );
  } catch (err) {
    throw new KmsServiceError("KeyUnwrappingFailed", `CEK unwrapping failed: ${String(err)}`);
  }

  await auditLogger.logEvent({
    actor,
    category: "admin",
    action: isAdmin ? "cek_unwrapped_admin" : "cek_unwrapped",
    severity: isAdmin ? "warning" : "info",
    details: `kek_version=${wrappedKey.kekVersion}`,
  });

  const iv = fromBase64(ivBase64);
  const ciphertext = fromBase64(ciphertextBase64);

  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cek, ciphertext);
    return new Uint8Array(plaintext);
  } catch (err) {
    throw new KmsServiceError("DecryptionFailed", `Artifact decryption failed: ${String(err)}`);
  }
}

export async function rewrapKey(
  wrappedKey: WrappedKey,
  oldKekBase64: string,
  newKekBase64: string,
  newKekVersion: string,
  actor: string
): Promise<WrappedKey> {
  const oldKek = await importKek(oldKekBase64);
  const newKek = await importKek(newKekBase64);

  let cek: CryptoKey;
  try {
    const wrappedBytes = fromBase64(wrappedKey.wrappedKeyBase64);
    cek = await crypto.subtle.unwrapKey(
      "raw",
      wrappedBytes,
      oldKek,
      WRAP_ALGORITHM,
      KEY_ALGORITHM,
      true,
      ["encrypt", "decrypt"]
    );
  } catch (err) {
    throw new KmsServiceError("KeyUnwrappingFailed", `CEK unwrapping during re-wrap failed: ${String(err)}`);
  }

  let newWrappedKey: ArrayBuffer;
  try {
    newWrappedKey = await crypto.subtle.wrapKey("raw", cek, newKek, WRAP_ALGORITHM);
  } catch (err) {
    throw new KmsServiceError("KeyWrappingFailed", `CEK re-wrapping with new KEK failed: ${String(err)}`);
  }

  await auditLogger.logEvent({
    actor,
    category: "admin",
    action: "cek_rewrapped",
    severity: "info",
    details: `old_kek_version=${wrappedKey.kekVersion} new_kek_version=${newKekVersion}`,
  });

  return {
    wrappedKeyBase64: toBase64(newWrappedKey),
    ivBase64: wrappedKey.ivBase64,
    kekVersion: newKekVersion,
    algorithm: wrappedKey.algorithm,
    createdAt: new Date().toISOString(),
  };
}
