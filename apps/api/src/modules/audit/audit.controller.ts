import type { Context } from "hono";
import { auditService } from "./audit.service";
import { parsePagination } from "../../lib/pagination";
import { okPaginated } from "../../lib/response";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const auditController = {
  async listPlatformLogs(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const entity = c.req.query("entity");
    const action = c.req.query("action");

    const { data, total } = await auditService.listPlatformLogs(page, limit, { entity, action });
    return okPaginated(c, data, { page, limit, total });
  },

  async listTenantLogs(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);

    const { data, total } = await auditService.listTenantLogs(tenantId, page, limit);
    return okPaginated(c, data, { page, limit, total });
  },
};
