/**
 * Documentation: Uploads routes.
 *
 * - Declares the Hono routes and middleware chain for R2-backed media uploads for avatars and product images. This route set is mounted from `/uploads` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /avatar, POST /product-photo.
 * - Primary exports: uploadRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { badRequest, ok } from "../../lib/response";
import { uploadFile } from "../../lib/storage";
import type { AppBindings } from "../../types/app-context";

export const uploadRoutes = new Hono<AppBindings>();

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

uploadRoutes.post("/avatar", authenticate, async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return badRequest(c, "Missing file field.");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return badRequest(c, `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  }
  if (file.size > MAX_SIZE) {
    return badRequest(c, `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024} MB.`);
  }

  const ext = EXT_MAP[file.type] ?? "jpg";
  const data = await file.arrayBuffer();
  const result = await uploadFile("avatars", data, file.type, ext, {
    bucket: c.env?.UPLOADS_BUCKET ?? c.env?.FILES,
    publicUrl: c.env?.R2_PUBLIC_URL,
  });

  return ok(c, { url: result.url });
});

uploadRoutes.post("/product-photo", authenticate, async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];

  if (!(file instanceof File)) {
    return badRequest(c, "Missing file field.");
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return badRequest(c, `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(", ")}`);
  }
  if (file.size > MAX_SIZE) {
    return badRequest(c, `File too large. Maximum size is ${MAX_SIZE / 1024 / 1024} MB.`);
  }

  const ext = EXT_MAP[file.type] ?? "jpg";
  const data = await file.arrayBuffer();
  const result = await uploadFile("products", data, file.type, ext, {
    bucket: c.env?.UPLOADS_BUCKET ?? c.env?.FILES,
    publicUrl: c.env?.R2_PUBLIC_URL,
  });

  return ok(c, { url: result.url });
});

