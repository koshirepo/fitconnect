/**
 * Documentation: Public routes.
 *
 * - Declares the Hono routes and middleware chain for public gym discovery and tenant profile exposure. This route set is mounted from `/public` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /gyms, GET /gyms/:slug, GET /signup/options, POST /signup, POST /signup/verify, GET /id-card/:token.
 * - Primary exports: publicRoutes.
 */
import { Hono } from "hono";
import type { AppBindings } from "../../types/app-context";
import { publicController } from "./public.controller";
import { signupController } from "./signup.controller";
import { idCardController } from "./id-card.controller";
import { rateLimitSignup, verifyTurnstile } from "../../middleware/abuse-guard";

export const publicRoutes = new Hono<AppBindings>();

// No authentication required — these are public endpoints

publicRoutes.get("/branding", publicController.getTenantBranding);
publicRoutes.get("/gyms", publicController.listGyms);
publicRoutes.get("/gyms/resolve", publicController.getTenantByHost);
publicRoutes.get("/gyms/:slug", publicController.getTenantBySlug);

/**
 * Self-signup. Unauthenticated by definition — the caller has no account yet,
 * which is the entire point. What protects these is the gym being fixed by the
 * request host, every price being read from the database, the payment settling
 * only against a Razorpay signature, and the two guards below: a per-IP rate
 * limit on volume, and Turnstile on whether there is a browser here at all.
 * Both are inert until configured, so an unconfigured deployment behaves
 * exactly as it did before they existed.
 */
publicRoutes.get("/signup/options", signupController.getOptions);
publicRoutes.post("/signup", rateLimitSignup, verifyTurnstile, signupController.register);
publicRoutes.post("/signup/verify", rateLimitSignup, signupController.verify);

/**
 * A member's ID card. Unauthenticated because the point is that it opens
 * from a WhatsApp message; the unguessable token in the path is what stands
 * in for a session.
 */
publicRoutes.get("/id-card/:token", idCardController.getCard);
