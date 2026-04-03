import * as React from "react";
import { getDB } from "./offline-db";

export interface PendingMutationEntry {
  id: number;
  url: string;
  method: string;
  body: Record<string, unknown> | undefined;
  createdAt: number;
}

/**
 * Returns pending (non-conflicted) mutations from IDB filtered by a URL pattern.
 * Re-reads on mount, sync-complete, mutation-queued, and online events.
 */
export function usePendingMutations<TBody extends Record<string, unknown> = Record<string, unknown>>(
  urlPattern: string,
): Array<Omit<PendingMutationEntry, "body"> & { body: TBody | undefined }> {
  const [entries, setEntries] = React.useState<
    Array<Omit<PendingMutationEntry, "body"> & { body: TBody | undefined }>
  >([]);

  const load = React.useCallback(async () => {
    try {
      const db = await getDB();
      const all = await db.getAll("pendingMutations");
      const matching = all
        .filter((m) => m.url.includes(urlPattern) && !m.status)
        .map((m) => {
          let body: TBody | undefined;
          if (m.body) {
            try {
              body = JSON.parse(m.body) as TBody;
            } catch {
              /* malformed — skip body */
            }
          }
          return {
            id: m.id!,
            url: m.url,
            method: m.method,
            body,
            createdAt: m.createdAt,
          };
        });
      setEntries(matching);
    } catch {
      // IDB read failure — ignore
    }
  }, [urlPattern]);

  React.useEffect(() => {
    load();
    const refresh = () => {
      load();
    };
    window.addEventListener("sync-complete", refresh);
    window.addEventListener("mutation-queued", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.removeEventListener("sync-complete", refresh);
      window.removeEventListener("mutation-queued", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);

  return entries;
}
