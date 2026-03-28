/**
 * Documentation: Badges controller.
 *
 * - Owns the HTTP boundary for badge definitions and member badge assignment, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: badgeController.
 */
import type { Context } from "hono";
import { badgeService } from "./badges.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { ok, okMessage, okPaginated, conflict, notFound, badRequest } from "../../lib/response";
import { createBadgeSchema, updateBadgeSchema, assignBadgeSchema } from "./badges.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const badgeController = {
  /**
   * Handle the `create` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async create(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createBadgeSchema);
    if (!parsed.ok) return parsed.response;

    const result = await badgeService.create(tenantId, parsed.data);
    if ("error" in result) return conflict(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "Badge",
      entityId: result.data.badge.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { name: parsed.data.name },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `list` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async list(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const includeInactive = c.req.query("includeInactive") === "true";

    const { data, total } = await badgeService.list(tenantId, page, limit, includeInactive);
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `get by id` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getById(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const badgeId = c.req.param("badgeId")!;

    const result = await badgeService.getById(tenantId, badgeId);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  /**
   * Handle the `update` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async update(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const badgeId = c.req.param("badgeId")!;
    const parsed = await parseBody(c, updateBadgeSchema);
    if (!parsed.ok) return parsed.response;

    const result = await badgeService.update(tenantId, badgeId, parsed.data);

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return conflict(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "Badge",
      entityId: badgeId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: parsed.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `delete` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async delete(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const badgeId = c.req.param("badgeId")!;

    const result = await badgeService.delete(tenantId, badgeId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Badge",
      entityId: badgeId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Badge deleted.");
  },

  /**
   * Handle the `assign` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async assign(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const badgeId = c.req.param("badgeId")!;
    const parsed = await parseBody(c, assignBadgeSchema);
    if (!parsed.ok) return parsed.response;

    const result = await badgeService.assign(tenantId, badgeId, parsed.data);

    if ("error" in result) {
      if (result.status === 409) return conflict(c, result.error!);
      if (result.status === 400) return badRequest(c, result.error!);
      return notFound(c, result.error!);
    }

    await auditLog({
      action: "CREATE",
      entity: "Badge",
      entityId: badgeId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { badgeId, membershipId: parsed.data.membershipId },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `unassign` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async unassign(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const badgeId = c.req.param("badgeId")!;
    const membershipId = c.req.param("membershipId")!;

    const result = await badgeService.unassign(tenantId, badgeId, membershipId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "Badge",
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { badgeId, membershipId },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Badge removed from member.");
  },

  /**
   * Handle the `list assignments` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listAssignments(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const badgeId = c.req.param("badgeId")!;

    const result = await badgeService.listAssignments(tenantId, badgeId);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  /**
   * Handle the `member badges` HTTP action for the badges module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async memberBadges(c: AppContext) {
    const membershipId = c.req.param("membershipId")!;

    const result = await badgeService.listMemberBadges(membershipId);
    return ok(c, result.data);
  },
};
