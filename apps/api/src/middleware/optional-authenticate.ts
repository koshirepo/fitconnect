import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../auth/jwt";
import type { AppBindings } from "../types/app-context";

/**
 * Optional authenticate — extracts user from JWT claims if present (no DB query).
 */
export const optionalAuthenticate = createMiddleware<AppBindings>(async (c, next) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    c.set("optionalAuthUser", null);
    await next();
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    c.set("optionalAuthUser", null);
    await next();
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    c.set("optionalAuthUser", {
      id: payload.userId,
      name: "",
      email: "",
      platformRole: payload.platformRole,
      tenants: payload.tenants,
    });
  } catch {
    c.set("optionalAuthUser", null);
  }

  await next();
});
