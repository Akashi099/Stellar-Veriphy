import { Collections } from "../db/collections.js";

/**
 * Collections retention cleanup is allowed to delete from (#809).
 *
 * This is an allow-list on purpose. A new retention rule can only remove documents from a
 * collection that is listed here, so a wrong filter or a new collection cannot wipe verification
 * records by accident. Anything not listed, including `verifications` and `locks`, is protected.
 * Changing this list is a policy change: update docs/operations/backup-retention.md in the same PR.
 */
export const RETENTION_DELETABLE_COLLECTIONS: readonly string[] = [
  Collections.sessions,
  Collections.sessionsArchive,
  Collections.jobs,
];

export class ProtectedCollectionError extends Error {
  constructor(readonly collection: string) {
    super(
      `retention cleanup may not delete from "${collection}"; it is not in RETENTION_DELETABLE_COLLECTIONS`,
    );
    this.name = "ProtectedCollectionError";
  }
}

/** Throws unless retention cleanup is allowed to delete from `collection`. */
export function assertRetentionDeletable(collection: string): void {
  if (!RETENTION_DELETABLE_COLLECTIONS.includes(collection)) {
    throw new ProtectedCollectionError(collection);
  }
}
