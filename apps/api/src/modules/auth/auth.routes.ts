/**
 * Documentation: Auth routes.
 *
 * - Declares the Hono routes and middleware chain for platform authentication, session lifecycle, bootstrap, and password recovery. This route set is mounted from `/auth` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /bootstrap/super-admin, POST /login, POST /refresh, POST /logout, GET /me, POST /platform-users, POST /forgot-password, POST /reset-password.
 * - Primary exports: authRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { rateLimitSignup } from "../../middleware/abuse-guard";
import { authController } from "./auth.controller";
import type { AppBindings } from "../../types/app-context";

export const authRoutes = new Hono<AppBindings>();

authRoutes.post("/login", authController.login);
authRoutes.post("/refresh", authController.refresh);
authRoutes.post("/logout", optionalAuthenticate, authController.logout);
authRoutes.get("/me", authenticate, authController.me);
authRoutes.post(
  "/platform-users",
  authenticate,
  requirePermissions(Permission.PLATFORM_USERS_CREATE),
  authController.createPlatformUser,
);
authRoutes.post("/forgot-password", rateLimitSignup, authController.forgotPassword);
authRoutes.post("/reset-password", authController.resetPassword);
