/**
 * Provenance data source for dashboard, activity timeline, history view and
 * bulk export.
 *
 * Until the indexer for Provenance contract events (`get_certificate_history`)
 * is wired up, this module produces a deterministic dataset so every view is
 * fed from one consistent source. Swap `loadProvenanceDataset` for the real
 * fetch without touching consumers.
 */
import type {
  ProvenanceEvent,
  ProvenanceEventType,
  ProvenanceRecord,
} from "@stellarveriphy/shared/types";

export interface ProvenanceDataset {
  records: ProvenanceRecord[];
  events: ProvenanceEvent[];
}

export const EVENT_LABELS: Record<ProvenanceEventType, string> = {
  verification_submitted: "Verification submitted",
  verification_completed: "Verification completed",
  verification_failed: "Verification failed",
  certificate_minted: "Certificate minted",
  metadata_updated: "Metadata updated",
  ownership_transferred: "Ownership transferred",
  certificate_renewed: "Certificate renewed",
  certificate_linked: "Certificate linked",
  certificate_revoked: "Certificate revoked",
};

export type EventCategory = "verification" | "certificate" | "update";

export const EVENT_CATEGORY: Record<ProvenanceEventType, EventCategory> = {
  verification_submitted: "verification",
  verification_completed: "verification",
  verification_failed: "verification",
  certificate_minted: "certificate",
  certificate_renewed: "certificate",
  certificate_linked: "certificate",
  certificate_revoked: "certificate",
  metadata_updated: "update",
  ownership_transferred: "update",
};

// --- deterministic PRNG ------------------------------------------------------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function fakeKey(rand: () => number): string {
  let k = "G";
  for (let i = 0; i < 55; i++) k += B32[Math.floor(rand() * 32)];
  return k;
}
function fakeHex(rand: () => number, len = 64): string {
  let h = "";
  for (let i = 0; i < len; i++) h += Math.floor(rand() * 16).toString(16);
  return h;
}

const FILE_TYPES = ["image/jpeg", "image/png", "video/mp4", "audio/mpeg", "application/pdf"];

export function generateProvenanceDataset(
  count = 240,
  now = Math.floor(Date.now() / 1000),
  seed = 616,
): ProvenanceDataset {
  const rand = mulberry32(seed);
  const creators = Array.from({ length: 12 }, () => fakeKey(rand));
  const records: ProvenanceRecord[] = [];
  const events: ProvenanceEvent[] = [];
  const DAY = 86_400;

  for (let i = 0; i < count; i++) {
    const id = String(1000 + i);
    const creator = creators[Math.floor(rand() * creators.length)];
    const submitted = now - Math.floor(rand() * 60 * DAY);
    const fileType = FILE_TYPES[Math.floor(rand() * FILE_TYPES.length)];
    const certEvents: ProvenanceEvent[] = [];
    let t = submitted;
    let owner = creator;
    const push = (type: ProvenanceEventType, extra: Partial<ProvenanceEvent> = {}) => {
      certEvents.push({
        id: `${id}-${certEvents.length}`,
        certificateId: id,
        type,
        actor: owner,
        timestamp: t,
        txHash: fakeHex(rand),
        ...extra,
      });
    };

    push("verification_submitted", { details: "Content and manifest submitted to oracle" });
    t += 30 + Math.floor(rand() * 600);
    if (t > now) t = now;
    if (rand() < 0.08) {
      push("verification_failed", { details: "TEE attestation did not match approved code hash" });
      t += 3600;
      if (t > now) t = now;
      push("verification_submitted", { details: "Resubmitted after fixing manifest" });
      t += 120;
      if (t > now) t = now;
    }
    push("verification_completed", { details: "Oracle attestation verified" });
    push("certificate_minted", { details: `Certificate #${id} minted on-chain` });

    let status: ProvenanceRecord["status"] = "active";
    const extras = Math.floor(rand() * 5);
    for (let e = 0; e < extras && status === "active"; e++) {
      t += Math.floor(rand() * 10 * DAY);
      if (t > now) break;
      const r = rand();
      if (r < 0.3) {
        push("metadata_updated", {
          details: "Manifest metadata updated",
          changes: { location: { from: "—", to: "Lagos, NG" } },
        });
      } else if (r < 0.5) {
        const next = creators[Math.floor(rand() * creators.length)];
        push("ownership_transferred", {
          details: "Ownership transferred",
          changes: { owner: { from: owner, to: next } },
        });
        owner = next;
      } else if (r < 0.7) {
        push("certificate_renewed", { details: "Certificate validity renewed for 1 year" });
      } else if (r < 0.92 && i > 0) {
        const rel = String(1000 + Math.floor(rand() * i));
        push("certificate_linked", { details: `Linked as derivative of #${rel}`, relatedCertificateId: rel });
      } else {
        push("certificate_revoked", { details: "Revoked by creator" });
        status = "revoked";
      }
    }

    events.push(...certEvents);
    records.push({
      id,
      storageRef: `ipfs://bafy${fakeHex(rand, 40)}`,
      manifestHash: fakeHex(rand),
      attestationHash: fakeHex(rand),
      contentHash: fakeHex(rand),
      creator: owner,
      timestamp: certEvents.find((e) => e.type === "certificate_minted")!.timestamp,
      status,
      fileName: `asset-${id}.${fileType.split("/")[1]}`,
      fileType,
      eventCount: certEvents.length,
      lastEventAt: certEvents[certEvents.length - 1].timestamp,
    });
  }

  events.sort((a, b) => b.timestamp - a.timestamp);
  return { records, events };
}

let cache: ProvenanceDataset | null = null;

export async function loadProvenanceDataset(): Promise<ProvenanceDataset> {
  if (!cache) cache = generateProvenanceDataset();
  return cache;
}

export function getCertificateHistory(dataset: ProvenanceDataset, certificateId: string): ProvenanceEvent[] {
  return dataset.events
    .filter((e) => e.certificateId === certificateId)
    .sort((a, b) => a.timestamp - b.timestamp);
}

// --- metrics -----------------------------------------------------------------
export interface DashboardMetrics {
  totalCertificates: number;
  activeCertificates: number;
  verifications24h: number;
  verificationsPrev24h: number;
  successRate: number;
  avgVerificationSeconds: number;
  dailyVerifications: number[]; // last 14 days, oldest first
}

export function computeMetrics(dataset: ProvenanceDataset, now = Math.floor(Date.now() / 1000)): DashboardMetrics {
  const DAY = 86_400;
  const completed = dataset.events.filter((e) => e.type === "verification_completed");
  const failed = dataset.events.filter((e) => e.type === "verification_failed");
  const inWindow = (e: ProvenanceEvent, from: number, to: number) => e.timestamp > from && e.timestamp <= to;

  const daily = Array.from({ length: 14 }, (_, i) => {
    const end = now - (13 - i) * DAY;
    return completed.filter((e) => inWindow(e, end - DAY, end)).length;
  });

  // Duration = completed timestamp − latest preceding submission for the same cert.
  const durations: number[] = [];
  for (const c of completed) {
    const sub = dataset.events
      .filter((e) => e.certificateId === c.certificateId && e.type === "verification_submitted" && e.timestamp <= c.timestamp)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (sub) durations.push(c.timestamp - sub.timestamp);
  }

  const attempts = completed.length + failed.length;
  return {
    totalCertificates: dataset.records.length,
    activeCertificates: dataset.records.filter((r) => r.status === "active").length,
    verifications24h: completed.filter((e) => inWindow(e, now - DAY, now)).length,
    verificationsPrev24h: completed.filter((e) => inWindow(e, now - 2 * DAY, now - DAY)).length,
    successRate: attempts ? (completed.length / attempts) * 100 : 0,
    avgVerificationSeconds: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    dailyVerifications: daily,
  };
}

// --- formatting --------------------------------------------------------------
export function shortKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 5)}…${key.slice(-4)}` : key;
}

export function relativeTime(ts: number, now = Math.floor(Date.now() / 1000)): string {
  const d = now - ts;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86_400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86_400)}d ago`;
}
