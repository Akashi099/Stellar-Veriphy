export interface OwnershipTransferRecord {
  certificateId: string;
  from: string;
  to: string;
  actor: string;
  occurredAt: string;
}

interface OwnershipStore {
  owners: Record<string, string>;
  transfers: OwnershipTransferRecord[];
}

const STORAGE_KEY = "sv_certificate_ownership_preview";
const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

function readStore(): OwnershipStore {
  if (typeof window === "undefined") return { owners: {}, transfers: [] };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { owners: {}, transfers: [] };
    const parsed = JSON.parse(stored) as Partial<OwnershipStore>;
    return {
      owners: parsed.owners && typeof parsed.owners === "object" ? parsed.owners : {},
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
    };
  } catch {
    return { owners: {}, transfers: [] };
  }
}

export function getCertificateOwner(certificateId: string, fallbackOwner: string): string {
  return readStore().owners[certificateId] ?? fallbackOwner;
}

export function getOwnershipTransferHistory(certificateId: string): OwnershipTransferRecord[] {
  return readStore()
    .transfers.filter((transfer) => transfer.certificateId === certificateId)
    .reverse();
}

export function transferCertificateOwnership(input: {
  certificateId: string;
  expectedOwner: string;
  actor: string;
  newOwner: string;
}): OwnershipTransferRecord {
  if (typeof window === "undefined") throw new Error("Transfers are only available in the browser.");
  if (!STELLAR_PUBLIC_KEY.test(input.newOwner)) {
    throw new Error("Enter a valid Stellar public address beginning with G.");
  }

  const store = readStore();
  const currentOwner = store.owners[input.certificateId] ?? input.expectedOwner;
  if (currentOwner !== input.expectedOwner || currentOwner !== input.actor) {
    throw new Error("Only the certificate's current owner can confirm this transfer.");
  }
  if (input.newOwner === currentOwner) {
    throw new Error("Choose an address different from the current owner.");
  }

  const transfer: OwnershipTransferRecord = {
    certificateId: input.certificateId,
    from: currentOwner,
    to: input.newOwner,
    actor: input.actor,
    occurredAt: new Date().toISOString(),
  };
  store.owners[input.certificateId] = input.newOwner;
  store.transfers.push(transfer);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    throw new Error("Could not save the ownership preview in this browser.");
  }
  return transfer;
}