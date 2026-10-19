/**
 * Guards the retention allow-list (#809). Run with:
 *   pnpm --filter backend test:retention
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { Collections } from "../src/db/collections.js";
import {
  assertRetentionDeletable,
  ProtectedCollectionError,
  RETENTION_DELETABLE_COLLECTIONS,
} from "../src/maintenance/protection.js";

test("verification records are never deletable by retention", () => {
  assert.throws(
    () => assertRetentionDeletable(Collections.verifications),
    ProtectedCollectionError,
  );
});

test("the lock collection is protected, since deleting it would break the single-runner guarantee", () => {
  assert.throws(() => assertRetentionDeletable(Collections.locks), ProtectedCollectionError);
});

test("unknown collections are protected by default", () => {
  assert.throws(() => assertRetentionDeletable("some_new_collection"), ProtectedCollectionError);
});

test("the collections retention is designed to clean are deletable", () => {
  for (const name of [Collections.sessions, Collections.sessionsArchive, Collections.jobs]) {
    assert.doesNotThrow(() => assertRetentionDeletable(name));
  }
});

test("the allow-list never includes verification records", () => {
  assert.equal(RETENTION_DELETABLE_COLLECTIONS.includes(Collections.verifications), false);
});

test("the error names the collection so the failing rule is easy to find", () => {
  try {
    assertRetentionDeletable(Collections.verifications);
    assert.fail("expected ProtectedCollectionError");
  } catch (err) {
    assert.ok(err instanceof ProtectedCollectionError);
    assert.equal(err.collection, "verifications");
    assert.match(err.message, /"verifications"/);
  }
});
