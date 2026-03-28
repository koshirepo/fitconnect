/**
 * Documentation: Auth controller.
 *
 * - Owns the HTTP boundary for platform authentication, session lifecycle, bootstrap, and password recovery, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: authController.
 */
import type { Context } from "hono";
import { authService } from "./auth.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { ok, okMessage, conflict, unauthorized, forbidden, badRequest } from "../../lib/response";
import {
  bootstrapSchema,
  loginSchema,
  refreshTokenSchema,
  createPlatformUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const authController = {
  /**
   * Handle the `bootstrap` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async bootstrap(c: AppContext) {
    const parsed = await parseBody(c, bootstrapSchema);
    if (!parsed.ok) return parsed.response;

    const result = await authService.bootstrap(parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "User",
      entityId: result.data.user.id,
      actorId: result.data.user.id,
      metadata: { bootstrapped: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `login` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async login(c: AppContext) {
    const parsed = await parseBody(c, loginSchema);
    if (!parsed.ok) return parsed.response;

    const result = await authService.login(parsed.data);
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : unauthorized(c, result.error!);
    }

    await auditLog({
      action: "LOGIN",
      entity: "User",
      entityId: result.data.user.id,
      actorId: result.data.user.id,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `refresh` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async refresh(c: AppContext) {
    const parsed = await parseBody(c, refreshTokenSchema);
    if (!parsed.ok) return parsed.response;

    const result = await authService.refresh(parsed.data.refreshToken);
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : unauthorized(c, result.error!);
    }

    return ok(c, result.data);
  },

  /**
   * Handle the `logout` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async logout(c: AppContext) {
    const parsed = await parseBody(c, refreshTokenSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("optionalAuthUser")?.id;
    await authService.logout(parsed.data.refreshToken, userId);

    if (userId) {
      await auditLog({
        action: "LOGOUT",
        entity: "User",
        entityId: userId,
        actorId: userId,
        ip: c.req.header("x-forwarded-for") ?? undefined,
      });
    }

    return okMessage(c, "Logged out successfully.");
  },

  /**
   * Handle the `me` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async me(c: AppContext) {
    const user = c.get("authUser");
    const result = await authService.getMe(user.id);
    if ("error" in result) return unauthorized(c, result.error!);

    return ok(c, result.data);
  },

  /**
   * Handle the `create platform user` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async createPlatformUser(c: AppContext) {
    const parsed = await parseBody(c, createPlatformUserSchema);
    if (!parsed.ok) return parsed.response;

    const result = await authService.createPlatformUser(parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "User",
      entityId: result.data.user.id,
      actorId: c.get("authUser").id,
      metadata: { role: parsed.data.role },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `forgot password` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async forgotPassword(c: AppContext) {
    const parsed = await parseBody(c, forgotPasswordSchema);
    if (!parsed.ok) return parsed.response;

    await authService.forgotPassword(parsed.data);
    return okMessage(c, "If that email is registered, a reset link has been sent.");
  },

  /**
   * Handle the `reset password` HTTP action for the auth module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async resetPassword(c: AppContext) {
    const parsed = await parseBody(c, resetPasswordSchema);
    if (!parsed.ok) return parsed.response;

    const result = await authService.resetPassword(parsed.data);
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    return okMessage(c, "Password reset successfully. You can now log in.");
  },
};
