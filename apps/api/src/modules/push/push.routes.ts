/**
 * Documentation: Push routes.
 *
 * - Declares the Hono routes and middleware chain for browser push subscription lifecycle and notification delivery. This route set is mounted from `/push` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: POST /subscribe, POST /unsubscribe.
 * - Primary exports: pushRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { pushController } from "./push.controller";
import type { AppBindings } from "../../types/app-context";

export const pushRoutes = new Hono<AppBindings>();

pushRoutes.post("/subscribe", authenticate, pushController.subscribe);
pushRoutes.post("/unsubscribe", authenticate, pushController.unsubscribe);
