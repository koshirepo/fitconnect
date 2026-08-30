/**
 * Documentation: Public routes.
 *
 * - Declares the Hono routes and middleware chain for public gym discovery and tenant profile exposure. This route set is mounted from `/public` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /branding, GET /store, GET /store/products/:productId, GET /social, GET /gyms, GET /gyms/:slug, GET /signup/options, POST /signup, POST /signup/verify, GET /id-card/:token.
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
/** The gym's shop window. Browsing needs no account; buying still does. */
publicRoutes.get("/store", publicController.getTenantStore);
publicRoutes.get("/store/products/:productId", publicController.getTenantStoreProduct);
/**
 * Reserving from the shop window, without an account.
 *
 * Unauthenticated by definition — the buyer has no account, which is the point.
 * What protects it is the same set the public signup relies on: the gym is
 * fixed by the request host, every price is read from the database rather than
 * the request, no stock moves until a coach or an admin hands the goods over,
 * and the per-IP rate limit below caps how fast anyone can write rows.
 */
publicRoutes.post("/store/orders", rateLimitSignup, publicController.placeGuestOrder);
publicRoutes.post("/store/orders/lookup", rateLimitSignup, publicController.lookupGuestOrder);
/** Likes and comments on the gym itself. Reading is open; writing needs an account. */
publicRoutes.get("/social", publicController.getTenantSocial);
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
