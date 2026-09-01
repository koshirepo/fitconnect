/**
 * Documentation: Data-URL image intake for unauthenticated flows.
 *
 * - Holds the one shape an image may take when it arrives inside a request body rather than through `/uploads`, and the code that turns it into a stored file.
 * - Public signup flows need this because `/uploads` requires a session and their callers have none. Sending the bytes with the record they belong to means an image only ever lands in the bucket alongside a real membership or a real gym, instead of behind an open upload door.
 * - Both the size limit and the accepted formats match the authenticated upload endpoints, so a self-signed-up photo is subject to the same rules as one an admin uploads.
 * - Primary exports: DATA_URL_PATTERN, MAX_IMAGE_CHARS, dataUrlField, storeDataUrlImage.
 */
import { z } from "zod";
import type { Context } from "hono";
import { publicAssetUrl, uploadFile } from "./storage";

/** Base64 image payload, e.g. `data:image/jpeg;base64,/9j/4AAQ...`. */
export const DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

/** 5 MB of image, matching the authenticated upload endpoints. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Base64 costs about a third more than the bytes it encodes. */
export const MAX_IMAGE_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 128;

/** Extensions for the image types these flows admit. */
const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * A required image field, worded for whatever it depicts.
 *
 * The messages are passed in rather than fixed because "A photo is required"
 * is right for a member's face and wrong for a gym's logo, and an error a
 * person reads should name the thing they were actually asked for.
 */
export function dataUrlField(labels: { required: string; tooLarge: string; unsupported: string }) {
  return z
    // The `error` option covers a field that is absent or not a string at all,
    // which is what a form that skipped the picker actually sends. Without it
    // the caller is told "expected string, received undefined", which is true
    // and useless.
    .string({ error: labels.required })
    .min(1, labels.required)
    .max(MAX_IMAGE_CHARS, labels.tooLarge)
    .regex(DATA_URL_PATTERN, labels.unsupported);
}

/**
 * Store a data-URL image and return the URL the rest of the app reads it from.
 *
 * The `/uploads/file/...` form the authenticated upload endpoint hands back, so
 * an image that arrived this way behaves like any other from then on. Returns
 * null when the payload cannot be read; throws when the bucket rejects it, so a
 * caller can tell "bad input" from "storage is broken".
 */
export async function storeDataUrlImage(c: Context, folder: string, dataUrl: string) {
  const match = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;

  const [, contentType, base64] = match;
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const result = await uploadFile(
    folder,
    bytes.buffer,
    contentType,
    EXT_MAP[contentType] ?? "jpg",
    {
      bucket: c.env?.UPLOADS_BUCKET ?? c.env?.FILES,
      publicUrl: c.env?.R2_PUBLIC_URL,
    },
  );

  return publicAssetUrl(c.req.url, result.key);
}
