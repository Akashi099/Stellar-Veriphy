export interface FieldError {
  field: string;     // dotted path, e.g. "manifest.metadata.device"
  message: string;   // what is wrong
  hint?: string;     // how to fix it
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Groups errors by field so forms can show the first message next to each input.
export function errorsByField(errors: FieldError[]): Record<string, FieldError> {
  const out: Record<string, FieldError> = {};
  for (const error of errors) {
    if (!out[error.field]) out[error.field] = error;
  }
  return out;
}
