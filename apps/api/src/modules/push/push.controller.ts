import type { Context } from "hono";
import { pushService } from "./push.service";
import { parseBody } from "../../lib/http";
import { ok, okMessage, badRequest } from "../../lib/response";
import { pushSubscribeSchema } from "./push.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const pushController = {
  async subscribe(c: AppContext) {
    const parsed = await parseBody(c, pushSubscribeSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("authUser").id;
    const result = await pushService.subscribe(userId, parsed.data);
    return ok(c, result.data, 201);
  },

  async unsubscribe(c: AppContext) {
    const body = await c.req.json<{ endpoint?: string }>().catch(() => ({ endpoint: undefined }));
    if (!body.endpoint) return badRequest(c, "Missing endpoint.");

    await pushService.unsubscribe(body.endpoint);
    return okMessage(c, "Unsubscribed.");
  },
};
