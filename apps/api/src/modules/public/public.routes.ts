/**
 * Documentation: Public routes.
 *
 * - Declares the Hono routes and middleware chain for public gym discovery and tenant profile exposure. This route set is mounted from `/public` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /gyms, GET /gyms/:slug.
 * - Primary exports: publicRoutes.
 */
import { Hono } from "hono";
import { publicController } from "./public.controller";

export const publicRoutes = new Hono();

// No authentication required — these are public endpoints

publicRoutes.get("/gyms", publicController.listGyms);
publicRoutes.get("/gyms/:slug", publicController.getTenantBySlug);
