import { randomBytes, randomUUID } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import type { Db } from "mongodb";
import { Collections, type VerificationDoc } from "../db/collections.js";
import { config } from "../config.js";
import { digest, scoreRisk } from "./policy.js";

interface DownloadGrant { tokenHash: string; jobId: string; storageRef: string; expiresAt: Date; revoked: boolean }
export class SecurityService {
  constructor(private readonly db: Db) {}
  private records() { return this.db.collection<VerificationDoc>(Collections.verifications); }
  private grants() { return this.db.collection<DownloadGrant>("evidence_download_grants"); }
  async audit(action: string, context: Record<string, unknown>) {
    await this.db.collection("security_audit_events").insertOne({ eventId: randomUUID(), action, at: new Date(), ...context });
  }
  async risk(creator: string) {
    const rules = config.risk;
    const records = await this.records().find({ creator, updatedAt: { $gte: new Date(Date.now() - rules.windowMs) } })
      .project<Pick<VerificationDoc, "jobId" | "status" | "updatedAt">>({ jobId: 1, status: 1, updatedAt: 1 }).toArray();
    return scoreRisk(records, rules);
  }
  async export(jobId: string, actor: string) {
    const verification = await this.records().findOne({ jobId });
    if (!verification) return null;
    const events = await this.db.collection("security_audit_events").find({ jobId }).sort({ at: 1, _id: 1 }).toArray();
    const payload = { format: "stellar-veriphy-audit/v1", exportId: randomUUID(), exportedAt: new Date().toISOString(),
      requestedBy: actor, source: { collection: Collections.verifications, database: this.db.databaseName,
        network: config.stellar.network, readSemantics: "verification snapshot followed by audit history; not a transactional snapshot" },
      verification, events };
    const sha256 = digest(payload);
    // Persist a separate receipt BEFORE delivering the export. No update API exists.
    await this.db.collection("audit_export_receipts").insertOne({ exportId: payload.exportId, sha256, at: new Date(), actor, jobId });
    await this.audit("audit.export", { jobId, actor, exportId: payload.exportId, sha256 });
    return { payload, integrity: { algorithm: "sha256", canonicalization: "sorted-json-v1", sha256 } };
  }
  async issue(jobId: string, actor: string) {
    const doc = await this.records().findOne({ jobId, evidenceDownloadAllowed: true });
    if (!doc || !config.orphanMedia.storageDir || !doc.storageRef.startsWith("local://")) return null;
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + config.downloadTtlSeconds * 1000);
    await this.grants().insertOne({ tokenHash: digest(token), jobId, storageRef: doc.storageRef, expiresAt, revoked: false });
    await this.audit("evidence.link.issued", { jobId, actor, expiresAt });
    return { path: "/api/evidence/download/" + token, expiresAt, reusable: true, requiresAdminAuthorization: true };
  }
  async revoke(token: string, actor: string) {
    await this.grants().updateOne({ tokenHash: digest(token) }, { $set: { revoked: true } });
    await this.audit("evidence.link.revoked", { actor, tokenHash: digest(token) });
  }
  async download(token: string, actor: string) {
    const grant = await this.grants().findOne({ tokenHash: digest(token), revoked: false, expiresAt: { $gt: new Date() } });
    if (!grant || !config.orphanMedia.storageDir) return null;
    // Read the current sharing policy and object binding on EVERY use, bypassing public caches.
    const doc = await this.records().findOne({ jobId: grant.jobId, evidenceDownloadAllowed: true, storageRef: grant.storageRef });
    if (!doc) return null;
    const root = await realpath(config.orphanMedia.storageDir);
    const candidate = resolve(root, doc.storageRef.slice("local://".length));
    if (!candidate.startsWith(root + sep)) return null;
    const target = await realpath(candidate);
    if (!target.startsWith(root + sep)) return null;
    const file = await open(target, "r");
    try {
      if (!(await file.stat()).isFile()) { await file.close(); return null; }
      // Recheck revocation/expiry after filesystem work, immediately before release.
      if (!await this.grants().findOne({ tokenHash: grant.tokenHash, revoked: false, expiresAt: { $gt: new Date() } })) {
        await file.close(); return null;
      }
      await this.audit("evidence.download", { jobId: doc.jobId, actor, tokenHash: grant.tokenHash });
      return file;
    } catch (error) { await file.close(); throw error; }
  }
}
