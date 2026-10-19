import type { VerificationStatus } from "@stellarveriphy/shared/types";

// In-memory persistence used until the storage layer (MongoDB/IPFS) is wired
// up. Kept on globalThis so dev-server hot reloads don't wipe it. Swap the
// implementation behind these functions without touching route handlers.

export interface UserRecord {
  stellarAddress: string;
  displayName: string;
  email: string;
  bio: string | null;
  acceptedTermsAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationRecord {
  id: string;
  contentHash: string;
  creator: string;
  status: VerificationStatus;
  statusReason: string | null;
  statusUpdatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Store {
  users: Map<string, UserRecord>;
  records: Map<string, VerificationRecord>;
}

const globalStore = globalThis as typeof globalThis & { __stellarVeriphyStore?: Store };

function store(): Store {
  globalStore.__stellarVeriphyStore ??= { users: new Map(), records: new Map() };
  return globalStore.__stellarVeriphyStore;
}

export const users = {
  get(address: string): UserRecord | undefined {
    return store().users.get(address);
  },
  insert(user: UserRecord): boolean {
    const { users } = store();
    if (users.has(user.stellarAddress)) return false;
    users.set(user.stellarAddress, user);
    return true;
  },
  update(address: string, changes: Partial<Omit<UserRecord, "stellarAddress" | "createdAt">>): UserRecord | undefined {
    const { users } = store();
    const existing = users.get(address);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
    users.set(address, updated);
    return updated;
  },
};

export interface StatusChange {
  id: string;
  status: VerificationStatus;
  reason: string | null;
  updatedBy: string;
}

export const records = {
  get(id: string): VerificationRecord | undefined {
    return store().records.get(id);
  },
  listByCreator(creator: string): VerificationRecord[] {
    return [...store().records.values()].filter((record) => record.creator === creator);
  },
  getMany(ids: readonly string[]): Map<string, VerificationRecord> {
    const { records } = store();
    const found = new Map<string, VerificationRecord>();
    for (const id of ids) {
      const record = records.get(id);
      if (record) found.set(id, record);
    }
    return found;
  },
  // Applies all changes synchronously in one tick, so callers that validated
  // first get all-or-nothing semantics. A database-backed version must run
  // this inside a transaction.
  applyStatusChanges(changes: readonly StatusChange[]): VerificationRecord[] {
    const { records } = store();
    const now = new Date().toISOString();
    const staged = changes.map((change) => {
      const existing = records.get(change.id);
      if (!existing) throw new Error(`Record ${change.id} disappeared during bulk update`);
      return {
        ...existing,
        status: change.status,
        statusReason: change.reason,
        statusUpdatedBy: change.updatedBy,
        updatedAt: now,
      };
    });
    for (const record of staged) records.set(record.id, record);
    return staged;
  },
};
