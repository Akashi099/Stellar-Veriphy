import type { ContentManifest } from "../types";

export const MANIFEST_SCHEMA_VERSIONS = ["1.0.0", "2.0.0"] as const;
export type ManifestSchemaVersion = (typeof MANIFEST_SCHEMA_VERSIONS)[number];
export const LATEST_MANIFEST_SCHEMA_VERSION: ManifestSchemaVersion = "2.0.0";

export const MANIFEST_SCHEMA_URIS: Record<ManifestSchemaVersion, string> = {
  "1.0.0": "https://stellarveriphy.dev/schemas/content-manifest.schema.v1.json",
  "2.0.0": "https://stellarveriphy.dev/schemas/content-manifest.schema.v2.json",
};

export function resolveSchemaVersion(
  manifest: Pick<ContentManifest, "schemaVersion">,
): ManifestSchemaVersion {
  const v = manifest.schemaVersion;
  if (v && (MANIFEST_SCHEMA_VERSIONS as readonly string[]).includes(v)) {
    return v as ManifestSchemaVersion;
  }
  return LATEST_MANIFEST_SCHEMA_VERSION;
}

export type ProofType = "tee_attestation" | "manifest_hash" | "ownership_transfer";

export interface ProofSchema {
  type: ProofType;
  version: string;
  hashAlgorithm: "sha256";
  value: string;
  manifestSchemaVersion?: ManifestSchemaVersion;
  issuedAt: number;
  issuer: string;
}

export interface SchemaChangeLogEntry {
  version: ManifestSchemaVersion;
  date: string;
  summary: string;
  breakingChange: boolean;
}

export const MANIFEST_SCHEMA_CHANGELOG: readonly SchemaChangeLogEntry[] = [
  {
    version: "1.0.0",
    date: "2024-01-01",
    summary: "Initial manifest schema: contentHash, creator, timestamp, optional metadata.",
    breakingChange: false,
  },
  {
    version: "2.0.0",
    date: "2024-06-01",
    summary: "Added media block (fileName, fileType, fileSizeBytes) and required schemaVersion field.",
    breakingChange: true,
  },
];
