import { getDB } from "./offline-db";

/**
 * Store a File/Blob as an ArrayBuffer in IDB for later upload when online.
 * Returns the auto-incremented IDB key.
 */
export async function storeFileOffline(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const db = await getDB();
  return db.add("pendingFiles", {
    blob: buffer,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    createdAt: Date.now(),
  });
}

/**
 * Retrieve a stored file and reconstruct it as a File object.
 */
export async function getOfflineFile(id: number): Promise<File | null> {
  const db = await getDB();
  const entry = await db.get("pendingFiles", id);
  if (!entry) return null;
  return new File([entry.blob], entry.filename, { type: entry.contentType });
}

/**
 * Delete a pending file after it has been successfully uploaded.
 */
export async function deleteOfflineFile(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("pendingFiles", id);
}
