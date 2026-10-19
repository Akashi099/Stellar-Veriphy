import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifestSchema } from "../validation/manifestSchema";
import { validateUploadMetadata } from "../validation/upload";

const EXAMPLES = new URL("../../../docs/manifest-schema/", import.meta.url);
const example = (name: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(name, EXAMPLES)), "utf8"));

const VALID_V1 = {
  contentHash: "a3f5c2e1b4d6789012345678901234567890abcdef1234567890abcdef123456",
  creator: "GAWA5L5BUHB7WVPWZPNYCR7O2OUL4FG4MP3M3J3QJAHGAL3DJFMHWJJF",
  timestamp: "2026-07-29T20:45:00Z",
  metadata: { device: "iPhone 15 Pro", location: "Lagos, NG", aiModel: "No AI generation used" },
};

const VALID_V2 = {
  ...VALID_V1,
  schemaVersion: "2.0.0",
  media: { fileName: "product.png", fileType: "image/png", fileSizeBytes: 5421179 },
};

const fields = (result: ReturnType<typeof validateManifestSchema>) =>
  result.ok ? [] : result.errors.map((e) => e.field);

describe("validateManifestSchema: documented examples", () => {
  it("accepts the v1 example in docs/manifest-schema", () => {
    expect(validateManifestSchema(example("examples.manifest.v1.json"), "v1").ok).toBe(true);
  });

  it("accepts the v2 example in docs/manifest-schema", () => {
    expect(validateManifestSchema(example("examples.manifest.v2.json"), "v2").ok).toBe(true);
  });

  it("accepts the same v1 document under v2 only when it declares schemaVersion 2.0.0 and the v2 rules", () => {
    expect(validateManifestSchema(VALID_V2, "v2").ok).toBe(true);
  });
});

describe("validateManifestSchema: top-level fields", () => {
  it("rejects a non-object manifest with an actionable hint", () => {
    const result = validateManifestSchema("not json object", "v1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.hint).toContain("object");
  });

  it("rejects unknown top-level fields", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, owner: "x" }, "v1"))).toEqual(["owner"]);
  });

  it("rejects media in a v1 manifest", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, media: {} }, "v1"))).toEqual(["media"]);
  });

  it("requires schemaVersion 2.0.0 in v2 manifests", () => {
    const { schemaVersion: _omit, ...withoutVersion } = VALID_V2;
    const result = validateManifestSchema(withoutVersion, "v2");
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors[0]?.message).toBe("Schema version is required for v2 manifests.");
  });

  it("rejects a schemaVersion that does not match the requested version", () => {
    const result = validateManifestSchema({ ...VALID_V1, schemaVersion: "2.0.0" }, "v1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.hint).toContain('"1.0.0"');
  });
});

describe("validateManifestSchema: contentHash", () => {
  it("rejects a sha256: prefix, because the schema wants bare hex", () => {
    const result = validateManifestSchema(
      { ...VALID_V1, contentHash: `sha256:${VALID_V1.contentHash}` },
      "v1"
    );
    expect(fields(result)).toEqual(["contentHash"]);
  });

  it("rejects a digest of the wrong length", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, contentHash: "abc123" }, "v1"))).toEqual([
      "contentHash",
    ]);
  });

  it("requires contentHash", () => {
    const { contentHash: _omit, ...withoutHash } = VALID_V1;
    expect(fields(validateManifestSchema(withoutHash, "v1"))).toEqual(["contentHash"]);
  });
});

describe("validateManifestSchema: creator and timestamp", () => {
  it("rejects a Stellar key with a bad checksum", () => {
    const badChecksum =
      VALID_V1.creator.slice(0, -1) + (VALID_V1.creator.endsWith("A") ? "B" : "A");
    expect(fields(validateManifestSchema({ ...VALID_V1, creator: badChecksum }, "v1"))).toEqual([
      "creator",
    ]);
  });

  it("rejects a key that is not a G-address", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, creator: "SABC" }, "v1"))).toEqual([
      "creator",
    ]);
  });

  it("rejects a timestamp without seconds or timezone", () => {
    expect(
      fields(validateManifestSchema({ ...VALID_V1, timestamp: "2026-07-29T20:45" }, "v1"))
    ).toEqual(["timestamp"]);
  });

  it("rejects a timestamp that is the right shape but not a real date", () => {
    expect(
      fields(validateManifestSchema({ ...VALID_V1, timestamp: "2026-02-31T10:00:00Z" }, "v1"))
    ).toEqual(["timestamp"]);
  });
});

describe("validateManifestSchema: metadata", () => {
  it("rejects unknown metadata keys", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, metadata: { gps: "1,2" } }, "v1"))).toEqual(
      ["metadata.gps"]
    );
  });

  it("rejects empty metadata values", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, metadata: { device: "" } }, "v1"))).toEqual(
      ["metadata.device"]
    );
  });

  it("rejects metadata values longer than 256 characters", () => {
    const result = validateManifestSchema(
      { ...VALID_V1, metadata: { device: "x".repeat(257) } },
      "v1"
    );
    expect(fields(result)).toEqual(["metadata.device"]);
  });

  it("rejects non-text metadata values", () => {
    expect(fields(validateManifestSchema({ ...VALID_V1, metadata: { device: 3 } }, "v1"))).toEqual([
      "metadata.device",
    ]);
  });
});

describe("validateManifestSchema: media (v2)", () => {
  it("rejects an unsupported media type and names the allowed ones", () => {
    const result = validateManifestSchema(
      { ...VALID_V2, media: { fileType: "application/pdf" } },
      "v2"
    );
    expect(fields(result)).toEqual(["media.fileType"]);
    if (!result.ok) expect(result.errors[0]?.hint).toContain("image/png");
  });

  it.each([0, -1, 1.5, 104857601])("rejects file size %s", (size) => {
    expect(
      fields(validateManifestSchema({ ...VALID_V2, media: { fileSizeBytes: size } }, "v2"))
    ).toEqual(["media.fileSizeBytes"]);
  });

  it("accepts the maximum file size", () => {
    expect(
      validateManifestSchema({ ...VALID_V2, media: { fileSizeBytes: 104857600 } }, "v2").ok
    ).toBe(true);
  });

  it("rejects unknown media fields", () => {
    expect(fields(validateManifestSchema({ ...VALID_V2, media: { width: 10 } }, "v2"))).toEqual([
      "media.width",
    ]);
  });

  it("does not accept media under the v1 schema", () => {
    expect(validateManifestSchema({ ...VALID_V2, schemaVersion: undefined }, "v1").ok).toBe(false);
  });
});

describe("validateUploadMetadata: manifest schema is enforced before storage", () => {
  const upload = {
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    fileSize: 1024,
    contentHash: VALID_V1.contentHash,
    creator: VALID_V1.creator,
    manifest: VALID_V1,
  };

  it("accepts an upload whose manifest matches the v1 schema", () => {
    const result = validateUploadMetadata(upload, { now: new Date("2026-07-30T00:00:00Z") });
    expect(result.ok).toBe(true);
  });

  it("reports manifest errors under the manifest path", () => {
    const result = validateUploadMetadata(
      { ...upload, manifest: { ...VALID_V1, metadata: { gps: "1,2" } } },
      { now: new Date("2026-07-30T00:00:00Z") }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain("manifest.metadata.gps");
  });
});
