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

  async getMemberDetail(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const result = await memberService.getMemberDetail(tenantId, membershipId);
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  async getMyProfile(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const userId = c.get("authUser").id;

    const result = await memberService.getMyProfile(tenantId, userId);
    if ("error" in result) return forbidden(c, result.error!);

    return ok(c, result.data);
  },

  async updateMyProfile(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const userId = c.get("authUser").id;
    const parsed = await parseBody(c, updateMyProfileSchema);
    if (!parsed.ok) return parsed.response;

    const result = await memberService.updateMyProfile(
      tenantId,
      userId,
      parsed.data,
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

  async updateMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;
    const parsed = await parseBody(c, updateMemberSchema);
    if (!parsed.ok) return parsed.response;

    const result = await memberService.updateMember(
      tenantId,
      membershipId,
      parsed.data,
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

  async removeMember(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const membershipId = c.req.param("membershipId")!;

    const result = await memberService.removeMember(tenantId, membershipId);

    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "TenantMembership",
      entityId: membershipId,
      actorId: c.get("authUser").id,
      tenantId,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return okMessage(c, "Member removed.");
  },

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
