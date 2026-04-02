/**
 * Documentation: Auth routes.
 *
 * - Declares the Hono routes and middleware chain for platform authentication, session lifecycle, bootstrap, and password recovery. This route set is mounted from `/auth` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /bootstrap/super-admin, POST /login, POST /refresh, POST /logout, GET /me, POST /platform-users, POST /forgot-password, POST /reset-password.
 * - Primary exports: authRoutes.
 */
import { Hono } from "hono";
import { PlatformRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePlatformRoles } from "../../middleware/authorize";
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
  requirePlatformRoles([PlatformRole.SUPER_ADMIN]),
  authController.createPlatformUser,
);
authRoutes.post("/forgot-password", authController.forgotPassword);
authRoutes.post("/reset-password", authController.resetPassword);
