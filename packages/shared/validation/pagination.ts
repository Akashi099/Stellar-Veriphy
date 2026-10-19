import { FieldError, ValidationResult } from "./result";

// Shared pagination contract for collection endpoints (docs/api/pagination.md).
// Clients may page by number (`page` + `pageSize`) or by opaque `cursor`;
// both describe the same offset window, so either can be used at any time.

export const PAGINATION_DEFAULTS = {
  pageSize: 20,
  maxPageSize: 100,
};

export interface PaginationParams {
  page: number;
  pageSize: number;
  offset: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor: string | null;
  previousCursor: string | null;
}

export interface Page<T> {
  items: T[];
  pagination: PaginationMeta;
}

// Cursors are base64url-encoded offsets. They are opaque to clients so the
// encoding can change (e.g. to keyset cursors) without breaking callers.
export function encodeCursor(offset: number): string {
  const raw = `o:${offset}`;
  return typeof btoa === "function"
    ? btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    : Buffer.from(raw).toString("base64url");
}

export function decodeCursor(cursor: string): number | null {
  try {
    const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const raw = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("utf8");
    const match = /^o:(\d+)$/.exec(raw);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function parsePositiveInt(raw: string | null): number | null | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  return /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

// Reads `page`, `pageSize` (alias `limit`) and `cursor` from query parameters.
export function parsePaginationParams(
  searchParams: URLSearchParams,
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): ValidationResult<PaginationParams> {
  const maxPageSize = options.maxPageSize ?? PAGINATION_DEFAULTS.maxPageSize;
  const errors: FieldError[] = [];

  let pageSize = options.defaultPageSize ?? PAGINATION_DEFAULTS.pageSize;
  const sizeKey = searchParams.has("pageSize") ? "pageSize" : "limit";
  const rawSize = parsePositiveInt(searchParams.get(sizeKey));
  if (rawSize === null || rawSize === 0) {
    errors.push({ field: sizeKey, message: "Must be a whole number greater than 0." });
  } else if (rawSize !== undefined) {
    if (rawSize > maxPageSize) {
      errors.push({ field: sizeKey, message: `Must be at most ${maxPageSize}.` });
    } else {
      pageSize = rawSize;
    }
  }

  let offset = 0;
  const cursor = searchParams.get("cursor");
  const rawPage = parsePositiveInt(searchParams.get("page"));
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded === null) {
      errors.push({ field: "cursor", message: "Cursor is not valid.", hint: "Use a nextCursor or previousCursor value from a previous response." });
    } else {
      offset = decoded;
    }
    if (rawPage !== undefined) {
      errors.push({ field: "page", message: "Send either page or cursor, not both." });
    }
  } else if (rawPage === null || rawPage === 0) {
    errors.push({ field: "page", message: "Must be a whole number of 1 or more." });
  } else if (rawPage !== undefined) {
    offset = (rawPage - 1) * pageSize;
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { page: Math.floor(offset / pageSize) + 1, pageSize, offset } };
}

export function buildPaginationMeta(total: number, params: PaginationParams): PaginationMeta {
  const { offset, pageSize } = params;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasNextPage = offset + pageSize < total;
  const hasPreviousPage = offset > 0;
  return {
    total,
    page: params.page,
    pageSize,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    nextCursor: hasNextPage ? encodeCursor(offset + pageSize) : null,
    previousCursor: hasPreviousPage ? encodeCursor(Math.max(0, offset - pageSize)) : null,
  };
}

// Slices an already filtered and sorted list into one page.
export function paginate<T>(items: readonly T[], params: PaginationParams): Page<T> {
  return {
    items: items.slice(params.offset, params.offset + params.pageSize),
    pagination: buildPaginationMeta(items.length, params),
  };
}
