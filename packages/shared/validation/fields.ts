import { checkSha256Hex, normalizeHash } from "./hash";
import { FieldError, ValidationResult, isPlainObject } from "./result";
import { checkStellarPublicKey } from "./stellar";

// Reusable field rules shared by every validator and API route, so the same
// input (a wallet address, a hash, a bounded text field) is checked the same
// way everywhere and produces the same FieldError.
//
// Each rule reads `input[key]`, pushes any problems onto `errors`, and returns
// the normalized value (or undefined when missing or invalid).

export interface FieldOptions {
  // Prefix for error field paths when the object is nested, e.g. "manifest".
  path?: string;
  required?: boolean;
  // Overrides the default "X is required." message.
  requiredMessage?: string;
  requiredHint?: string;
}

export function fieldPath(path: string | undefined, key: string): string {
  return path ? `${path}.${key}` : key;
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function requireValue(
  input: Record<string, unknown>,
  key: string,
  options: FieldOptions,
  errors: FieldError[],
): boolean {
  if (!isMissing(input[key])) return true;
  if (options.required) {
    const error: FieldError = { field: fieldPath(options.path, key), message: options.requiredMessage ?? `${key} is required.` };
    if (options.requiredHint) error.hint = options.requiredHint;
    errors.push(error);
  }
  return false;
}

// Rejects the body outright when it is not a JSON object.
export function requireObject(input: unknown, field = "body"): ValidationResult<Record<string, unknown>> {
  if (isPlainObject(input)) return { ok: true, value: input };
  return { ok: false, errors: [{ field, message: "Must be a JSON object." }] };
}

export function rejectUnknownFields(
  input: Record<string, unknown>,
  allowed: readonly string[],
  errors: FieldError[],
  path?: string,
): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      errors.push({ field: fieldPath(path, key), message: `Unknown field "${key}".`, hint: `Allowed fields: ${allowed.join(", ")}.` });
    }
  }
}

export interface TextOptions extends FieldOptions {
  minLength?: number;
  maxLength?: number;
  // Reject line breaks and other control characters (single-line fields).
  singleLine?: boolean;
  pattern?: { regex: RegExp; message: string; hint?: string };
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function textField(
  input: Record<string, unknown>,
  key: string,
  options: TextOptions,
  errors: FieldError[],
): string | undefined {
  if (!requireValue(input, key, options, errors)) return undefined;
  const field = fieldPath(options.path, key);
  const value = input[key];
  if (typeof value !== "string") {
    errors.push({ field, message: "Must be text." });
    return undefined;
  }
  const trimmed = value.trim();
  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    errors.push({ field, message: `Must be at least ${options.minLength} characters.` });
    return undefined;
  }
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    errors.push({ field, message: `Must be at most ${options.maxLength} characters.` });
    return undefined;
  }
  if (options.singleLine && CONTROL_CHARS.test(trimmed)) {
    errors.push({ field, message: "Contains control characters.", hint: "Remove line breaks or invisible characters." });
    return undefined;
  }
  if (options.pattern && !options.pattern.regex.test(trimmed)) {
    const error: FieldError = { field, message: options.pattern.message };
    if (options.pattern.hint) error.hint = options.pattern.hint;
    errors.push(error);
    return undefined;
  }
  return trimmed;
}

// Stellar public key ("G…"), trimmed and uppercased. Secret keys are rejected with a warning.
export function stellarAddressField(
  input: Record<string, unknown>,
  key: string,
  options: FieldOptions,
  errors: FieldError[],
): string | undefined {
  if (!requireValue(input, key, { requiredHint: "Enter a Stellar public key (G…).", ...options }, errors)) return undefined;
  const field = fieldPath(options.path, key);
  const value = input[key];
  if (typeof value !== "string") {
    errors.push({ field, message: "Must be a string." });
    return undefined;
  }
  const address = value.trim().toUpperCase();
  const problem = checkStellarPublicKey(address);
  if (problem) {
    errors.push({ field, ...problem });
    return undefined;
  }
  return address;
}

// SHA-256 hex digest, normalized (prefixes and whitespace removed, lowercase).
export function sha256Field(
  input: Record<string, unknown>,
  key: string,
  options: FieldOptions,
  errors: FieldError[],
): string | undefined {
  if (!requireValue(input, key, options, errors)) return undefined;
  const field = fieldPath(options.path, key);
  const value = input[key];
  if (typeof value !== "string") {
    errors.push({ field, message: "Must be a string." });
    return undefined;
  }
  const hash = normalizeHash(value);
  const problem = checkSha256Hex(hash);
  if (problem) {
    errors.push({ field, ...problem });
    return undefined;
  }
  return hash;
}

export function enumField<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  options: FieldOptions,
  errors: FieldError[],
): T | undefined {
  if (!requireValue(input, key, options, errors)) return undefined;
  const value = input[key];
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    errors.push({ field: fieldPath(options.path, key), message: "Value is not allowed.", hint: `Use one of: ${allowed.join(", ")}.` });
    return undefined;
  }
  return value as T;
}

export interface IntegerOptions extends FieldOptions {
  min?: number;
  max?: number;
}

export function integerField(
  input: Record<string, unknown>,
  key: string,
  options: IntegerOptions,
  errors: FieldError[],
): number | undefined {
  if (!requireValue(input, key, options, errors)) return undefined;
  const field = fieldPath(options.path, key);
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push({ field, message: "Must be a whole number." });
    return undefined;
  }
  if (options.min !== undefined && value < options.min) {
    errors.push({ field, message: `Must be at least ${options.min}.` });
    return undefined;
  }
  if (options.max !== undefined && value > options.max) {
    errors.push({ field, message: `Must be at most ${options.max}.` });
    return undefined;
  }
  return value;
}

export interface StringListOptions extends FieldOptions {
  maxItems?: number;
  itemMaxLength?: number;
  lowercase?: boolean;
  unique?: boolean;
}

// List of strings, trimmed with empty entries dropped.
export function stringListField(
  input: Record<string, unknown>,
  key: string,
  options: StringListOptions,
  errors: FieldError[],
): string[] | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    if (options.required) errors.push({ field: fieldPath(options.path, key), message: options.requiredMessage ?? `${key} is required.` });
    return undefined;
  }
  const field = fieldPath(options.path, key);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    errors.push({ field, message: "Must be a list of text values." });
    return undefined;
  }
  let items = (value as string[]).map((item) => (options.lowercase ? item.trim().toLowerCase() : item.trim())).filter(Boolean);
  if (options.unique) items = [...new Set(items)];
  if (options.maxItems !== undefined && items.length > options.maxItems) {
    errors.push({ field, message: `At most ${options.maxItems} items are allowed.` });
    return undefined;
  }
  if (options.itemMaxLength !== undefined && items.some((item) => item.length > options.itemMaxLength!)) {
    errors.push({ field, message: `Each item must be at most ${options.itemMaxLength} characters.` });
    return undefined;
  }
  return items;
}

// Finishes a validator: returns the errors if any were collected, otherwise the value.
export function toValidationResult<T>(errors: FieldError[], build: () => T): ValidationResult<T> {
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: build() };
}
