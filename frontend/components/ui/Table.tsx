"use client";

/**
 * Table.tsx
 *
 * Generic, reusable data table with column sorting, row selection, pagination,
 * a responsive card layout on mobile, and built-in loading/empty states.
 *
 * Usage Example:
 * ─────────────────────────────────────────────────────────────────────────────
 *    <Table
 *      columns={[
 *        { key: "name", header: "Name", accessor: (row) => row.name, sortable: true, sortValue: (row) => row.name },
 *        { key: "status", header: "Status", accessor: (row) => <StatusBadge variant="success" label={row.status} /> },
 *      ]}
 *      data={rows}
 *      rowKey={(row) => row.id}
 *      selectable
 *      pageSize={10}
 *      loading={isLoading}
 *    />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Inbox } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { cn } from "@/utils/cn";

export type SortDirection = "asc" | "desc" | null;

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  accessor: (row: T) => ReactNode;
  /** Enables sorting for this column. Requires `sortValue` to actually reorder rows. */
  sortable?: boolean;
  /** Returns a comparable primitive used when this column is sorted. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "center" | "right";
  className?: string;
  /** Minimum readable width for dense tables and enlarged text. */
  minWidth?: number;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Enables a checkbox column for multi-row selection. */
  selectable?: boolean;
  /** Controlled selection. Omit to let the table manage selection internally. */
  selectedKeys?: string[];
  defaultSelectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Rows per page. Defaults to 10. */
  pageSize?: number;
  loading?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Accessible table caption (visually hidden). */
  caption?: string;
  className?: string;
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

export function Table<T>({
  columns,
  data,
  rowKey,
  selectable = false,
  selectedKeys,
  defaultSelectedKeys = [],
  onSelectionChange,
  pageSize = 10,
  loading = false,
  emptyTitle = "No data",
  emptyDescription = "There is nothing to show here yet.",
  onRowClick,
  caption,
  className,
}: TableProps<T>) {
  const [internalSelected, setInternalSelected] = useState<string[]>(defaultSelectedKeys);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [page, setPage] = useState(1);

  const isControlledSelection = selectedKeys !== undefined;
  const selected = isControlledSelection ? selectedKeys : internalSelected;

  const setSelected = (keys: string[]) => {
    if (!isControlledSelection) setInternalSelected(keys);
    onSelectionChange?.(keys);
  };

  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return data;
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return data;
    const sortValue = column.sortValue;
    return [...data].sort((a, b) => {
      const cmp = compareValues(sortValue(a), sortValue(b));
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDirection, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedData = useMemo(
    () => sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedData, currentPage, pageSize]
  );

  const toggleSort = (column: TableColumn<T>) => {
    if (!column.sortable) return;
    if (sortKey !== column.key) {
      setSortKey(column.key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else if (sortDirection === "desc") {
      setSortKey(null);
      setSortDirection(null);
    } else {
      setSortDirection("asc");
    }
  };

  const pageRowKeys = pagedData.map(rowKey);
  const allOnPageSelected =
    pageRowKeys.length > 0 && pageRowKeys.every((k) => selected.includes(k));
  const someOnPageSelected = pageRowKeys.some((k) => selected.includes(k));

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelected(selected.filter((k) => !pageRowKeys.includes(k)));
    } else {
      setSelected(Array.from(new Set([...selected, ...pageRowKeys])));
    }
  };

  const toggleRowSelection = (key: string) => {
    setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  if (loading) {
    return <TableLoadingState columns={columns} {...(className ? { className } : {})} />;
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 py-16 px-6 flex flex-col items-center text-center",
          className
        )}
        role="status"
      >
        <Inbox className="w-10 h-10 text-gray-300 dark:text-gray-700 mb-3" aria-hidden="true" />
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{emptyTitle}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{emptyDescription}</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop / tablet table view */}
      <div className="hidden md:block max-w-full overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800" tabIndex={0} aria-label="Scrollable table">
        <table className="w-max min-w-full table-auto divide-y divide-gray-200 dark:divide-gray-800">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                    }}
                    onChange={toggleSelectAllOnPage}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  id={`table-column-${column.key}`}
                  style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                  className={cn(
                    "relative resize-x overflow-hidden px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400",
                    column.align === "right"
                      ? "text-right"
                      : column.align === "center"
                        ? "text-center"
                        : "text-left",
                    column.className
                  )}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      {column.header}
                      {sortKey === column.key && sortDirection === "asc" && (
                        <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {sortKey === column.key && sortDirection === "desc" && (
                        <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {pagedData.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.includes(key);
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50",
                    isSelected && "bg-blue-50 dark:bg-blue-900/20"
                  )}
                >
                  {selectable && (
                    <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(key)}
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      headers={`table-column-${column.key}`}
                      style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                      className={cn(
                        "px-4 py-3 text-sm text-gray-700 dark:text-gray-300",
                        column.align === "right"
                          ? "text-right"
                          : column.align === "center"
                            ? "text-center"
                            : "text-left",
                        column.className
                      )}
                    >
                      {column.accessor(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {pagedData.map((row) => {
          const key = rowKey(row);
          const isSelected = selected.includes(key);
          return (
            <div
              key={key}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-2",
                onRowClick && "cursor-pointer active:bg-gray-50 dark:active:bg-gray-800/50",
                isSelected && "ring-2 ring-blue-500"
              )}
            >
              {selectable && (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    checked={isSelected}
                    onChange={() => toggleRowSelection(key)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              )}
              {columns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-4 text-sm">
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    {column.header}
                  </span>
                  <span className="text-gray-900 dark:text-gray-100 text-right">
                    {column.accessor(row)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Next
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableLoadingState<T>({
  columns,
  className,
}: {
  columns: TableColumn<T>[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        className
      )}
      role="status"
      aria-busy="true"
      aria-label="Loading table data"
    >
      <div className="hidden md:flex gap-4 bg-gray-50 dark:bg-gray-800/50 px-4 py-3">
        {columns.map((c) => (
          <div
            key={c.key}
            className="h-4 flex-1 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
          />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="border-t border-gray-200 dark:border-gray-800 first:border-t-0 px-4 py-3 space-y-2 md:space-y-0 md:flex md:gap-4"
        >
          {columns.map((c) => (
            <div
              key={c.key}
              className="h-4 w-2/3 md:w-auto md:flex-1 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading table data…</span>
    </div>
  );
}

export default Table;
