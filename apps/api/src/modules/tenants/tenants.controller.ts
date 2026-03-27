import type { Context } from "hono";
import { tenantService } from "./tenants.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okPaginated, conflict, notFound } from "../../lib/response";
import {
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  recordPlatformPaymentSchema,
} from "./tenants.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const tenantController = {
  async create(c: AppContext) {
    const parsed = await parseBody(c, createTenantSchema);
    if (!parsed.ok) return parsed.response;

    const result = await tenantService.create(parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Tenant",
      entityId: result.data.tenant.id,
      actorId: c.get("authUser").id,
      tenantId: result.data.tenant.id,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async list(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const { data, total } = await tenantService.list(page, limit);
    return okPaginated(c, data, { page, limit, total });
  },

  async getById(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    console.log("Fetching tenant with ID:", tenantId); // Debug log
    const result = await tenantService.getById(tenantId);
    if ("error" in result) return notFound(c, result.error!);
    return ok(c, result.data);
  },

  async update(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, updateTenantSchema);
    if (!parsed.ok) return parsed.response;

    const result = await tenantService.update(tenantId, parsed.data);

    await auditLog({
      action: "UPDATE",
      entity: "Tenant",
      entityId: tenantId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async updateStatus(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, updateTenantStatusSchema);
    if (!parsed.ok) return parsed.response;

    const result = await tenantService.updateStatus(tenantId, parsed.data.status);

    await auditLog({
      action: "SETTINGS_CHANGE",
      entity: "Tenant",
      entityId: tenantId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { status: parsed.data.status },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async recordPlatformPayment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, recordPlatformPaymentSchema);
    if (!parsed.ok) return parsed.response;

    const authUser = c.get("authUser");
    const result = await tenantService.recordPlatformPayment(tenantId, parsed.data, authUser.id);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "PlatformPayment",
      entityId: result.data!.payment.id,
      actorId: authUser.id,
      tenantId,
      metadata: { amount: parsed.data.amount, extendsUntil: parsed.data.extendsUntil },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async listPlatformPayments(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const result = await tenantService.listPlatformPayments(tenantId, page, limit);
    if ("error" in result) return notFound(c, result.error!);
    return okPaginated(c, result.data, { page, limit, total: result.total! });
  },
};
