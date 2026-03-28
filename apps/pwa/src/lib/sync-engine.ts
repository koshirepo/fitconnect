import { getDB } from "./offline-db";
import { api } from "@/api/client";
import { getOfflineFile, deleteOfflineFile } from "./offline-files";

const MAX_RETRIES = 5;
let isSyncing = false;

export type SyncResult = { synced: number; failed: number; conflicts: number };

/**
 * Drain all queued mutations in FIFO order.
 *
 * - FIFO ordering preserves causal consistency (create before update).
 * - The axios interceptor re-attaches a fresh token on retry so
 *   expired tokens are auto-refreshed.
 * - `X-Offline-Mutation` header tells the queueFailedMutation interceptor
 *   NOT to re-queue if the replay fails (prevents infinite duplication).
 * - 4xx (except 409) = permanent failure → discard.
 * - 409 = conflict → mark for user review.
 * - 5xx / network error = transient → increment retries, stop draining.
 */
export async function flushPendingMutations(): Promise<SyncResult> {
  if (isSyncing || !navigator.onLine) return { synced: 0, failed: 0, conflicts: 0 };
  isSyncing = true;

  const db = await getDB();
  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  try {
    const mutations = await db.getAll("pendingMutations");
    mutations.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    for (const mutation of mutations) {
      if (!navigator.onLine) break;

      try {
        let payload = mutation.body ? JSON.parse(mutation.body) : undefined;

        // Strip display-only metadata (keys starting with _) before sending
        if (payload && typeof payload === "object") {
          for (const key of Object.keys(payload)) {
            if (key.startsWith("_") && key !== "_pendingFileId") delete payload[key];
          }
        }

        // Track file ID so we can clean up AFTER success
        let pendingFileId: number | undefined;

        // If the mutation references a pending file, upload it first
        if (payload?._pendingFileId != null) {
          pendingFileId = payload._pendingFileId as number;
          const file = await getOfflineFile(pendingFileId);
          if (file) {
            const formData = new FormData();
            formData.append("file", file);
            const uploadRes = await api.post("/uploads/avatar", formData, {
              headers: {
                "Content-Type": "multipart/form-data",
                "X-Offline-Mutation": "true",
              },
            });
            payload = { ...payload, avatarUrl: uploadRes.data.data.url };
          }
          delete payload._pendingFileId;
        }

        await api.request({
          url: mutation.url,
          method: mutation.method,
          data: payload,
          headers: {
            "X-Offline-Mutation": "true",
            "X-Mutation-Timestamp": String(mutation.createdAt),
          },
        });

        // SUCCESS — delete mutation, then clean up the stored file
        await db.delete("pendingMutations", mutation.id!);
        if (pendingFileId != null) {
          deleteOfflineFile(pendingFileId).catch(() => {});
        }
        synced++;
      } catch (err: unknown) {
        if (!navigator.onLine) break;

        const status = (err as { response?: { status?: number } })?.response?.status;

        if (status === 409) {
          const tx = db.transaction("pendingMutations", "readwrite");
          await tx.store.put({ ...mutation, status: "conflicted" });
          await tx.done;
          conflicts++;
          continue;
        }

        if (status && status >= 400 && status < 500) {
          console.warn(
            `[Sync] Permanent failure (${status}) for mutation ${mutation.id}, discarding`,
          );
          await db.delete("pendingMutations", mutation.id!);
          failed++;
          continue;
        }

        // 5xx / network — transient, increment retries
        const retries = mutation.retries + 1;
        if (retries >= MAX_RETRIES) {
          console.error(`[Sync] Max retries for mutation ${mutation.id}, discarding`);
          await db.delete("pendingMutations", mutation.id!);
          failed++;
        } else {
          const tx = db.transaction("pendingMutations", "readwrite");
          await tx.store.put({ ...mutation, retries });
          await tx.done;
          break; // Stop draining on transient errors
        }
      }
    }
  } finally {
    isSyncing = false;
  }

  const result: SyncResult = { synced, failed, conflicts };

  window.dispatchEvent(new CustomEvent("sync-complete", { detail: result }));

  return result;
}

/** Count of mutations waiting to sync. */
export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count("pendingMutations");
}

/** Count of conflicted mutations needing user review. */
export async function getConflictCount(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("pendingMutations");
  return all.filter((m) => m.status === "conflicted").length;
}

/** Discard a specific pending mutation (e.g. user dismisses a conflict). */
export async function discardMutation(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("pendingMutations", id);
}
