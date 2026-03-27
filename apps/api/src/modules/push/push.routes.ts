import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { pushController } from "./push.controller";
import type { AppBindings } from "../../types/app-context";

export const pushRoutes = new Hono<AppBindings>();

pushRoutes.post("/subscribe", authenticate, pushController.subscribe);
pushRoutes.post("/unsubscribe", authenticate, pushController.unsubscribe);
