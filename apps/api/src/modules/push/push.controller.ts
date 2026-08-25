/**
 * Documentation: Push controller.
 *
 * - Owns the HTTP boundary for browser push subscription lifecycle and notification delivery, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: pushController.
 */
import type { Context } from "hono";
import { pushService } from "./push.service";
import { parseBody } from "../../lib/http";
import { ok, okMessage, badRequest } from "../../lib/response";
import { pushSubscribeSchema } from "./push.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const pushController = {
  /**
   * Handle the `subscribe` HTTP action for the push module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async subscribe(c: AppContext) {
    const parsed = await parseBody(c, pushSubscribeSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("authUser").id;
    const result = await pushService.subscribe(userId, parsed.data);
    return ok(c, result.data, 201);
  },

  /**
   * Handle the `unsubscribe` HTTP action for the push module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async unsubscribe(c: AppContext) {
    const body = await c.req.json<{ endpoint?: string }>().catch(() => ({ endpoint: undefined }));
    if (!body.endpoint) return badRequest(c, "Missing endpoint.");

    await pushService.unsubscribe(body.endpoint);
    return okMessage(c, "Unsubscribed.");
  },
};
