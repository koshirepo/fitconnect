import type { Context } from "hono";
import { settingsService } from "./settings.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { ok, okMessage, conflict, notFound } from "../../lib/response";
import { updateSettingsSchema, createChargeSchema, updateChargeSchema } from "./settings.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const settingsController = {
  // ─── Settings ───────────────────────────────────────────────────────────────

  async getSettings(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await settingsService.getSettings(tenantId);
    c.header("Cache-Control", "private, max-age=300");
    return ok(c, result.data);
  },

  async updateSettings(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, updateSettingsSchema);
    if (!parsed.ok) return parsed.response;

    const result = await settingsService.updateSettings(tenantId, parsed.data);

    await auditLog({
      action: "SETTINGS_CHANGE",
      entity: "TenantSettings",
      entityId: tenantId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  // ─── Charges ────────────────────────────────────────────────────────────────

  async listCharges(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await settingsService.listCharges(tenantId);
    c.header("Cache-Control", "private, max-age=300");
    return ok(c, result.data);
  },

  async createCharge(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createChargeSchema);
    if (!parsed.ok) return parsed.response;

    const result = await settingsService.createCharge(tenantId, parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "TenantCharge",
      entityId: result.data.charge.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async updateCharge(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const chargeId = c.req.param("chargeId")!;
    const parsed = await parseBody(c, updateChargeSchema);
    if (!parsed.ok) return parsed.response;

    const result = await settingsService.updateCharge(tenantId, chargeId, parsed.data);

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return conflict(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "TenantCharge",
      entityId: chargeId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async deleteCharge(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const chargeId = c.req.param("chargeId")!;

    const result = await settingsService.deleteCharge(tenantId, chargeId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "TenantCharge",
      entityId: chargeId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Charge deleted.");
  },
};
