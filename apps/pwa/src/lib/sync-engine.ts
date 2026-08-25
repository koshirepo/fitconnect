import { getDB, type GmsDB } from "./offline-db";
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
 * - Every attempt carries the mutation's `Idempotency-Key`, so a write the
 *   server accepted before the response was lost is recognised as a repeat
 *   rather than applied twice. This is what stops a flaky connection from
 *   producing two payments for one collection.
 * - 4xx (except 409) = permanent failure → kept and marked failed, never
 *   deleted: work someone believes they did has to remain visible.
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
    // Rows already marked conflicted or failed are waiting on a human, not
    // on the network. Replaying them would loop forever.
    const mutations = (await db.getAll("pendingMutations")).filter(
      (mutation) => !mutation.status,
    );
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
            // Same key on every attempt, so a write the server already
            // accepted before the response was lost is recognised as a
            // repeat instead of being applied a second time.
            ...(mutation.idempotencyKey
              ? { "Idempotency-Key": mutation.idempotencyKey }
              : {}),
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
          // The server will never accept this. Keep the row and mark it so
          // the person who made the change can see that it did not land —
          // deleting it loses work they believe they did.
          await markFailed(db, mutation, describeError(err, status));
          failed++;
          continue;
        }

        // 5xx / network — transient, increment retries
        const retries = mutation.retries + 1;
        if (retries >= MAX_RETRIES) {
          await markFailed(
            db,
            mutation,
            "Could not reach the server after several attempts.",
          );
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

/** Best available description of why the server refused a write. */
function describeError(err: unknown, status: number) {
  const data = (err as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data;
  return data?.error?.message ?? `The server rejected this change (${status}).`;
}

/**
 * Keep a write that will never succeed, marked with why.
 *
 * Deleting it was the old behaviour and the reason a member added on a bad
 * connection could disappear with nothing on screen to say so.
 */
/** One queued write, as stored. */
type PendingMutation = GmsDB["pendingMutations"]["value"];

async function markFailed(
  db: Awaited<ReturnType<typeof getDB>>,
  mutation: PendingMutation,
  error: string,
) {
  const tx = db.transaction("pendingMutations", "readwrite");
  await tx.store.put({
    ...mutation,
    status: "failed" as const,
    error,
    failedAt: Date.now(),
  });
  await tx.done;
}

/**
 * Count of mutations still waiting to sync.
 *
 * Excludes rows already parked for a person to deal with — counting those
 * as pending would leave the status pill stuck on a number that retrying
 * can never clear.
 */
export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("pendingMutations");
  return all.filter((mutation) => !mutation.status).length;
}

/** Writes the server refused, or that ran out of retries. */
export async function getFailedMutations(): Promise<PendingMutation[]> {
  const db = await getDB();
  const all = await db.getAll("pendingMutations");
  return all.filter((mutation) => mutation.status === "failed");
}

export async function getFailedCount(): Promise<number> {
  return (await getFailedMutations()).length;
}

/**
 * Put a failed write back in the queue.
 *
 * The retry counter resets but the idempotency key does not, so if the
 * original attempt did reach the server the retry still cannot double it.
 */
export async function retryMutation(id: number): Promise<void> {
  const db = await getDB();
  const mutation = await db.get("pendingMutations", id);
  if (!mutation) return;
  const { status: _status, error: _error, failedAt: _failedAt, ...rest } = mutation;
  await db.put("pendingMutations", { ...rest, retries: 0 });
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
