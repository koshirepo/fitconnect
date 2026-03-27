import { Hono } from "hono";
import { PlatformRole } from "../../shared/types/enums";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePlatformRoles } from "../../middleware/authorize";
import { authController } from "./auth.controller";
import type { AppBindings } from "../../types/app-context";

export const authRoutes = new Hono<AppBindings>();

authRoutes.post("/bootstrap/super-admin", authController.bootstrap);
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
