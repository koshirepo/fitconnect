import { Hono } from "hono";
import { publicController } from "./public.controller";

export const publicRoutes = new Hono();

// No authentication required — these are public endpoints

publicRoutes.get("/gyms", publicController.listGyms);
publicRoutes.get("/gyms/:slug", publicController.getTenantBySlug);
