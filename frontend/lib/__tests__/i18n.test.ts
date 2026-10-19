import fs from "node:fs";
import path from "node:path";

import { t } from "../i18n";
import { type MessageKey,messages } from "../i18n/messages";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const ADMIN_DIRS = ["app/admin", "components/admin"].map((dir) => path.join(FRONTEND_ROOT, dir));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function keysReferencedIn(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  // Matches t("key") and t("key", { … }); dynamic keys are typed through MessageKey instead.
  return [...source.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("message catalog", () => {
  const entries = Object.entries(messages) as [MessageKey, string][];

  it("has no empty, padded or unbalanced values", () => {
    for (const [key, value] of entries) {
      expect({ key, empty: value.trim().length === 0 }).toEqual({ key, empty: false });
      expect({ key, padded: value !== value.trim() }).toEqual({ key, padded: false });
      expect({ key, braces: (value.match(/[{}]/g) ?? []).length % 2 }).toEqual({ key, braces: 0 });
    }
  });

  it("uses only well-formed {name} placeholders", () => {
    for (const [key, value] of entries) {
      const stripped = value.replace(/\{\w+\}/g, "");
      expect({ key, stray: /[{}]/.test(stripped) }).toEqual({ key, stray: false });
    }
  });

  it("namespaces every key under admin.<area>", () => {
    for (const [key] of entries) {
      expect(key).toMatch(/^admin\.[a-z]+\.[A-Za-z0-9_.]+$/);
    }
  });

  it("defines every key that admin pages and components reference", () => {
    const missing: string[] = [];
    for (const dir of ADMIN_DIRS) {
      for (const file of sourceFiles(dir)) {
        for (const key of keysReferencedIn(file)) {
          if (!(key in messages)) missing.push(`${path.relative(FRONTEND_ROOT, file)}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("t()", () => {
  it("returns the English message for a key", () => {
    expect(t("admin.moderation.title")).toBe("Moderation Queue");
  });

  it("fills {name} placeholders from values", () => {
    expect(t("admin.tokens.issue.scopes", { surface: "sdk" })).toBe("Scopes allowed for sdk");
    expect(t("admin.tokens.action.rotate", { hours: 24 })).toBe("Rotate (24h grace)");
  });

  it("leaves a placeholder without a value visible rather than blank", () => {
    expect(t("admin.tokens.issue.scopes")).toBe("Scopes allowed for {surface}");
  });
});
