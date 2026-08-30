/**
 * Documentation: Reveal an in-memory list a screenful at a time, as the reader scrolls.
 *
 * - The roster and the ledger are fetched whole so search, tab counts, and offline reads stay instant. Rendering them whole is the part that does not scale: a few thousand rows is tens of thousands of DOM nodes, and every keystroke re-reconciles all of them. This limits what reaches the DOM without touching how the data is fetched.
 * - Nothing is loaded when the sentinel comes into view; the rows are already here. Revealing more is a slice, so it costs a render rather than a request — which is why the window can grow on scroll with no spinner and no network.
 * - The window applies after filtering, never before, so it counts the list the tabs and search have already narrowed, and it drops back to one screenful whenever `resetKey` changes. Staying deep in a list that just became short would strand the reader below its end.
 * - Primary exports: useWindowedList.
 */
import * as React from "react";

import { useInfiniteScroll } from "@/lib/use-infinite-scroll";

export type WindowedList<T> = {
  /** The rows to render right now. */
  visibleItems: T[];
  /** Attach to an element below the list; seeing it reveals the next screenful. */
  sentinelRef: (node: Element | null) => void;
  hasMore: boolean;
  /** For the fallback button — an observer that never fires must not trap the reader. */
  loadMore: () => void;
  shown: number;
  total: number;
};

export function useWindowedList<T>(
  items: T[],
  {
    pageSize = 25,
    resetKey,
  }: {
    pageSize?: number;
    /** Anything that changes the filtered set: tab, search, role, badge. */
    resetKey?: unknown;
  } = {},
): WindowedList<T> {
  // The key is stored beside the count so a filter change can be noticed while
  // rendering. React's own "adjusting state when a prop changes" pattern: it
  // re-renders immediately with the corrected value instead of painting a stale
  // window first and fixing it in an effect afterwards.
  const [state, setState] = React.useState({ count: pageSize, key: resetKey });

  if (!Object.is(state.key, resetKey)) {
    setState({ count: pageSize, key: resetKey });
  }

  const total = items.length;
  const shown = Math.min(state.count, total);
  const hasMore = shown < total;

  const loadMore = React.useCallback(
    () => setState((current) => ({ ...current, count: current.count + pageSize })),
    [pageSize],
  );

  const visibleItems = React.useMemo(() => items.slice(0, shown), [items, shown]);

  // `loading` is always false: there is nothing in flight to wait for, so the
  // next screenful can be revealed the moment the sentinel appears.
  const sentinelRef = useInfiniteScroll({ hasMore, loading: false, onLoadMore: loadMore });

  return { visibleItems, sentinelRef, hasMore, loadMore, shown, total };
}
