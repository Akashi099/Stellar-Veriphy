import { randomUUID } from "crypto";
import { hashManifest, type UploadMetadata, type UploadRecord } from "@stellarveriphy/shared";
import { collection } from "./json-collection";

const uploads = () => collection<UploadRecord>("uploads");

// Stores normalized upload metadata. The same file registered twice by the same
// creator returns the existing record instead of creating a duplicate.
export async function saveUpload(metadata: UploadMetadata): Promise<{ record: UploadRecord; created: boolean }> {
  const existing = (await uploads().all()).find(
    (r) => r.contentHash === metadata.contentHash && r.creator === metadata.creator,
  );
  if (existing) return { record: existing, created: false };

  const record: UploadRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    manifestHash: await hashManifest(metadata.manifest),
    ...metadata,
  };
  await uploads().put(record);
  return { record, created: true };
}

export function getUpload(id: string): Promise<UploadRecord | undefined> {
  return uploads().get(id);
}

export async function findUploadsByHash(contentHash: string): Promise<UploadRecord[]> {
  return (await uploads().all()).filter((r) => r.contentHash === contentHash);
}

export async function findUploadsByCreator(creator: string): Promise<UploadRecord[]> {
  return (await uploads().all()).filter((r) => r.creator === creator);
}
