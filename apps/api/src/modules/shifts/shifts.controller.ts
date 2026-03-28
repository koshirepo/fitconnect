/**
 * Documentation: Shifts controller.
 *
 * - Owns the HTTP boundary for tenant shift management, including request parsing, service invocation, response shaping, and audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared API response envelope.
 * - Primary exports: shiftController.
 */
import type { Context } from "hono";
import { shiftService } from "./shifts.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okMessage, okPaginated, conflict, notFound, badRequest } from "../../lib/response";
import { createShiftSchema, updateShiftSchema } from "./shifts.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const shiftController = {
  async create(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createShiftSchema);
    if (!parsed.ok) return parsed.response;

    const result = await shiftService.create(tenantId, parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Shift",
      entityId: result.data.shift.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async list(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const includeInactive = c.req.query("includeInactive") === "true";

    const { data, total } = await shiftService.list(tenantId, page, limit, includeInactive);
    return okPaginated(c, data, { page, limit, total });
  },

  async getById(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const shiftId = c.req.param("shiftId")!;

    const result = await shiftService.getById(tenantId, shiftId);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  async update(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const shiftId = c.req.param("shiftId")!;
    const parsed = await parseBody(c, updateShiftSchema);
    if (!parsed.ok) return parsed.response;

    const result = await shiftService.update(tenantId, shiftId, parsed.data);
    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      if (result.status === 400) return badRequest(c, result.error!);
      return conflict(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "Shift",
      entityId: shiftId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async delete(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const shiftId = c.req.param("shiftId")!;

    const result = await shiftService.delete(tenantId, shiftId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Shift",
      entityId: shiftId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Shift deleted.");
  },
};