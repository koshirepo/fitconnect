/**
 * Documentation: Members controller.
 *
 * - Owns the HTTP boundary for tenant membership lifecycle, profile updates, reporting, and status management, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: memberController.
 */
import type { Context } from "hono";
import { memberService } from "./members.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import {
  ok,
  okMessage,
  okPaginated,
  conflict,
  notFound,
  forbidden,
  unauthorized,
  badRequest,
} from "../../lib/response";
import {
  addMemberSchema,
  updateMemberSchema,
  updateMemberRoleSchema,
  updateMyProfileSchema,
  updateMemberStatusSchema,
} from "./members.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const memberController = {
  /**
   * Handle the `add member` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async addMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, addMemberSchema);
    if (!parsed.ok) return parsed.response;

    const callerRole = c.get("tenantAccess")?.role ?? null;
    const result = await memberService.addMember(
      tenantId,
      parsed.data,
      callerRole,
      (promise) => c.executionCtx.waitUntil(promise),
    );

    if ("error" in result) {
      if (result.status === 403) return forbidden(c, result.error!);
      if (result.status === 404) return notFound(c, result.error!);
      if (result.status === 400) return badRequest(c, result.error!);
      return conflict(c, result.error!);
    }

    await auditLog({
      action: "CREATE",
      entity: "TenantMembership",
      entityId: result.data.membership.id,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { role: parsed.data.role, email: parsed.data.email },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /**
   * Handle the `list members` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listMembers(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const { page, limit } = parsePagination(c);
    const roleFilter = c.req.query("role");
    const search = c.req.query("search");
    const statusFilter = c.req.query("status");
    const badgeId = c.req.query("badge");

    const { data, total } = await memberService.listMembers(
      tenantId,
      page,
      limit,
      roleFilter,
      search,
      statusFilter,
      badgeId,
    );
    return okPaginated(c, data, { page, limit, total });
  },

  /**
   * Handle the `get member detail` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getMemberDetail(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const userId = c.get("authUser").id;
    const callerRole = c.get("tenantAccess")?.role ?? null;

    const result = await memberService.getMemberDetail(tenantId, membershipId, userId, callerRole);
    if ("error" in result) {
      if (result.status === 403) return forbidden(c, result.error!);
      return notFound(c, result.error!);
    }

    return ok(c, result.data);
  },

  /**
   * Handle the `get my profile` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getMyProfile(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const userId = c.get("authUser").id;

    const result = await memberService.getMyProfile(tenantId, userId);
    if ("error" in result) return forbidden(c, result.error!);

    return ok(c, result.data);
  },

  /**
   * Handle the `update my profile` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateMyProfile(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const userId = c.get("authUser").id;
    const parsed = await parseBody(c, updateMyProfileSchema);
    if (!parsed.ok) return parsed.response;

    const result = await memberService.updateMyProfile(
      tenantId,
      userId,
      parsed.data,
      {
        bucket: c.env?.UPLOADS_BUCKET ?? c.env?.FILES,
        publicUrl: c.env?.R2_PUBLIC_URL,
      },
      (promise) => c.executionCtx.waitUntil(promise),
    );

    if ("error" in result) {
      if (result.status === 401) return unauthorized(c, result.error!);
      if (result.status === 403) return forbidden(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      actorId: userId,
      tenantId,
      metadata: {
        fields: result.fields,
        passwordChanged: result.passwordChanged,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, { user: result.data.user });
  },

  /**
   * Handle the `update member` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, updateMemberSchema);
    if (!parsed.ok) return parsed.response;

    const result = await memberService.updateMember(
      tenantId,
      membershipId,
      parsed.data,
      {
        bucket: c.env?.UPLOADS_BUCKET ?? c.env?.FILES,
        publicUrl: c.env?.R2_PUBLIC_URL,
      },
      (promise) => c.executionCtx.waitUntil(promise),
    );

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "UPDATE",
      entity: "TenantMembership",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { fields: Object.keys(parsed.data) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `update member role` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateMemberRole(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, updateMemberRoleSchema);
    if (!parsed.ok) return parsed.response;

    const result = await memberService.updateMemberRole(
      tenantId,
      membershipId,
      parsed.data.role,
    );

    if ("error" in result) {
      if (result.status === 404) return notFound(c, result.error!);
      return badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "TenantMembership",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { from: result.previousRole, to: parsed.data.role },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `generate report` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async generateReport(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await memberService.generateReport(
      tenantId,
      c.get("authUser").id,
      (promise) => c.executionCtx.waitUntil(promise),
    );

    await auditLog({
      action: "CREATE",
      entity: "Report",
      actorId: c.get("authUser").id,
      tenantId,
      metadata: {
        suspendedCount: result.data.overdue.suspended.length,
        totalMembers: result.data.members.total,
      },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `update member status` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async updateMemberStatus(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, updateMemberStatusSchema);
    if (!parsed.ok) return parsed.response;

    const result = await memberService.updateMemberStatus(
      tenantId,
      membershipId,
      parsed.data.status,
    );
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "TenantMembership",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { from: result.previousStatus, to: parsed.data.status },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /**
   * Handle the `remove member` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async removeMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const result = await memberService.removeMember(tenantId, membershipId);

    if ("error" in result) {
      if (result.status === 400) return badRequest(c, result.error!);
      return notFound(c, result.error!);
    }

    await auditLog({
      action: "DELETE",
      entity: "TenantMembership",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: result.data,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Member deleted.");
  },

  /**
   * Handle the `reset member password` HTTP action for the members module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async resetMemberPassword(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const result = await memberService.resetMemberPassword(
      tenantId,
      membershipId,
    );

    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "User",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { passwordReset: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
