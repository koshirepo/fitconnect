import { api } from "./client";
import type { ApiResponse } from "@/types/api";
import type { PermissionScope } from "@fitconnect/shared/types/permissions";

export type RolePermissionCatalogEntry = {
  key: string;
  label: string;
  /** False when this permission is visible but not editable in the current scope. */
  manageable: boolean;
};

export type RolePermissionCatalogGroup = {
  key: string;
  label: string;
  permissions: RolePermissionCatalogEntry[];
};

export type RoleMatrixEntry = {
  scope: PermissionScope;
  role: string;
  label: string;
  /** False for roles whose permission set is fixed (SUPER_ADMIN). */
  editable: boolean;
  /** The catalog defaults, before any stored overrides. */
  baselinePermissions: string[];
  /** What the role actually holds right now. */
  permissions: string[];
  /** Permissions that cannot be revoked, to avoid locking the role out. */
  lockedPermissions: string[];
  /** True when the effective set deviates from the baseline. */
  customized: boolean;
  manageablePermissions: number;
};

export type RoleMatrix = {
  tenantId: string | null;
  roles: RoleMatrixEntry[];
  catalog: RolePermissionCatalogGroup[];
};

export type UpdateRolePermissionsResult = {
  scope: PermissionScope;
  role: string;
  permissions: string[];
  overrideCount: number;
};

export const rolesApi = {
  // ─── Tenant scope ───────────────────────────────────────────────────────────

  getTenantMatrix: (tenantId: string) =>
    api.get<ApiResponse<RoleMatrix>>(`/tenants/${tenantId}/roles`),

  updateTenantRole: (tenantId: string, role: string, permissions: string[]) =>
    api.put<ApiResponse<UpdateRolePermissionsResult>>(`/tenants/${tenantId}/roles/${role}`, {
      permissions,
    }),

  resetTenantRole: (tenantId: string, role: string) =>
    api.delete<ApiResponse<UpdateRolePermissionsResult>>(`/tenants/${tenantId}/roles/${role}`),

  // ─── Platform scope ─────────────────────────────────────────────────────────

  getPlatformMatrix: () => api.get<ApiResponse<RoleMatrix>>(`/platform/roles`),

  updatePlatformRole: (scope: PermissionScope, role: string, permissions: string[]) =>
    api.put<ApiResponse<UpdateRolePermissionsResult>>(`/platform/roles/${scope}/${role}`, {
      permissions,
    }),

  resetPlatformRole: (scope: PermissionScope, role: string) =>
    api.delete<ApiResponse<UpdateRolePermissionsResult>>(`/platform/roles/${scope}/${role}`),
};
