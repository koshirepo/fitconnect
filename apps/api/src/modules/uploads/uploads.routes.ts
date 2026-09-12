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

/**
 * Serve a stored object.
 *
 * A wildcard rather than `:folder/:filename`: an exercise clip is filed under
 * `exercise/girl/Abs/Sit-ups.mp4`, four segments deep, and a two-segment route
 * simply never matched it. Every segment is decoded on its own, so a key keeps
 * its shape and a name with a space or a bracket still resolves.
 *
 * Range requests are passed to R2 and answered with a 206, because a video
 * player needs them: without one the browser can play only from the start, and
 * dragging the scrubber re-downloads the whole file. Images are unaffected —
 * a request with no Range header still gets a plain 200.
 */
uploadRoutes.get("/file/*", async (c) => {
  const bucket = c.env?.UPLOADS_BUCKET ?? c.env?.FILES;

  if (!bucket) {
    return c.text("Storage bucket is not configured.", 500);
  }

  const raw = new URL(c.req.url).pathname.split("/uploads/file/")[1] ?? "";
  const segments = raw.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  // No empty, "." or ".." segments: a key is a stored path, never a traversal.
  if (segments.length === 0 || segments.some((s) => !s || s === "." || s === "..")) {
    return c.text("File not found.", 404);
  }

  const key = segments.join("/");
  const rangeHeader = c.req.header("range");
  const object = await bucket.get(key, rangeHeader ? { range: c.req.raw.headers } : undefined);
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
  // Advertised even on a plain 200, which is how a player learns it may seek.
  headers.set("accept-ranges", "bytes");

  const body = "body" in object ? object.body : null;
  const part = object.range as { offset?: number; length?: number } | undefined;

  if (rangeHeader && part) {
    const offset = part.offset ?? 0;
    const length = part.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(body, { status: 206, headers });
  }

  return new Response(body, { headers });
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

