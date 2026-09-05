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
import { rateLimitSignup, rateLimitLogin } from "../../middleware/abuse-guard";
import { authController } from "./auth.controller";
import { passkeyController } from "./passkeys.controller";
import type { AppBindings } from "../../types/app-context";

export const authRoutes = new Hono<AppBindings>();

// The unauthenticated entry points. Each one either verifies a password (~0.3s
// of CPU at 12 bcrypt rounds) or accepts a bearer token to trade, so all three
// are worth guessing at and all three are expensive to guess at.
authRoutes.post("/login", rateLimitLogin, authController.login);
authRoutes.post("/refresh", rateLimitLogin, authController.refresh);
authRoutes.post("/logout", optionalAuthenticate, authController.logout);
authRoutes.get("/me", authenticate, authController.me);
authRoutes.post(
  "/platform-users",
  authenticate,
  requirePermissions(Permission.PLATFORM_USERS_CREATE),
  authController.createPlatformUser,
);
/**
 * Passkeys.
 *
 * Registration needs a session — a key is being added to an account somebody is
 * already in. Sign-in cannot have one, which is the entire point, so those two
 * carry the same per-IP limit every other anonymous write here does. What makes
 * them safe is not the limit: it is that a signature can only be produced by a
 * private key this server has never seen and cannot leak.
 */
authRoutes.get("/passkeys", authenticate, passkeyController.list);
authRoutes.delete("/passkeys/:passkeyId", authenticate, passkeyController.remove);
authRoutes.post("/passkeys/register/options", authenticate, passkeyController.registerOptions);
authRoutes.post("/passkeys/register/verify", authenticate, passkeyController.registerVerify);
authRoutes.post("/passkeys/login/options", rateLimitSignup, passkeyController.loginOptions);
authRoutes.post("/passkeys/login/verify", rateLimitSignup, passkeyController.loginVerify);

authRoutes.post("/forgot-password", rateLimitSignup, authController.forgotPassword);
authRoutes.post("/reset-password", rateLimitLogin, authController.resetPassword);
