import {
  decodeProofEvent,
  proofSubjectIds,
  type ProofCategory,
  type ProofContractIds,
  type ProofEventRecord,
  type ProofSubjectKind,
} from "./proofEvents";

export type SorobanEventType = "contract" | "system" | "diagnostic";

export interface RawSorobanEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  type: SorobanEventType;
  // Decoded topic ScVal entries; the first entry is conventionally the event name symbol.
  topic: string[];
  value: unknown;
  txHash: string;
  inSuccessfulContractCall: boolean;
}

export interface IndexedEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  eventType: SorobanEventType;
  eventName: string;
  topic: string[];
  value: unknown;
  txHash: string;
  inSuccessfulContractCall: boolean;
  indexedAt: string;
  /** Typed proof/verification record (#790); absent for non-proof events. */
  proof?: ProofEventRecord;
}

export interface EventQuery {
  contractId?: string;
  eventName?: string;
  fromLedger?: number;
  toLedger?: number;
  txHash?: string;
  /** Only proof events (#790). Implied by any of the proof filters below. */
  proofOnly?: boolean;
  proofCategory?: ProofCategory;
  /** Combine with subjectId, e.g. { subjectKind: "certificate", subjectId: "42" }. */
  subjectKind?: ProofSubjectKind;
  subjectId?: string;
  /** Only proof events whose payload did (true) or did not (false) match the contract schema. */
  schemaValid?: boolean;
  limit?: number;
  offset?: number;
}

export interface EventQueryResult {
  events: IndexedEvent[];
  total: number;
  hasMore: boolean;
}

// Represents a gap in the observed ledger sequence — signals missed or delayed events.
export interface LedgerGap {
  fromLedger: number;
  toLedger: number;
  detectedAt: string;
}

export interface EventIndexerState {
  highWaterLedger: number;
  gaps: LedgerGap[];
  eventCount: number;
  proofEventCount: number;
  /** Proof events whose payload did not match the schema in proofEvents.ts. */
  proofSchemaViolations: number;
  /** Re-ingested event ids that were ignored (same id already indexed). */
  duplicatesIgnored: number;
}

export interface EventIndexerOptions {
  /** Pin proof decoding to these contract ids so same-named events from other contracts are ignored. */
  proofContracts?: ProofContractIds;
}

export class SorobanEventIndexer {
  private readonly events: Map<string, IndexedEvent> = new Map();
  private readonly byLedger: Map<number, string[]> = new Map();
  private readonly byContract: Map<string, string[]> = new Map();
  private readonly bySubject: Map<string, string[]> = new Map();
  private readonly gaps: LedgerGap[] = [];
  private highWaterLedger = 0;
  private proofEventCount = 0;
  private proofSchemaViolations = 0;
  private duplicatesIgnored = 0;

  constructor(private readonly options: EventIndexerOptions = {}) {}

  /** Idempotent: re-ingesting an event id returns the already-indexed event unchanged. */
  ingest(raw: RawSorobanEvent): IndexedEvent {
    const existing = this.events.get(raw.id);
    if (existing) {
      this.duplicatesIgnored++;
      return existing;
    }

    // Events from failed contract calls never changed state, so they are not proofs.
    const proof =
      raw.type === "contract" && raw.inSuccessfulContractCall
        ? (decodeProofEvent(raw, this.options.proofContracts) ?? undefined)
        : undefined;

    const indexed: IndexedEvent = {
      id: raw.id,
      ledger: raw.ledger,
      ledgerClosedAt: raw.ledgerClosedAt,
      contractId: raw.contractId,
      eventType: raw.type,
      eventName: raw.topic[0] ?? "unknown",
      topic: raw.topic,
      value: raw.value,
      txHash: raw.txHash,
      inSuccessfulContractCall: raw.inSuccessfulContractCall,
      indexedAt: new Date().toISOString(),
      ...(proof ? { proof } : {}),
    };

    this.events.set(indexed.id, indexed);

    if (proof) {
      this.proofEventCount++;
      if (!proof.schemaValid) this.proofSchemaViolations++;
      for (const subjectId of proofSubjectIds(proof)) {
        const key = subjectKey(proof.subjectKind, subjectId);
        const subjectIds = this.bySubject.get(key) ?? [];
        subjectIds.push(indexed.id);
        this.bySubject.set(key, subjectIds);
      }
    }

    const ledgerIds = this.byLedger.get(raw.ledger) ?? [];
    ledgerIds.push(indexed.id);
    this.byLedger.set(raw.ledger, ledgerIds);

    const contractIds = this.byContract.get(raw.contractId) ?? [];
    contractIds.push(indexed.id);
    this.byContract.set(raw.contractId, contractIds);

    this.advanceHighWater(raw.ledger);
    return indexed;
  }

  ingestBatch(raws: RawSorobanEvent[]): IndexedEvent[] {
    return raws.map((r) => this.ingest(r));
  }

  query(q: EventQuery = {}): EventQueryResult {
    let ids: string[];

    if (q.subjectKind !== undefined && q.subjectId !== undefined) {
      ids = this.bySubject.get(subjectKey(q.subjectKind, q.subjectId)) ?? [];
    } else if (q.contractId) {
      ids = this.byContract.get(q.contractId) ?? [];
    } else {
      ids = [...this.events.keys()];
    }

    let results = ids.map((id) => this.events.get(id)!).filter(Boolean);

    if (q.contractId) {
      results = results.filter((e) => e.contractId === q.contractId);
    }
    const proofFilter =
      q.proofOnly ||
      q.proofCategory !== undefined ||
      q.subjectKind !== undefined ||
      q.subjectId !== undefined ||
      q.schemaValid !== undefined;
    if (proofFilter) {
      results = results.filter((e) => e.proof !== undefined);
    }
    if (q.proofCategory !== undefined) {
      results = results.filter((e) => e.proof!.category === q.proofCategory);
    }
    if (q.subjectKind !== undefined) {
      results = results.filter((e) => e.proof!.subjectKind === q.subjectKind);
    }
    if (q.subjectId !== undefined) {
      results = results.filter((e) => proofSubjectIds(e.proof!).includes(q.subjectId!));
    }
    if (q.schemaValid !== undefined) {
      results = results.filter((e) => e.proof!.schemaValid === q.schemaValid);
    }

    if (q.eventName !== undefined) {
      results = results.filter((e) => e.eventName === q.eventName);
    }
    if (q.fromLedger !== undefined) {
      results = results.filter((e) => e.ledger >= q.fromLedger!);
    }
    if (q.toLedger !== undefined) {
      results = results.filter((e) => e.ledger <= q.toLedger!);
    }
    if (q.txHash !== undefined) {
      results = results.filter((e) => e.txHash === q.txHash);
    }

    results.sort((a, b) => a.ledger - b.ledger || a.id.localeCompare(b.id));

    const total = results.length;
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 100;

    return {
      events: results.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total,
    };
  }

  /** Every proof event about one certificate, verification request or dispute, oldest first. */
  proofHistory(subjectKind: ProofSubjectKind, subjectId: string): IndexedEvent[] {
    return this.query({ subjectKind, subjectId, limit: Number.MAX_SAFE_INTEGER }).events;
  }

  // Explicitly register a known gap when a ledger range was unavailable.
  recordGap(fromLedger: number, toLedger: number): void {
    this.gaps.push({ fromLedger, toLedger, detectedAt: new Date().toISOString() });
  }

  state(): EventIndexerState {
    return {
      highWaterLedger: this.highWaterLedger,
      gaps: [...this.gaps],
      eventCount: this.events.size,
      proofEventCount: this.proofEventCount,
      proofSchemaViolations: this.proofSchemaViolations,
      duplicatesIgnored: this.duplicatesIgnored,
    };
  }

  private advanceHighWater(ledger: number): void {
    if (this.highWaterLedger > 0 && ledger > this.highWaterLedger + 1) {
      this.recordGap(this.highWaterLedger + 1, ledger - 1);
    }
    if (ledger > this.highWaterLedger) {
      this.highWaterLedger = ledger;
    }
  }
}

function subjectKey(kind: ProofSubjectKind, id: string): string {
  return `${kind}:${id}`;
}

export function createEventIndexer(options: EventIndexerOptions = {}): SorobanEventIndexer {
  return new SorobanEventIndexer(options);
}
