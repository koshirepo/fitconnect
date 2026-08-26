/**
 * Documentation: Role permission controller.
 *
 * - Owns the HTTP boundary for the tenant-level and platform-level role/permission management screens, including request parsing, service invocation, response shaping, and audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: roleController.
 */
import type { Context } from "hono";
import { roleService } from "./roles.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { badRequest, forbidden, ok } from "../../lib/response";
import { createRoleSchema, updateRolePermissionsSchema, updateRoleSchema } from "./roles.schema";
import type { PermissionScope } from "@fitconnect/shared/types/permissions";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

function parseScope(value: string): PermissionScope | null {
  const upper = value.toUpperCase();
  return upper === "PLATFORM" || upper === "TENANT" ? upper : null;
}

export const roleController = {
  /** GET /tenants/:tenantId/roles — role matrix for one gym */
  async getTenantMatrix(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const result = await roleService.getTenantMatrix(tenantId);
    c.header("Cache-Control", "no-store");
    return ok(c, result.data);
  },

  /** PUT /tenants/:tenantId/roles/:role — replace one tenant role's permissions */
  async updateTenantRolePermissions(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const role = c.req.param("role")!.toUpperCase();
    const parsed = await parseBody(c, updateRolePermissionsSchema);
    if (!parsed.ok) return parsed.response;

    const result = await roleService.updateRolePermissions({
      tenantId,
      scope: "TENANT",
      role,
      permissions: parsed.data.permissions,
      actorId: c.get("authUser").id,
    });

    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "RolePermissionOverride",
      entityId: `TENANT:${role}`,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { role, permissions: result.data.permissions },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** DELETE /tenants/:tenantId/roles/:role — reset one tenant role to defaults */
  async resetTenantRole(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const role = c.req.param("role")!.toUpperCase();

    const result = await roleService.resetRole({ tenantId, scope: "TENANT", role });
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "RolePermissionOverride",
      entityId: `TENANT:${role}`,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { role, reset: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** PATCH /tenants/:tenantId/roles/:role — rename/describe a custom gym role */
  async updateTenantRole(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const role = c.req.param("role")!.toUpperCase();
    const parsed = await parseBody(c, updateRoleSchema);
    if (!parsed.ok) return parsed.response;

    const result = await roleService.updateRole({
      tenantId,
      scope: "TENANT",
      role,
      name: parsed.data.name,
      description: parsed.data.description,
      actorId: c.get("authUser").id,
    });

    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "Role",
      entityId: `TENANT:${role}`,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { role, name: result.data.name, updated: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** POST /tenants/:tenantId/roles — create a custom gym role */
  async createTenantRole(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const parsed = await parseBody(c, createRoleSchema);
    if (!parsed.ok) return parsed.response;

    const result = await roleService.createRole({
      tenantId,
      scope: "TENANT",
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      actorId: c.get("authUser").id,
    });

    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "Role",
      entityId: `TENANT:${result.data.role}`,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { role: result.data.role, name: result.data.name, created: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** DELETE /tenants/:tenantId/roles/:role — delete a custom gym role */
  async deleteTenantRole(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const role = c.req.param("role")!.toUpperCase();

    const result = await roleService.deleteRole({ tenantId, scope: "TENANT", role });
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "Role",
      entityId: `TENANT:${role}`,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { role, deleted: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** GET /platform/roles — platform roles plus tenant-role defaults */
  async getPlatformMatrix(c: AppContext) {
    const result = await roleService.getPlatformMatrix();
    c.header("Cache-Control", "no-store");
    return ok(c, result.data);
  },

  /** PUT /platform/roles/:scope/:role — replace a platform-wide role default */
  async updatePlatformRolePermissions(c: AppContext) {
    const scope = parseScope(c.req.param("scope")!);
    const role = c.req.param("role")!.toUpperCase();

    if (!scope) return badRequest(c, "Scope must be PLATFORM or TENANT.");

    const parsed = await parseBody(c, updateRolePermissionsSchema);
    if (!parsed.ok) return parsed.response;

    const result = await roleService.updateRolePermissions({
      tenantId: null,
      scope,
      role,
      permissions: parsed.data.permissions,
      actorId: c.get("authUser").id,
    });

    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "RolePermissionOverride",
      entityId: `${scope}:${role}`,
      actorId: c.get("authUser").id,
      metadata: { scope, role, permissions: result.data.permissions },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** DELETE /platform/roles/:scope/:role — reset a platform-wide role default */
  async resetPlatformRole(c: AppContext) {
    const scope = parseScope(c.req.param("scope")!);
    const role = c.req.param("role")!.toUpperCase();

    if (!scope) return badRequest(c, "Scope must be PLATFORM or TENANT.");

    const result = await roleService.resetRole({ tenantId: null, scope, role });
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "RolePermissionOverride",
      entityId: `${scope}:${role}`,
      actorId: c.get("authUser").id,
      metadata: { scope, role, reset: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** PATCH /platform/roles/:scope/:role — rename/describe a platform custom role */
  async updatePlatformRole(c: AppContext) {
    const scope = parseScope(c.req.param("scope")!);
    const role = c.req.param("role")!.toUpperCase();

    if (!scope) return badRequest(c, "Scope must be PLATFORM or TENANT.");

    const parsed = await parseBody(c, updateRoleSchema);
    if (!parsed.ok) return parsed.response;

    const result = await roleService.updateRole({
      tenantId: null,
      scope,
      role,
      name: parsed.data.name,
      description: parsed.data.description,
      actorId: c.get("authUser").id,
    });

    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "Role",
      entityId: `${scope}:${role}`,
      actorId: c.get("authUser").id,
      metadata: { scope, role, name: result.data.name, updated: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  /** POST /platform/roles — create a platform-wide custom role */
  async createPlatformRole(c: AppContext) {
    const parsed = await parseBody(c, createRoleSchema);
    if (!parsed.ok) return parsed.response;

    const result = await roleService.createRole({
      tenantId: null,
      scope: "PLATFORM",
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      actorId: c.get("authUser").id,
    });

    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "Role",
      entityId: `PLATFORM:${result.data.role}`,
      actorId: c.get("authUser").id,
      metadata: { role: result.data.role, name: result.data.name, created: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  /** DELETE /platform/roles/:scope/:role — delete a platform-wide custom role */
  async deletePlatformRole(c: AppContext) {
    const scope = parseScope(c.req.param("scope")!);
    const role = c.req.param("role")!.toUpperCase();

    if (!scope) return badRequest(c, "Scope must be PLATFORM or TENANT.");

    const result = await roleService.deleteRole({ tenantId: null, scope, role });
    if ("error" in result) {
      return result.status === 403 ? forbidden(c, result.error!) : badRequest(c, result.error!);
    }

    await auditLog({
      action: "ROLE_CHANGE",
      entity: "Role",
      entityId: `${scope}:${role}`,
      actorId: c.get("authUser").id,
      metadata: { scope, role, deleted: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
