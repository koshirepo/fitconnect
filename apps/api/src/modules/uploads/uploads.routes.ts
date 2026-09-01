/**
 * Documentation: Uploads routes.
 *
 * - Declares the Hono routes and middleware chain for R2-backed media uploads for logos, avatars, and product images. This route set is mounted from `/uploads` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /logo, POST /avatar, POST /product-photo.
 * - Primary exports: uploadRoutes.
 */
import { Hono, type Context } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { badRequest, ok } from "../../lib/response";
import { publicAssetUrl, uploadFile } from "../../lib/storage";
import { requirePermissions } from "../../middleware/authorize";
import { Permission } from "@fitconnect/shared/types/permissions";
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

type AppContext = Context<AppBindings>;

function getAssetUrl(c: AppContext, key: string) {
  return publicAssetUrl(c.req.url, key);
}

async function handleUpload(c: AppContext, folder: string) {
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
  const result = await uploadFile(folder, data, file.type, ext, {
    bucket: c.env?.UPLOADS_BUCKET ?? c.env?.FILES,
    publicUrl: c.env?.R2_PUBLIC_URL,
  });

  return ok(c, { url: getAssetUrl(c, result.key) });
}

uploadRoutes.get("/file/:folder/:filename", async (c) => {
  const folder = c.req.param("folder");
  const filename = c.req.param("filename");
  const bucket = c.env?.UPLOADS_BUCKET ?? c.env?.FILES;

  if (!bucket) {
    return c.text("Storage bucket is not configured.", 500);
  }

  const key = `${folder}/${filename}`;
  const object = await bucket.get(key);
  if (!object) {
    /**
     * Fetch it from the bucket's public address before giving up.
     *
     * A developer runs against a copy of the real database — real members,
     * real gyms, real photo URLs — with an empty local bucket, so every avatar
     * and logo resolves to a 404 here and the product renders with initials
     * where the pictures should be.
     *
     * The bytes are streamed rather than redirected to on purpose. The public
     * bucket sends no CORS headers, so a redirect would still fail for the one
     * caller that matters most: the ID card, which fetches its images to inline
     * them into a single SVG. Passing them through this origin sidesteps that
     * entirely. In production the bucket holds the object and none of this runs.
     */
    const publicBase = c.env?.R2_PUBLIC_URL;
    if (publicBase) {
      const upstream = await fetch(`${publicBase.replace(/\/+$/, "")}/${key}`);
      if (upstream.ok) {
        const headers = new Headers();
        const type = upstream.headers.get("content-type");
        if (type) headers.set("content-type", type);
        // Short, unlike the immutable cache below: this is a stand-in for an
        // object the bucket does not have, and it should stop being served the
        // moment the bucket does.
        headers.set("cache-control", "public, max-age=300");
        return new Response(upstream.body, { headers });
      }
    }

    return c.text("File not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, {
    headers,
  });
});

uploadRoutes.post("/logo", authenticate, requirePermissions(Permission.UPLOADS_WRITE), async (c) => {
  return handleUpload(c, "logos");
});

uploadRoutes.post("/avatar", authenticate, requirePermissions(Permission.UPLOADS_WRITE), async (c) => {
  return handleUpload(c, "avatars");
});

uploadRoutes.post("/product-photo", authenticate, requirePermissions(Permission.UPLOADS_WRITE), async (c) => {
  return handleUpload(c, "products");
});

