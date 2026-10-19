export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function parseLevel(raw: string | undefined): LogLevel {
  return raw && raw in LEVELS ? (raw as LogLevel) : "info";
}

export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const out: LogFields = { name: err.name, message: err.message, stack: err.stack };
    const code = (err as { code?: unknown }).code;
    if (code !== undefined) out.code = code;
    if (err.cause !== undefined) out.cause = serializeError(err.cause);
    return out;
  }
  return { message: String(err) };
}

/** Structured JSON-lines logger. Any `err` field is serialized with name, message, code, stack and cause. */
export function createLogger(bindings: LogFields = {}, minLevel: LogLevel = parseLevel(process.env.LOG_LEVEL)): Logger {
  const write = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const entry: LogFields = { time: new Date().toISOString(), level, msg, ...bindings, ...fields };
    if (entry.err !== undefined) entry.err = serializeError(entry.err);
    const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + "\n");
  };

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (extra) => createLogger({ ...bindings, ...extra }, minLevel),
  };
}

export const logger = createLogger({ service: "stellarveriphy-backend" });
