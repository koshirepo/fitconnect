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
  url: string;
}

type UploadOptions = {
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
  options: UploadOptions = {},
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
    url: `${publicUrl.replace(/\/+$/u, "")}/${key}`,
  };
}

