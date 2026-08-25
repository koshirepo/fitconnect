/**
 * Documentation: Audit controller.
 *
 * - Owns the HTTP boundary for audit log querying for privileged users, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: auditController.
 */
import type { Context } from "hono";
import { auditService } from "./audit.service";
import { parsePagination } from "../../lib/pagination";
import { okPaginated } from "../../lib/response";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const auditController = {
  /**
   * Handle the `list platform logs` HTTP action for the audit module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listPlatformLogs(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const entity = c.req.query("entity");
    const action = c.req.query("action");

    const { data, total } = await auditService.listPlatformLogs(page, limit, { entity, action });
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `list tenant logs` HTTP action for the audit module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listTenantLogs(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);

    const { data, total } = await auditService.listTenantLogs(tenantId, page, limit);
    return okPaginated(c, data, { page, limit, total });
  },
};
