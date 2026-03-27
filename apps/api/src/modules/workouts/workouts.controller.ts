import type { Context } from "hono";
import { workoutService } from "./workouts.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okMessage, okPaginated, forbidden, notFound, conflict } from "../../lib/response";
import { createPlanSchema, updatePlanSchema, assignPlanSchema } from "./workouts.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;
export const workoutController = {
  async listPlans(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const role = c.get("tenantAccess")?.role;

    const { data, total } = await workoutService.listPlans(
      tenantId,
      c.get("authUser").id,
      role,
      page,
      limit,
    );

    return okPaginated(c, data, { page, limit, total });
  },

  async getPlan(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const planId = c.req.param("planId")!;
    const role = c.get("tenantAccess")?.role;

    const result = await workoutService.getPlan(tenantId, planId, c.get("authUser").id, role);

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return forbidden(c, result.error!);
    }

    return ok(c, result.data);
  },

  async createPlan(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createPlanSchema);
    if (!parsed.ok) return parsed.response;

    const result = await workoutService.createPlan(tenantId, c.get("authUser").id, parsed.data);

    if ("error" in result) return forbidden(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "WorkoutPlan",
      entityId: result.data.plan.id,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async updatePlan(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const planId = c.req.param("planId")!;
    const parsed = await parseBody(c, updatePlanSchema);
    if (!parsed.ok) return parsed.response;

    const result = await workoutService.updatePlan(
      tenantId,
      planId,
      c.get("authUser").id,
      c.get("tenantAccess")?.role,
      parsed.data,
    );

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return forbidden(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "WorkoutPlan",
      entityId: planId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async deletePlan(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const planId = c.req.param("planId")!;

    const result = await workoutService.deletePlan(tenantId, planId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "WorkoutPlan",
      entityId: planId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Workout plan deleted.");
  },

  async assignPlan(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const planId = c.req.param("planId")!;
    const parsed = await parseBody(c, assignPlanSchema);
    if (!parsed.ok) return parsed.response;

    const result = await workoutService.assignPlan(tenantId, planId, parsed.data.membershipId);

    if ("error" in result) {
      if (result.status === 409) return conflict(c, result.error!);
      return notFound(c, result.error!);
    }

    return ok(c, result.data, 201);
  },
};
