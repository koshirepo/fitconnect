/**
 * Documentation: Public routes.
 *
 * - Declares the Hono routes and middleware chain for public gym discovery and tenant profile exposure. This route set is mounted from `/public` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /gyms, GET /gyms/:slug, GET /signup/options, POST /signup, POST /signup/verify, GET /id-card/:token.
 * - Primary exports: publicRoutes.
 */
import { Hono } from "hono";
import { publicController } from "./public.controller";
import { signupController } from "./signup.controller";
import { idCardController } from "./id-card.controller";

export const publicRoutes = new Hono();

// No authentication required — these are public endpoints

publicRoutes.get("/branding", publicController.getTenantBranding);
publicRoutes.get("/gyms", publicController.listGyms);
publicRoutes.get("/gyms/resolve", publicController.getTenantByHost);
publicRoutes.get("/gyms/:slug", publicController.getTenantBySlug);

/**
 * Self-signup. Unauthenticated by definition — the caller has no account yet,
 * which is the entire point. What protects these is the gym being fixed by the
 * request host, every price being read from the database, and the payment
 * settling only against a Razorpay signature.
 */
publicRoutes.get("/signup/options", signupController.getOptions);
publicRoutes.post("/signup", signupController.register);
publicRoutes.post("/signup/verify", signupController.verify);

/**
 * A member's ID card. Unauthenticated because the point is that it opens
 * from a WhatsApp message; the unguessable token in the path is what stands
 * in for a session.
 */
publicRoutes.get("/id-card/:token", idCardController.getCard);
