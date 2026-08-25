import { getDB } from "./offline-db";

/**
 * Clear all cached entity data and API response cache.
 * Call on tenant switch to prevent cross-tenant data leaks.
 */
export async function clearTenantCache() {
  const db = await getDB();
  await Promise.all([
    db.clear("members"),
    db.clear("payments"),
    db.clear("badges"),
    db.clear("apiCache"),
  ]);
}
