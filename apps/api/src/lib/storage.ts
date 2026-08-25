/**
 * Documentation: R2 upload helper.
 *
 * - Validates folder and extension segments before writing binary data into Cloudflare R2 and returns the final public URL.
 * - Upload routes use this helper so storage-path safety and URL construction stay consistent across asset types.
 * - Primary exports: uploadFile, UploadResult.
 */
import { randomUUID } from "node:crypto";

const FOLDER_PATTERN = /^[A-Za-z0-9_-]+$/u;
const EXTENSION_PATTERN = /^[A-Za-z0-9]+$/u;

export interface UploadResult {
  key: string;
  url: string;
}

export type StorageOptions = {
  bucket?: R2Bucket;
  publicUrl?: string;
};

/**
 * Utility helper for the storage module that owns the `assert safe segment` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function assertSafeSegment(value: string, label: string, pattern: RegExp) {
  if (value === "." || value === ".." || !pattern.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

/**
 * Utility helper for the storage module that owns the `upload file` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export async function uploadFile(
  folder: string,
  data: ArrayBuffer,
  contentType: string,
  ext: string,
  options: StorageOptions = {},
): Promise<UploadResult> {
  assertSafeSegment(folder, "folder", FOLDER_PATTERN);

  const normalizedExt = ext.toLowerCase().replace(/^\.+/u, "");
  assertSafeSegment(normalizedExt, "file extension", EXTENSION_PATTERN);

  const { bucket, publicUrl } = options;
  if (!bucket) {
    throw new Error("An R2 bucket binding is required for uploads.");
  }
  if (!publicUrl) {
    throw new Error("R2_PUBLIC_URL is required for uploads.");
  }

  const key = `${folder}/${randomUUID()}.${normalizedExt}`;
  await bucket.put(key, data, {
    httpMetadata: { contentType },
  });

  return {
    key,
    url: `${publicUrl.replace(/\/+$/u, "")}/${key}`,
  };
}

function isSafeObjectKey(key: string) {
  if (!key) {
    return false;
  }

  const segments = key.split("/");
  return !segments.some((segment) => !segment || segment === "." || segment === "..");
}

function resolveObjectKeyFromProxyUrl(file: URL) {
  const match = file.pathname.match(/\/uploads\/file\/(.+)$/u);
  if (!match?.[1]) {
    return null;
  }

  const key = decodeURIComponent(match[1]);
  return isSafeObjectKey(key) ? key : null;
}

function resolveObjectKeyFromPublicUrl(file: URL, publicUrl: string) {
  let base: URL;

  try {
    base = new URL(publicUrl);
  } catch {
    return null;
  }

  if (file.origin !== base.origin) {
    return null;
  }

  const basePath = base.pathname.replace(/\/+$/u, "");
  const prefix = basePath ? `${basePath}/` : "/";

  if (!file.pathname.startsWith(prefix)) {
    return null;
  }

  const key = decodeURIComponent(file.pathname.slice(prefix.length));
  if (!isSafeObjectKey(key)) {
    return null;
  }

  return key;
}

function resolveObjectKeyFromUrl(fileUrl: string, publicUrl?: string) {
  let file: URL;

  try {
    file = new URL(fileUrl);
  } catch {
    return null;
  }

  const proxyKey = resolveObjectKeyFromProxyUrl(file);
  if (proxyKey) {
    return proxyKey;
  }

  if (!publicUrl) {
    return null;
  }

  const key = resolveObjectKeyFromPublicUrl(file, publicUrl);
  if (!key) {
    return null;
  }

  return key;
}

/**
 * Utility helper for the storage module that owns the `delete file by public URL` step.
 * Keeping URL-to-key resolution here ensures upload and cleanup use the same public-base contract.
 */
export async function deleteFileByUrl(
  fileUrl: string,
  options: StorageOptions = {},
): Promise<{ deleted: boolean; key?: string }> {
  const { bucket, publicUrl } = options;
  if (!bucket) {
    return { deleted: false };
  }

  const key = resolveObjectKeyFromUrl(fileUrl, publicUrl);
  if (!key) {
    return { deleted: false };
  }

  await bucket.delete(key);
  return { deleted: true, key };
}

