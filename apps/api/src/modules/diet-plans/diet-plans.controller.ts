/**
 * Documentation: Diet plan controller.
 *
 * - The HTTP boundary for a gym's diet plans: parse, delegate, and shape the reply.
 * - Reduces the caller's permissions to a `DietPlanAccess` once, so the service decides ownership without knowing what any permission is called.
 * - Writes are audited against the gym, as workout plans are.
 * - Primary exports: dietPlanController.
 */
import type { Context } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { dietPlanService, type DietPlanAccess } from "./diet-plans.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { conflict, forbidden, notFound, ok, okMessage, okPaginated } from "../../lib/response";
import {
  assignDietPlanSchema,
  createDietPlanSchema,
  updateDietPlanSchema,
} from "./diet-plans.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

function accessFor(c: AppContext): DietPlanAccess {
  const permissions = c.get("permissions");
  return {
    userId: c.get("authUser").id,
    role: c.get("tenantAccess")?.role,
    canCreateForOthers: permissions.has(Permission.DIET_PLANS_CREATE),
    canUpdateAny: permissions.has(Permission.DIET_PLANS_UPDATE),
    canDeleteAny: permissions.has(Permission.DIET_PLANS_DELETE),
  };
}

/** Turns a service error into the matching response. */
function failure(c: AppContext, result: { error?: string; status?: 403 | 404 | 409 }) {
  const message = result.error ?? "Request failed.";
  if (result.status === 404) return notFound(c, message);
  if (result.status === 409) return conflict(c, message);
  return forbidden(c, message);
}

function audit(c: AppContext, action: "CREATE" | "UPDATE" | "DELETE", entityId: string) {
  return auditLog({
    action,
    entity: "DietPlan",
    entityId,
    actorId: c.get("authUser").id,
    tenantId: c.req.param("tenantId")!,
    ip: c.req.header("x-forwarded-for") ?? undefined,
  });
}

export const dietPlanController = {
  async listPlans(c: AppContext) {
    const { page, limit } = parsePagination(c);
    const { data, total } = await dietPlanService.listPlans(
      c.req.param("tenantId")!,
      accessFor(c),
      page,
      limit,
    );

    return okPaginated(c, data, { page, limit, total });
  },

  async getPlan(c: AppContext) {
    const result = await dietPlanService.getPlan(
      c.req.param("tenantId")!,
      c.req.param("planId")!,
      accessFor(c),
    );
    if ("error" in result) return failure(c, result);

    return ok(c, result.data);
  },

  async createPlan(c: AppContext) {
    const parsed = await parseBody(c, createDietPlanSchema);
    if (!parsed.ok) return parsed.response;

    const result = await dietPlanService.createPlan(
      c.req.param("tenantId")!,
      accessFor(c),
      parsed.data,
    );
    if ("error" in result) return failure(c, result);

    await audit(c, "CREATE", result.data.plan.id);
    return ok(c, result.data, 201);
  },

  async updatePlan(c: AppContext) {
    const planId = c.req.param("planId")!;
    const parsed = await parseBody(c, updateDietPlanSchema);
    if (!parsed.ok) return parsed.response;

    const result = await dietPlanService.updatePlan(
      c.req.param("tenantId")!,
      planId,
      accessFor(c),
      parsed.data,
    );
    if ("error" in result) return failure(c, result);

    await audit(c, "UPDATE", planId);
    return ok(c, result.data);
  },

  async deletePlan(c: AppContext) {
    const planId = c.req.param("planId")!;
    const result = await dietPlanService.deletePlan(c.req.param("tenantId")!, planId, accessFor(c));
    if ("error" in result) return failure(c, result);

    await audit(c, "DELETE", planId);
    return okMessage(c, "Diet plan deleted.");
  },

  async assignPlan(c: AppContext) {
    const parsed = await parseBody(c, assignDietPlanSchema);
    if (!parsed.ok) return parsed.response;

    const result = await dietPlanService.assignPlan(
      c.req.param("tenantId")!,
      c.req.param("planId")!,
      parsed.data.membershipId,
      accessFor(c),
    );
    if ("error" in result) return failure(c, result);

    return ok(c, result.data, 201);
  },

  async unassignPlan(c: AppContext) {
    const result = await dietPlanService.unassignPlan(
      c.req.param("tenantId")!,
      c.req.param("planId")!,
      c.req.param("membershipId")!,
      accessFor(c),
    );
    if ("error" in result) return failure(c, result);

    return okMessage(c, "Plan removed from this member.");
  },
};
