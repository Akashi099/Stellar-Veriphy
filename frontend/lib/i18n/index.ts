import { type MessageKey,messages } from "./messages";

export type { MessageKey } from "./messages";

export type MessageValues = Record<string, string | number>;

/**
 * Returns the English message for `key`, with `{name}` placeholders replaced from `values`.
 * A placeholder with no matching value is left as written, so a missing value is visible
 * in the UI instead of silently blank.
 */
export function t(key: MessageKey, values?: MessageValues): string {
  const template: string = messages[key];
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}
