import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { SecurityService } from "../src/security/service.js";
import { config } from "../src/config.js";
import { digest } from "../src/security/policy.js";

test("grants persist, can be reused, and revocation is idempotent", async () => {
  const grants: any[] = [];
  const events: any[] = [];
  const doc = { jobId: "j", storageRef: "local://evidence", evidenceDownloadAllowed: true };
  const db = { collection(name: string) {
    if (name === "verifications") return { findOne: async (q: any) => doc.evidenceDownloadAllowed === q.evidenceDownloadAllowed ? doc : null };
    if (name === "security_audit_events") return { insertOne: async (e: any) => events.push(e) };
    return { insertOne: async (g: any) => grants.push(g),
      updateOne: async (q: any) => { for (const g of grants) if (g.tokenHash === q.tokenHash) g.revoked = true; },
      findOne: async (q: any) => grants.find(g => g.tokenHash === q.tokenHash && !g.revoked && g.expiresAt > q.expiresAt.$gt) ?? null };
  } } as unknown as Db;
  const original = config.orphanMedia.storageDir;
  const directory = await mkdtemp(join(tmpdir(), "veriphy-download-"));
  await writeFile(join(directory, "evidence"), "evidence bytes");
  config.orphanMedia.storageDir = directory;
  try {
    const service = new SecurityService(db);
    const link = await service.issue("j", "admin-token");
    assert.ok(link);
    assert.equal(link.reusable, true);
    const token = link.path.split("/").at(-1)!;
    assert.equal(grants[0].tokenHash, digest(token));
    assert.notEqual(grants[0].tokenHash, token);
    assert.ok(link.expiresAt.getTime() <= Date.now() + 900000);
    for (let use = 0; use < 2; use++) {
      const file = await service.download(token, "admin-token");
      assert.ok(file);
      try { assert.equal(await file.readFile("utf8"), "evidence bytes"); } finally { await file.close(); }
    }
    // Expired and revoked links stop before touching the filesystem.
    grants[0].expiresAt = new Date(0);
    assert.equal(await service.download(token, "admin-token"), null);
    grants[0].expiresAt = new Date(Date.now() + 10000);
    doc.evidenceDownloadAllowed = false;
    assert.equal(await service.download(token, "admin-token"), null);
    await service.revoke(token, "admin-token");
    await service.revoke(token, "admin-token");
    assert.equal(await service.download(token, "admin-token"), null);
    assert.equal(events.filter(e => e.action === "evidence.link.revoked").length, 2);
  } finally { config.orphanMedia.storageDir = original; await rm(directory, { recursive: true, force: true }); }
});
