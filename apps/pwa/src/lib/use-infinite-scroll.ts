import * as React from "react";

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  disabled?: boolean;
  rootMargin?: string;
}

export function useInfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  disabled = false,
  rootMargin = "200px",
}: UseInfiniteScrollOptions) {
  const observerRef = React.useRef<IntersectionObserver | null>(null);

  const setRef = React.useCallback(
    (node: Element | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node || disabled) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && hasMore && !loading && !disabled) {
            onLoadMore();
          }
        },
        { rootMargin },
      );

      observerRef.current.observe(node);
    },
    [hasMore, loading, onLoadMore, disabled, rootMargin],
  );

  React.useEffect(() => () => observerRef.current?.disconnect(), []);

  return setRef;
}

export function appendUniqueById<T extends { id: string | number }>(prev: T[], next: T[]) {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((item) => String(item.id)));
  const merged = [...prev];
  for (const item of next) {
    const key = String(item.id);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}
