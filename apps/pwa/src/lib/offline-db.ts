import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface GmsDB extends DBSchema {
  members: {
    key: string;
    value: {
      id: string;
      tenantId: string;
      userId: string;
      name: string;
      email: string;
      phone?: string | null;
      role: string;
      status: string;
      avatarUrl?: string | null;
      joinedAt: string;
      cachedAt: number;
    };
    indexes: { "by-tenant": string };
  };
  payments: {
    key: string;
    value: {
      id: string;
      tenantId: string;
      amount: number;
      status: string;
      paidAt?: string | null;
      createdAt: string;
      memberName: string;
      cachedAt: number;
    };
    indexes: { "by-tenant": string };
  };
  badges: {
    key: string;
    value: {
      id: string;
      tenantId: string;
      name: string;
      color: string;
      icon?: string | null;
      isActive: boolean;
      cachedAt: number;
    };
    indexes: { "by-tenant": string };
  };
  pendingMutations: {
    key: number;
    value: {
      id?: number;
      url: string;
      method: "POST" | "PATCH" | "PUT" | "DELETE";
      body?: string;
      headers: Record<string, string>;
      createdAt: number;
      retries: number;
      /**
       * Stable per-write key, sent as `Idempotency-Key`. Survives every
       * retry of this mutation so a write the server already accepted is
       * recognised as a repeat rather than applied twice.
       */
      idempotencyKey?: string;
      /**
       * "conflicted" on 409, "failed" when the server refused it or it ran
       * out of retries. Both are kept rather than deleted: a write the
       * person made and lost has to be visible to them.
       */
      status?: "conflicted" | "failed";
      /** Why it failed, for the UI to show. */
      error?: string;
      failedAt?: number;
    };
  };
  apiCache: {
    key: string;
    value: {
      url: string;
      data: unknown;
      cachedAt: number;
      tenantId: string;
    };
    indexes: { "by-tenant": string };
  };
  pendingFiles: {
    key: number;
    value: {
      id?: number;
      blob: ArrayBuffer;
      filename: string;
      contentType: string;
      createdAt: number;
    };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<GmsDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<GmsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GmsDB>("gms-offline", 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const memberStore = db.createObjectStore("members", { keyPath: "id" });
          memberStore.createIndex("by-tenant", "tenantId");

          const paymentStore = db.createObjectStore("payments", { keyPath: "id" });
          paymentStore.createIndex("by-tenant", "tenantId");

          const badgeStore = db.createObjectStore("badges", { keyPath: "id" });
          badgeStore.createIndex("by-tenant", "tenantId");

          db.createObjectStore("pendingMutations", {
            keyPath: "id",
            autoIncrement: true,
          });

          db.createObjectStore("meta");
        }
        // v1 → v2: pendingMutations already has the right shape;
        // the "status" field is optional so no store migration needed.
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains("apiCache")) {
            const cacheStore = db.createObjectStore("apiCache", { keyPath: "url" });
            cacheStore.createIndex("by-tenant", "tenantId");
          }
        }
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains("pendingFiles")) {
            db.createObjectStore("pendingFiles", {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        }
      },
    }).catch((err) => {
      // Reset so the next call retries instead of returning a rejected promise forever
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}
