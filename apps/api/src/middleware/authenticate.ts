import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../auth/jwt";
import { unauthorized } from "../lib/response";
import type { AppBindings } from "../types/app-context";



/**
 * Authenticate middleware — validates JWT and extracts user info from claims.
 * No database query — all data comes from the signed token.
 */


export const authenticate = createMiddleware<AppBindings>(async (c, next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return unauthorized(c, "Missing Bearer token.");
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return unauthorized(c, "Missing Bearer token.");
  }

  try {
    const payload = await verifyAccessToken(token);

    c.set("authUser", {
      id: payload.userId,
      name: "",
      email: "",
      platformRole: payload.platformRole,
      tenants: payload.tenants,
    });
    await next();
  } catch {
    return unauthorized(c, "Invalid or expired token.");
  }
});
