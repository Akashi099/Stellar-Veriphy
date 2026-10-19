import type { FieldError } from "@/lib/api/types";

// Isomorphic field validation: the same rules run in client forms and route
// handlers, so both sides produce identical field errors and messages.

interface BaseRule {
  label: string;
  required?: boolean;
}

export interface StringRule extends BaseRule {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  formatMessage?: string;
}

export interface BooleanRule extends BaseRule {
  type: "boolean";
  // The value must be `true` (e.g. terms acceptance).
  mustBeTrue?: boolean;
}

export type FieldRule = StringRule | BooleanRule;

export type FieldSchema = Record<string, FieldRule>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

export interface ValidateOptions {
  // Partial updates may omit fields, but a required field that *is* sent
  // still can't be blank or null.
  partial?: boolean;
}

export const messages = {
  required: (label: string) => `${label} is required.`,
  invalidType: (label: string, type: string) => `${label} must be a ${type}.`,
  tooShort: (label: string, min: number) => `${label} must be at least ${min} characters.`,
  tooLong: (label: string, max: number) => `${label} must be at most ${max} characters.`,
  invalidFormat: (label: string) => `${label} is not in a valid format.`,
  mustAccept: (label: string) => `${label} must be accepted.`,
  unknownField: (field: string) => `${field} is not a recognized field.`,
};

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function validateField(field: string, rule: FieldRule, value: unknown): FieldError | null {
  if (isBlank(value)) {
    return rule.required ? { field, code: "required", message: messages.required(rule.label) } : null;
  }

  if (rule.type === "boolean") {
    if (typeof value !== "boolean") {
      return { field, code: "invalid_type", message: messages.invalidType(rule.label, "boolean") };
    }
    if (rule.mustBeTrue && value !== true) {
      return { field, code: "must_accept", message: messages.mustAccept(rule.label) };
    }
    return null;
  }

  if (typeof value !== "string") {
    return { field, code: "invalid_type", message: messages.invalidType(rule.label, "string") };
  }
  const trimmed = value.trim();
  if (rule.minLength !== undefined && trimmed.length < rule.minLength) {
    return { field, code: "too_short", message: messages.tooShort(rule.label, rule.minLength) };
  }
  if (rule.maxLength !== undefined && trimmed.length > rule.maxLength) {
    return { field, code: "too_long", message: messages.tooLong(rule.label, rule.maxLength) };
  }
  if (rule.pattern && !rule.pattern.test(trimmed)) {
    return { field, code: "invalid_format", message: rule.formatMessage ?? messages.invalidFormat(rule.label) };
  }
  return null;
}

export function validateFields<T extends Record<string, unknown>>(
  input: Record<string, unknown>,
  schema: FieldSchema,
  options: ValidateOptions = {},
): ValidationResult<T> {
  const errors: FieldError[] = [];
  const value: Record<string, unknown> = {};

  for (const field of Object.keys(input)) {
    if (!(field in schema)) {
      errors.push({ field, code: "unknown_field", message: messages.unknownField(field) });
    }
  }

  for (const [field, rule] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(input, field);
    if (options.partial && !present) continue;

    const raw = input[field];
    const error = validateField(field, rule, raw);
    if (error) {
      errors.push(error);
    } else if (!isBlank(raw)) {
      value[field] = typeof raw === "string" ? raw.trim() : raw;
    } else if (present && options.partial) {
      // Explicitly clearing an optional field.
      value[field] = null;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: value as T };
}
