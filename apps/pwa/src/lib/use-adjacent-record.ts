/**
 * Documentation: The record before and after this one.
 *
 * - Lets a detail page offer swipe navigation across the same set the list showed, without knowing anything about how that list was built.
 * - Reads the cache directly rather than subscribing to a query, so opening a member from a link never triggers a roster download for the sake of a gesture. No cached list means no neighbours, and the detail page simply has nothing to swipe to — which is the honest outcome for a deep link.
 * - Primary exports: useAdjacentRecord.
 */
import { useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

export type AdjacentRecord = {
  previousId: string | null;
  nextId: string | null;
  /** Position in the set, for the direction of the transition. */
  index: number;
  total: number;
};

export function useAdjacentRecord<T extends { id: string }>({
  queryKey,
  currentId,
  /** Applied before ordering, so the neighbours match what the list displayed. */
  filter,
  sort,
}: {
  queryKey: QueryKey;
  currentId: string | undefined;
  filter?: (record: T) => boolean;
  sort?: (a: T, b: T) => number;
}): AdjacentRecord {
  const queryClient = useQueryClient();
  const empty: AdjacentRecord = {
    previousId: null,
    nextId: null,
    index: 0,
    total: 0,
  };

  if (!currentId) return empty;

  const cached = queryClient.getQueryData<T[]>(queryKey);
  if (!Array.isArray(cached) || cached.length === 0) return empty;

  const records = filter ? cached.filter(filter) : cached.slice();
  if (sort) records.sort(sort);

  const index = records.findIndex((record) => record.id === currentId);
  if (index === -1) return empty;

  return {
    previousId: index > 0 ? records[index - 1].id : null,
    nextId: index < records.length - 1 ? records[index + 1].id : null,
    index,
    total: records.length,
  };
}
