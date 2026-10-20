import { canonicalJson } from "./eventReplay";
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

/**
 * Why an incoming event was not indexed (#794).
 * - `same_id`: an event with this id is already indexed with identical content.
 * - `same_content`: a different id carries content identical to an indexed event, as
 *   happens when an RPC provider re-broadcasts or reindexes an event under a new id.
 */
export type DuplicateReason = "same_id" | "same_content";

export interface DuplicateRecord {
  eventId: string;
  /** Id of the indexed event this copy duplicates. */
  canonicalEventId: string;
  reason: DuplicateReason;
  ledger: number;
  txHash: string;
  detectedAt: string;
}

/** An incoming event that reuses an indexed id with different content. The first copy is kept. */
export interface ConflictRecord {
  eventId: string;
  ledger: number;
  txHash: string;
  /** Content fingerprint of the indexed copy. */
  existingFingerprint: string;
  /** Content fingerprint of the rejected copy. */
  incomingFingerprint: string;
  detectedAt: string;
}

export type IngestOutcome = "indexed" | "duplicate" | "conflict";

export interface IngestResult {
  outcome: IngestOutcome;
  /** The indexed event: the new one, or the copy already in the index. */
  event: IndexedEvent;
  duplicate?: DuplicateRecord;
  conflict?: ConflictRecord;
}

export interface EventIndexerState {
  highWaterLedger: number;
  gaps: LedgerGap[];
  eventCount: number;
  proofEventCount: number;
  /** Proof events whose payload did not match the schema in proofEvents.ts. */
  proofSchemaViolations: number;
  /** Incoming events ignored as duplicates, by id or by content (#794). */
  duplicatesIgnored: number;
  /** Of `duplicatesIgnored`, those that arrived under a different id (#794). */
  duplicatesByContent: number;
  /** Incoming events that reused an indexed id with different content (#794). */
  conflictsDetected: number;
}

export interface EventIndexerOptions {
  /** Pin proof decoding to these contract ids so same-named events from other contracts are ignored. */
  proofContracts?: ProofContractIds;
  /**
   * Treat an event with a new id but content identical to an indexed event as a duplicate (#794).
   * Default true. Disable only for a contract that may emit two identical events in one transaction.
   */
  dedupeByContent?: boolean;
  /** Most recent duplicate and conflict records kept for inspection. Default 1000. */
  maxAuditRecords?: number;
}

const DEFAULT_MAX_AUDIT_RECORDS = 1000;

/**
 * Content identity of an event: everything except its id. Two copies of the same on-chain event
 * produce the same fingerprint whatever id or key order the source used.
 */
export function eventFingerprint(raw: RawSorobanEvent): string {
  return canonicalJson({
    contractId: raw.contractId,
    inSuccessfulContractCall: raw.inSuccessfulContractCall,
    ledger: raw.ledger,
    topic: raw.topic,
    txHash: raw.txHash,
    type: raw.type,
    value: raw.value,
  });
}

export class SorobanEventIndexer {
  private readonly events: Map<string, IndexedEvent> = new Map();
  private readonly byLedger: Map<number, string[]> = new Map();
  private readonly byContract: Map<string, string[]> = new Map();
  private readonly bySubject: Map<string, string[]> = new Map();
  private readonly gaps: LedgerGap[] = [];
  /** id → content fingerprint, and fingerprint → first id indexed with it (#794). */
  private readonly fingerprintById: Map<string, string> = new Map();
  private readonly idByFingerprint: Map<string, string> = new Map();
  private readonly duplicateLog: DuplicateRecord[] = [];
  private readonly conflictLog: ConflictRecord[] = [];
  private highWaterLedger = 0;
  private proofEventCount = 0;
  private proofSchemaViolations = 0;
  private duplicatesIgnored = 0;
  private duplicatesByContent = 0;
  private conflictsDetected = 0;

  constructor(private readonly options: EventIndexerOptions = {}) {}

  /**
   * Idempotent: a duplicate or conflicting copy returns the already-indexed event unchanged and
   * never touches the indexes, so proof history is not double counted. Use `ingestWithOutcome`
   * to learn which case applied.
   */
  ingest(raw: RawSorobanEvent): IndexedEvent {
    return this.ingestWithOutcome(raw).event;
  }

  /** Like `ingest`, but reports whether the event was indexed, a duplicate, or a conflict (#794). */
  ingestWithOutcome(raw: RawSorobanEvent): IngestResult {
    const fingerprint = eventFingerprint(raw);
    const detectedAt = new Date().toISOString();

    const existing = this.events.get(raw.id);
    if (existing) {
      const existingFingerprint = this.fingerprintById.get(raw.id)!;
      if (existingFingerprint === fingerprint) {
        const duplicate = this.recordDuplicate(raw, raw.id, "same_id", detectedAt);
        return { outcome: "duplicate", event: existing, duplicate };
      }
      const conflict: ConflictRecord = {
        eventId: raw.id,
        ledger: raw.ledger,
        txHash: raw.txHash,
        existingFingerprint,
        incomingFingerprint: fingerprint,
        detectedAt,
      };
      this.conflictsDetected++;
      this.pushBounded(this.conflictLog, conflict);
      return { outcome: "conflict", event: existing, conflict };
    }

    if (this.options.dedupeByContent ?? true) {
      const canonicalId = this.idByFingerprint.get(fingerprint);
      if (canonicalId !== undefined) {
        const duplicate = this.recordDuplicate(raw, canonicalId, "same_content", detectedAt);
        return { outcome: "duplicate", event: this.events.get(canonicalId)!, duplicate };
      }
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
      indexedAt: detectedAt,
      ...(proof ? { proof } : {}),
    };

    this.events.set(indexed.id, indexed);
    this.fingerprintById.set(indexed.id, fingerprint);
    if (!this.idByFingerprint.has(fingerprint)) this.idByFingerprint.set(fingerprint, indexed.id);

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
    return { outcome: "indexed", event: indexed };
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

  /** Most recent duplicates that were ignored, oldest first (bounded by `maxAuditRecords`). */
  duplicates(): DuplicateRecord[] {
    return [...this.duplicateLog];
  }

  /** Most recent conflicting copies that were rejected, oldest first (bounded by `maxAuditRecords`). */
  conflicts(): ConflictRecord[] {
    return [...this.conflictLog];
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
      duplicatesByContent: this.duplicatesByContent,
      conflictsDetected: this.conflictsDetected,
    };
  }

  private recordDuplicate(
    raw: RawSorobanEvent,
    canonicalEventId: string,
    reason: DuplicateReason,
    detectedAt: string
  ): DuplicateRecord {
    const record: DuplicateRecord = {
      eventId: raw.id,
      canonicalEventId,
      reason,
      ledger: raw.ledger,
      txHash: raw.txHash,
      detectedAt,
    };
    this.duplicatesIgnored++;
    if (reason === "same_content") this.duplicatesByContent++;
    this.pushBounded(this.duplicateLog, record);
    return record;
  }

  private pushBounded<T>(log: T[], record: T): void {
    log.push(record);
    const max = this.options.maxAuditRecords ?? DEFAULT_MAX_AUDIT_RECORDS;
    if (log.length > max) log.splice(0, log.length - max);
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
