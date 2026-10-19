import { FieldError, ValidationResult, isPlainObject } from "./result";

// Content safety checks for uploaded manifests (#780). These run before any
// field-level validation so malformed or malicious payloads are rejected early,
// with one precise error per offending field, and never reach storage or a
// renderer. Field rules (formats, lengths, allowed keys) stay in manifest.ts and
// manifestSchema.ts; this module only looks at structure and string content.
//
// Rules are documented in docs/manifest-schema/README.md ("Sanitization").

export const MANIFEST_SANITIZE_LIMITS = {
  // Raw JSON body size, checked before parsing.
  maxBytes: 16 * 1024,
  // Objects nested deeper than this are rejected (a manifest is at most 2 levels deep).
  maxDepth: 4,
  // Total keys across the whole manifest.
  maxKeys: 64,
  // Any single string value, before field-specific limits apply.
  maxStringLength: 1024,
};

// Keys that can pollute Object.prototype when the manifest is merged or spread.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
// Bidirectional overrides/isolates can make text render differently from what is stored ("Trojan Source").
const BIDI_CONTROLS = /[‪-‮⁦-⁩‎‏؜]/;
// Zero-width and invisible characters hide content from reviewers and break exact matching.
const INVISIBLE_CHARS = /[​-‍⁠﻿­]/;
// Unpaired UTF-16 surrogates are not valid Unicode and are mangled by storage and JSON encoders.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
// Markup or script that would execute or inject layout if a manifest field were rendered as HTML.
const MARKUP = /<\s*[a-z!/?]|&#x?[0-9a-f]+;?|&[a-z]+;/i;
const SCRIPT_URL = /\b(?:javascript|vbscript)\s*:|\bdata:[a-z]+\/[a-z0-9.+-]+[;,]/i;
const EVENT_HANDLER = /\bon[a-z]+\s*=/i;
// Fields that hold a file name must not be able to address another path.
const PATH_FIELDS = new Set(["fileName"]);
const PATH_TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)|[\\/]|^[a-z]:/i;

export interface ManifestSanitizeOptions {
  // Prefix for error field paths when the manifest is nested, e.g. "manifest".
  path?: string;
}

// Returns one error per unsafe field. An empty array means the content is safe
// to hand to the schema validators.
export function findUnsafeManifestContent(input: unknown, options: ManifestSanitizeOptions = {}): FieldError[] {
  const root = options.path ?? "manifest";
  const errors: FieldError[] = [];
  let keys = 0;

  const visit = (value: unknown, path: string, key: string | undefined, depth: number): void => {
    if (depth > MANIFEST_SANITIZE_LIMITS.maxDepth) {
      errors.push({
        field: path,
        message: `Nested too deeply (more than ${MANIFEST_SANITIZE_LIMITS.maxDepth} levels).`,
        hint: "Manifests only contain top-level fields plus the metadata and media objects.",
      });
      return;
    }
    if (typeof value === "string") {
      const problem = checkString(value, key);
      if (problem) errors.push({ field: path, ...problem });
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) errors.push({ field: path, message: "Must be a finite number." });
      return;
    }
    if (value === null || typeof value === "boolean" || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}[${i}]`, key, depth + 1));
      return;
    }
    if (!isPlainObject(value) || !hasPlainPrototype(value)) {
      errors.push({ field: path, message: "Must be plain JSON data.", hint: "Send strings, numbers, booleans, objects and arrays only." });
      return;
    }
    for (const childKey of Object.keys(value)) {
      const childPath = path === root && !options.path ? childKey : `${path}.${childKey}`;
      keys++;
      if (FORBIDDEN_KEYS.has(childKey)) {
        errors.push({ field: childPath, message: `Field name "${childKey}" is not allowed.`, hint: "Remove this field." });
        continue;
      }
      const keyProblem = checkString(childKey, undefined);
      if (keyProblem) {
        errors.push({ field: childPath, message: `Field name is unsafe: ${keyProblem.message}` });
        continue;
      }
      visit(value[childKey], childPath, childKey, depth + 1);
    }
  };

  visit(input, root, undefined, 0);
  if (keys > MANIFEST_SANITIZE_LIMITS.maxKeys) {
    errors.push({
      field: root,
      message: `Manifest has too many fields (${keys}; at most ${MANIFEST_SANITIZE_LIMITS.maxKeys}).`,
    });
  }
  return errors;
}

// Parses a raw manifest body, rejecting oversize or malformed JSON with a precise
// message, then runs the content checks. Use at the upload boundary, before
// validateManifest / validateManifestSchema.
export function parseManifestJson(raw: string, options: ManifestSanitizeOptions = {}): ValidationResult<unknown> {
  const root = options.path ?? "manifest";
  const bytes = byteLength(raw);
  if (bytes > MANIFEST_SANITIZE_LIMITS.maxBytes) {
    return {
      ok: false,
      errors: [{
        field: root,
        message: `Manifest is too large (${bytes} bytes; at most ${MANIFEST_SANITIZE_LIMITS.maxBytes}).`,
      }],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      errors: [{
        field: root,
        message: `Manifest is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check for trailing commas, unquoted keys or truncated content.",
      }],
    };
  }
  const errors = findUnsafeManifestContent(parsed, options);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: parsed };
}

function checkString(value: string, key: string | undefined): Omit<FieldError, "field"> | undefined {
  if (value.length > MANIFEST_SANITIZE_LIMITS.maxStringLength) {
    return { message: `Text is too long (at most ${MANIFEST_SANITIZE_LIMITS.maxStringLength} characters).` };
  }
  if (LONE_SURROGATE.test(value)) {
    return { message: "Contains invalid Unicode.", hint: "Re-save the text as UTF-8." };
  }
  if (CONTROL_CHARS.test(value)) {
    return { message: "Contains control characters.", hint: "Remove line breaks or invisible characters." };
  }
  if (BIDI_CONTROLS.test(value)) {
    return { message: "Contains text direction control characters.", hint: "Remove right-to-left or left-to-right override characters." };
  }
  if (INVISIBLE_CHARS.test(value)) {
    return { message: "Contains invisible characters.", hint: "Remove zero-width spaces or byte-order marks." };
  }
  if (MARKUP.test(value)) {
    return { message: "Contains HTML markup or character entities.", hint: "Use plain text without <, > tags or &…; entities." };
  }
  if (SCRIPT_URL.test(value) || EVENT_HANDLER.test(value)) {
    return { message: "Contains script content.", hint: "Remove javascript:, data: URLs and on…= handlers." };
  }
  if (key && PATH_FIELDS.has(key) && PATH_TRAVERSAL.test(value)) {
    return { message: "File name must not contain a path.", hint: "Use only the file's base name, e.g. photo.jpg." };
  }
  return undefined;
}

function hasPlainPrototype(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function byteLength(raw: string): number {
  return typeof TextEncoder === "undefined" ? raw.length : new TextEncoder().encode(raw).length;
}
