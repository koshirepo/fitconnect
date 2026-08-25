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
import { updateRolePermissionsSchema } from "./roles.schema";
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
  async updateTenantRole(c: AppContext) {
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

  /** GET /platform/roles — platform roles plus tenant-role defaults */
  async getPlatformMatrix(c: AppContext) {
    const result = await roleService.getPlatformMatrix();
    c.header("Cache-Control", "no-store");
    return ok(c, result.data);
  },

  /** PUT /platform/roles/:scope/:role — replace a platform-wide role default */
  async updatePlatformRole(c: AppContext) {
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
};
