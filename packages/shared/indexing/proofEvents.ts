/**
 * proofEvents.ts (#790)
 *
 * Schema registry and decoder for proof / verification events emitted by the provenance and
 * oracle contracts. SorobanEventIndexer uses it to turn raw Soroban events into typed,
 * queryable proof records (by certificate, verification request or dispute).
 *
 * Each schema mirrors the on-chain definition it names in `source`; keep them in sync when a
 * contract event changes. Event shapes:
 *
 * - provenance (soroban-sdk 23, `#[contractevent]`): topics are the snake_case struct name
 *   followed by the `#[topic]` fields in declaration order; data is a map of the remaining fields.
 * - oracle (soroban-sdk 21, `env.events().publish`): topic is the event symbol; data is the
 *   published value (a tuple, decoded as an array, or a single value).
 *
 * Decoding never drops an event: a payload that does not match its schema is still indexed,
 * with `schemaValid: false` and the reasons in `schemaErrors`.
 *
 * This module has only type imports so it stays loadable with Node's TypeScript type stripping.
 *
 * Reference: docs/contracts/proof-event-indexing.md
 *
 * @module packages/shared/indexing/proofEvents
 */

import type { RawSorobanEvent } from "./sorobanEventIndexer";

export const PROOF_EVENT_SCHEMA_VERSION = "1.0.0";

export type ProofContract = "provenance" | "oracle";
export type ProofCategory = "certificate" | "verification_request" | "dispute";
export type ProofSubjectKind = "certificate" | "request" | "dispute";

/**
 * - map    — `#[contractevent]` data: an object keyed by field name
 * - tuple  — `publish(topics, (a, b, ...))`: an array in field order
 * - scalar — `publish(topics, value)`: a single value, named by `dataFields[0]`
 * - none   — no data fields (an empty map or null on-chain)
 */
export type ProofDataFormat = "map" | "tuple" | "scalar" | "none";

export interface ProofEventSchema {
  /** First topic entry (the event symbol). */
  eventName: string;
  contract: ProofContract;
  category: ProofCategory;
  /** On-chain definition this schema mirrors. */
  source: string;
  /** Names of the topic entries after the event name, in order. */
  topicFields: readonly string[];
  dataFormat: ProofDataFormat;
  dataFields: readonly string[];
  /** Field that identifies what the proof is about. */
  subject: { kind: ProofSubjectKind; field: string };
  /** Field holding the account that caused the event, when there is one. */
  actorField?: string;
  description: string;
}

export interface ProofEventRecord {
  kind: string;
  contract: ProofContract;
  category: ProofCategory;
  subjectKind: ProofSubjectKind;
  /** Normalized to a string (u64 ids arrive as numbers, bigints or strings). */
  subjectId: string;
  actor?: string;
  /** Topic and data fields by name. */
  fields: Record<string, unknown>;
  schemaVersion: string;
  schemaValid: boolean;
  schemaErrors: string[];
}

const PROVENANCE = "contracts/provenance/src/lib.rs";
const ORACLE = "contracts/oracle/src/lib.rs";

export const PROOF_EVENT_SCHEMAS: readonly ProofEventSchema[] = [
  // --- provenance: certificates ------------------------------------------------
  {
    eventName: "certificate_minted",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateMinted (#15)`,
    topicFields: ["owner", "certificate_id", "manifest_hash"],
    dataFormat: "none",
    dataFields: [],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "owner",
    description: "A provenance certificate was minted for a manifest hash.",
  },
  {
    eventName: "batch_minted",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct BatchMinted (#175)`,
    topicFields: ["owner"],
    dataFormat: "map",
    dataFields: ["certificate_ids", "count"],
    subject: { kind: "certificate", field: "certificate_ids" },
    actorField: "owner",
    description:
      "Several certificates were minted in one call. Indexed under every certificate id.",
  },
  {
    eventName: "certificate_transferred",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateTransferred (#172)`,
    topicFields: ["certificate_id", "from", "to"],
    dataFormat: "none",
    dataFields: [],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "from",
    description: "Certificate ownership moved to another account.",
  },
  {
    eventName: "metadata_updated",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct MetadataUpdated (#173)`,
    topicFields: ["certificate_id", "updated_by"],
    dataFormat: "map",
    dataFields: ["new_version"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "updated_by",
    description: "Certificate metadata was updated to a new version.",
  },
  {
    eventName: "certificate_revoked",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateRevoked (#171)`,
    topicFields: ["certificate_id", "owner"],
    dataFormat: "map",
    dataFields: ["reason"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "owner",
    description: "A certificate was revoked; it no longer proves provenance.",
  },
  {
    eventName: "certificate_renewed",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateRenewed (#177)`,
    topicFields: ["certificate_id", "renewed_by"],
    dataFormat: "map",
    dataFields: ["new_expires_at"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "renewed_by",
    description: "A certificate's expiry was extended.",
  },
  {
    eventName: "certificate_expiration_warning",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateExpirationWarning (#177)`,
    topicFields: ["certificate_id", "owner"],
    dataFormat: "map",
    dataFields: ["expires_at"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "owner",
    description: "A certificate is close to expiring.",
  },
  {
    eventName: "verification_level_updated",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct VerificationLevelUpdated (#176)`,
    topicFields: ["certificate_id", "updated_by"],
    dataFormat: "map",
    dataFields: ["new_level"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "updated_by",
    description:
      "The certificate's verification level changed (Basic=0, Standard=1, Premium=2, Enterprise=3).",
  },
  {
    eventName: "certificates_linked",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificatesLinked (#178)`,
    topicFields: ["certificate_id", "related_id"],
    dataFormat: "map",
    dataFields: ["relation"],
    subject: { kind: "certificate", field: "certificate_id" },
    description: "Two certificates were linked (relation: Parent | Child | Sibling).",
  },
  {
    eventName: "certificate_endorsed",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateEndorsed (#452)`,
    topicFields: ["certificate_id", "endorser"],
    dataFormat: "map",
    dataFields: ["total_endorsements"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "endorser",
    description: "An account endorsed a certificate.",
  },
  {
    eventName: "endorsement_removed",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct EndorsementRemoved (#452)`,
    topicFields: ["certificate_id", "endorser"],
    dataFormat: "map",
    dataFields: ["total_endorsements"],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "endorser",
    description: "An endorsement was withdrawn.",
  },
  {
    eventName: "certificate_locked_event",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — struct CertificateLockedEvent (#184)`,
    topicFields: ["certificate_id", "locked_by"],
    dataFormat: "none",
    dataFields: [],
    subject: { kind: "certificate", field: "certificate_id" },
    actorField: "locked_by",
    description: "A certificate was made immutable.",
  },
  {
    eventName: "rollback_recorded",
    contract: "provenance",
    category: "certificate",
    source: `${PROVENANCE} — record_rollback publish (#658)`,
    topicFields: ["certificate_id"],
    dataFormat: "scalar",
    dataFields: ["rollback_id"],
    subject: { kind: "certificate", field: "certificate_id" },
    description: "A certificate state rollback was recorded.",
  },

  // --- oracle: verification requests ------------------------------------------
  {
    eventName: "submitted",
    contract: "oracle",
    category: "verification_request",
    source: `${ORACLE} — create_pending_request publish (submit_request / submit_request_as_delegate)`,
    topicFields: [],
    dataFormat: "tuple",
    dataFields: ["request_id", "fee"],
    subject: { kind: "request", field: "request_id" },
    description: "A verification request was submitted to the oracle.",
  },
  {
    eventName: "batch_submitted",
    contract: "oracle",
    category: "verification_request",
    source: `${ORACLE} — submit_batch_request publish`,
    topicFields: [],
    dataFormat: "scalar",
    dataFields: ["request_ids"],
    subject: { kind: "request", field: "request_ids" },
    description:
      "Several verification requests were submitted together. Indexed under every request id.",
  },
  {
    eventName: "cancelled",
    contract: "oracle",
    category: "verification_request",
    source: `${ORACLE} — cancel_request publish`,
    topicFields: [],
    dataFormat: "scalar",
    dataFields: ["request_id"],
    subject: { kind: "request", field: "request_id" },
    description: "A pending verification request was cancelled.",
  },
  {
    eventName: "expiring_soon",
    contract: "oracle",
    category: "verification_request",
    source: `${ORACLE} — check_expiration_warning publish`,
    topicFields: [],
    dataFormat: "tuple",
    dataFields: ["request_id", "remaining_ledgers"],
    subject: { kind: "request", field: "request_id" },
    description: "A verification request will expire soon.",
  },
  {
    eventName: "archived",
    contract: "oracle",
    category: "verification_request",
    source: `${ORACLE} — archive_old_requests publish`,
    topicFields: [],
    dataFormat: "scalar",
    dataFields: ["request_id"],
    subject: { kind: "request", field: "request_id" },
    description: "A finished verification request was archived.",
  },

  // --- oracle: disputes over verification results ------------------------------
  {
    eventName: "dispute_filed",
    contract: "oracle",
    category: "dispute",
    source: `${ORACLE} — file_dispute publish`,
    topicFields: [],
    dataFormat: "tuple",
    dataFields: ["dispute_id", "request_id", "provider", "requester"],
    subject: { kind: "dispute", field: "dispute_id" },
    actorField: "requester",
    description: "A requester disputed a verification result.",
  },
  {
    eventName: "dispute_resolved",
    contract: "oracle",
    category: "dispute",
    source: `${ORACLE} — resolve_dispute publish`,
    topicFields: [],
    dataFormat: "tuple",
    dataFields: ["dispute_id", "provider", "resolution", "reputation_penalty"],
    subject: { kind: "dispute", field: "dispute_id" },
    description: "A dispute was resolved.",
  },
  {
    eventName: "dispute_dismissed",
    contract: "oracle",
    category: "dispute",
    source: `${ORACLE} — dismiss_dispute publish`,
    topicFields: [],
    dataFormat: "tuple",
    dataFields: ["dispute_id", "provider", "requester"],
    subject: { kind: "dispute", field: "dispute_id" },
    description: "A dispute was dismissed.",
  },
  {
    eventName: "dispute_evidence_anchored",
    contract: "oracle",
    category: "dispute",
    source: `${ORACLE} — anchor_dispute_evidence publish`,
    topicFields: [],
    dataFormat: "tuple",
    dataFields: ["dispute_id", "package_hash", "submitter"],
    subject: { kind: "dispute", field: "dispute_id" },
    actorField: "submitter",
    description: "An evidence package hash was anchored to a dispute.",
  },
];

const SCHEMAS_BY_NAME = new Map(PROOF_EVENT_SCHEMAS.map((s) => [s.eventName, s]));

export function getProofEventSchema(eventName: string): ProofEventSchema | undefined {
  return SCHEMAS_BY_NAME.get(eventName);
}

/** Contract ids per proof contract. When given, an event is decoded only if it comes from that contract. */
export type ProofContractIds = Partial<Record<ProofContract, string>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  return undefined;
}

/** Subject ids for a record: one for most events, one per element for batch events. */
export function proofSubjectIds(record: ProofEventRecord): string[] {
  const raw = record.fields[getProofEventSchema(record.kind)?.subject.field ?? ""];
  if (Array.isArray(raw))
    return raw.map(normalizeId).filter((id): id is string => id !== undefined);
  return record.subjectId ? [record.subjectId] : [];
}

/**
 * Decodes a raw event into a proof record. Returns null for events that are not proof events,
 * or that come from another contract when `contractIds` pins the proof contracts.
 */
export function decodeProofEvent(
  raw: Pick<RawSorobanEvent, "topic" | "value" | "contractId">,
  contractIds: ProofContractIds = {}
): ProofEventRecord | null {
  const schema = getProofEventSchema(raw.topic[0] ?? "");
  if (!schema) return null;
  const pinned = contractIds[schema.contract];
  if (pinned && pinned !== raw.contractId) return null;

  const errors: string[] = [];
  const fields: Record<string, unknown> = {};

  const topics = raw.topic.slice(1);
  if (topics.length !== schema.topicFields.length) {
    errors.push(
      `expected ${schema.topicFields.length} topic field(s) after the event name, got ${topics.length}`
    );
  }
  schema.topicFields.forEach((name, i) => {
    if (i < topics.length) fields[name] = topics[i];
  });

  const value = raw.value;
  switch (schema.dataFormat) {
    case "none":
      if (
        value !== null &&
        value !== undefined &&
        !(isRecord(value) && Object.keys(value).length === 0)
      ) {
        errors.push("expected no data, got a value");
      }
      break;
    case "scalar":
      if (value === undefined || value === null)
        errors.push(`expected ${schema.dataFields[0]} as the data value`);
      else fields[schema.dataFields[0]] = value;
      break;
    case "tuple":
      if (!Array.isArray(value)) {
        errors.push(`expected data tuple (${schema.dataFields.join(", ")})`);
      } else {
        if (value.length !== schema.dataFields.length) {
          errors.push(`expected ${schema.dataFields.length} data field(s), got ${value.length}`);
        }
        schema.dataFields.forEach((name, i) => {
          if (i < value.length) fields[name] = value[i];
        });
      }
      break;
    case "map":
      if (!isRecord(value)) {
        errors.push(`expected data map with ${schema.dataFields.join(", ")}`);
      } else {
        for (const name of schema.dataFields) {
          if (name in value) fields[name] = value[name];
          else errors.push(`missing data field "${name}"`);
        }
      }
      break;
  }

  const subjectRaw = fields[schema.subject.field];
  const subjectId = Array.isArray(subjectRaw)
    ? subjectRaw.map(normalizeId).filter(Boolean).join(",")
    : (normalizeId(subjectRaw) ?? "");
  if (!subjectId) errors.push(`missing or invalid subject field "${schema.subject.field}"`);

  const actor = schema.actorField ? normalizeId(fields[schema.actorField]) : undefined;

  return {
    kind: schema.eventName,
    contract: schema.contract,
    category: schema.category,
    subjectKind: schema.subject.kind,
    subjectId,
    ...(actor ? { actor } : {}),
    fields,
    schemaVersion: PROOF_EVENT_SCHEMA_VERSION,
    schemaValid: errors.length === 0,
    schemaErrors: errors,
  };
}
