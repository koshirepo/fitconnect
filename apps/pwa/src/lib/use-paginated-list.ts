/**
 * Documentation: Client-side paging over a list already held in memory.
 *
 * - The roster and the ledger are fetched whole so search, tab counts, and offline reads stay instant. Rendering them whole is the part that does not scale: a few thousand rows is tens of thousands of DOM nodes, and every keystroke re-reconciles all of them. This slices the rows that are actually drawn without touching how they are fetched.
 * - Slicing happens after filtering, never before, so the page numbers describe the filtered list the tabs and search have already narrowed.
 * - `resetKey` moves the reader back to the first page when the filters change. Staying on page 7 of a list that just became two pages long shows an empty screen for a list that has results.
 * - Both corrections — the reset and the clamp — happen during render rather than in an effect, so a page that has gone out of range never reaches the DOM.
 * - Primary exports: usePaginatedList.
 */
import * as React from "react";

export type PaginatedList<T> = {
  page: number;
  setPage: (page: number) => void;
  /** Just the rows for the current page. */
  pageItems: T[];
  totalPages: number;
  total: number;
  /** 1-based index of the first row on this page; 0 when the list is empty. */
  rangeStart: number;
  /** 1-based index of the last row on this page; 0 when the list is empty. */
  rangeEnd: number;
};

export function usePaginatedList<T>(
  items: T[],
  {
    pageSize = 25,
    resetKey,
  }: {
    pageSize?: number;
    /** Anything that changes the filtered set: tab, search, role, badge. */
    resetKey?: unknown;
  } = {},
): PaginatedList<T> {
  // The key is stored beside the page so a filter change can be noticed while
  // rendering. React's own "adjusting state when a prop changes" pattern: it
  // re-renders immediately with the corrected value instead of painting a stale
  // page first and fixing it in an effect afterwards.
  const [state, setState] = React.useState({ page: 1, key: resetKey });

  if (!Object.is(state.key, resetKey)) {
    setState({ page: 1, key: resetKey });
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Deleting the last row of the last page shrinks the list under the reader.
  const page = Math.min(state.page, totalPages);

  const setPage = React.useCallback(
    (next: number) => setState((current) => ({ ...current, page: next })),
    [],
  );

  const pageItems = React.useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return {
    page,
    setPage,
    pageItems,
    totalPages,
    total,
    rangeStart: total === 0 ? 0 : (page - 1) * pageSize + 1,
    rangeEnd: Math.min(page * pageSize, total),
  };
}
