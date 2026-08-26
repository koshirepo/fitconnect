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
  /** Human-readable description, for custom roles. */
  description?: string | null;
  /** False for roles whose permission set is fixed (SUPER_ADMIN). */
  editable: boolean;
  /** True for the built-in MEMBER/COACH/ADMIN and platform roles. */
  isSystem: boolean;
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

  createTenantRole: (
    tenantId: string,
    input: { name: string; description?: string; permissions: string[] },
  ) =>
    api.post<ApiResponse<{ scope: PermissionScope; role: string; name: string }>>(
      `/tenants/${tenantId}/roles`,
      input,
    ),

  updateTenantRole: (tenantId: string, role: string, permissions: string[]) =>
    api.put<ApiResponse<UpdateRolePermissionsResult>>(`/tenants/${tenantId}/roles/${role}`, {
      permissions,
    }),

  updateTenantRoleDetails: (
    tenantId: string,
    role: string,
    input: { name?: string; description?: string | null },
  ) =>
    api.patch<ApiResponse<{ scope: PermissionScope; role: string; name: string }>>(
      `/tenants/${tenantId}/roles/${role}`,
      input,
    ),

  resetTenantRole: (tenantId: string, role: string) =>
    api.delete<ApiResponse<UpdateRolePermissionsResult>>(`/tenants/${tenantId}/roles/${role}`),

  deleteTenantRole: (tenantId: string, role: string) =>
    api.delete<ApiResponse<{ scope: PermissionScope; role: string; deleted: boolean }>>(
      `/tenants/${tenantId}/roles/${role}/definition`,
    ),

  // ─── Platform scope ─────────────────────────────────────────────────────────

  getPlatformMatrix: () => api.get<ApiResponse<RoleMatrix>>(`/platform/roles`),

  createPlatformRole: (input: {
    name: string;
    description?: string;
    permissions: string[];
  }) =>
    api.post<ApiResponse<{ scope: PermissionScope; role: string; name: string }>>(
      `/platform/roles`,
      input,
    ),

  updatePlatformRole: (scope: PermissionScope, role: string, permissions: string[]) =>
    api.put<ApiResponse<UpdateRolePermissionsResult>>(`/platform/roles/${scope}/${role}`, {
      permissions,
    }),

  updatePlatformRoleDetails: (
    scope: PermissionScope,
    role: string,
    input: { name?: string; description?: string | null },
  ) =>
    api.patch<ApiResponse<{ scope: PermissionScope; role: string; name: string }>>(
      `/platform/roles/${scope}/${role}`,
      input,
    ),

  resetPlatformRole: (scope: PermissionScope, role: string) =>
    api.delete<ApiResponse<UpdateRolePermissionsResult>>(`/platform/roles/${scope}/${role}`),

  deletePlatformRole: (scope: PermissionScope, role: string) =>
    api.delete<ApiResponse<{ scope: PermissionScope; role: string; deleted: boolean }>>(
      `/platform/roles/${scope}/${role}/definition`,
    ),
};
