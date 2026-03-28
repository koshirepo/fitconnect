/**
 * Documentation: Settings controller.
 *
 * - Owns the HTTP boundary for tenant settings and extra charge configuration, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: settingsController.
 */
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

  /**
   * Handle the `get settings` HTTP action for the settings module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getSettings(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await settingsService.getSettings(tenantId);
    c.header("Cache-Control", "private, max-age=300");
    return ok(c, result.data);
  },

  /**
   * Handle the `update settings` HTTP action for the settings module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
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

  /**
   * Handle the `list charges` HTTP action for the settings module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listCharges(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await settingsService.listCharges(tenantId);
    c.header("Cache-Control", "private, max-age=300");
    return ok(c, result.data);
  },

  /**
   * Handle the `create charge` HTTP action for the settings module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
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

  /**
   * Handle the `update charge` HTTP action for the settings module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
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

  /**
   * Handle the `delete charge` HTTP action for the settings module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
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
