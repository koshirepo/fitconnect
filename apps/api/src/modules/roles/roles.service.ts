/**
 * Documentation: Role permission service.
 *
 * - Builds the role/permission matrices the management screens render, and turns a submitted permission list back into the minimal set of override rows.
 * - Enforces the policy guardrails: immutable roles, locked permissions, and the tenant-manageable permission subset.
 * - Primary exports: roleService.
 */
import { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";
import {
  ALL_PERMISSIONS,
  IMMUTABLE_ROLES,
  LOCKED_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  type Permission,
  type PermissionScope,
  TENANT_MANAGEABLE_PERMISSIONS,
  applyOverrides,
  baselinePermissions,
  permissionGroupKey,
} from "@fitconnect/shared/types/permissions";
import { PLATFORM_ROLE_LABELS, TENANT_ROLE_LABELS } from "@fitconnect/shared/constants";
import { rolePermissionRepository } from "./roles.repository";
import { invalidateCached } from "../../lib/request-cache";

const PLATFORM_ROLES = Object.values(PlatformRole) as string[];
const TENANT_ROLES = Object.values(TenantRole) as string[];

/** "Front Desk" → "FRONT_DESK". Non-letters collapse to underscores. */
export function slugifyRoleKey(name: string) {
  const key = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key;
}

function roleLabel(scope: PermissionScope, role: string) {
  return scope === "PLATFORM"
    ? (PLATFORM_ROLE_LABELS[role] ?? role)
    : (TENANT_ROLE_LABELS[role] ?? role);
}

/** The permission catalog, shaped for rendering as a grouped checklist. */
function permissionCatalog(manageable: readonly Permission[]) {
  const manageableSet = new Set(manageable);

  return PERMISSION_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    permissions: ALL_PERMISSIONS.filter(
      (permission) => permissionGroupKey(permission) === group.key,
    ).map((permission) => ({
      key: permission,
      label: PERMISSION_LABELS[permission] ?? permission,
      manageable: manageableSet.has(permission),
    })),
  })).filter((group) => group.permissions.length > 0);
}

async function buildMatrix(input: {
  tenantId: string | null;
  scopes: PermissionScope[];
  manageable: readonly Permission[];
}) {
  // Platform-wide defaults first, then gym-specific rows, so the gym wins.
  const overrides = await rolePermissionRepository.listApplicableOverrides(input.tenantId);
  const manageableSet = new Set(input.manageable);
  const customRoles = await rolePermissionRepository.listCustomRoles(input.tenantId);

  const roles = input.scopes.flatMap((scope) => {
    const roleNames = scope === "PLATFORM" ? PLATFORM_ROLES : TENANT_ROLES;
    const scopeCustom = customRoles.filter((role) => role.scope === scope);

    const builtIn = roleNames.map((role) => {
      const baseline = baselinePermissions(scope, role);
      const effective = applyOverrides(scope, role, baseline, overrides);
      const locked = LOCKED_ROLE_PERMISSIONS[role] ?? [];

      return {
        scope,
        role,
        label: roleLabel(scope, role),
        editable: !IMMUTABLE_ROLES.includes(role),
        isSystem: true,
        baselinePermissions: [...baseline].sort(),
        permissions: [...effective].sort(),
        lockedPermissions: [...locked],
        customized: effective.length !== baseline.length ||
          effective.some((permission) => !baseline.includes(permission)),
        manageablePermissions: [...effective].filter((permission) =>
          manageableSet.has(permission),
        ).length,
      };
    });

    // Custom roles have no catalog baseline; everything they hold is stored as
    // `allowed = true` override rows, so their effective set is exactly what
    // applyOverrides produces from an empty baseline.
    const custom = scopeCustom.map((role) => {
      const effective = applyOverrides(scope, role.key, [], overrides);
      const manageableCount = effective.filter((permission) =>
        manageableSet.has(permission),
      ).length;

      return {
        scope,
        role: role.key,
        label: role.name,
        editable: true,
        isSystem: false,
        description: role.description,
        baselinePermissions: [] as string[],
        permissions: [...effective].sort(),
        lockedPermissions: [] as string[],
        customized: effective.length > 0,
        manageablePermissions: manageableCount,
      };
    });

    return [...builtIn, ...custom];
  });

  return { roles, catalog: permissionCatalog(input.manageable) };
}

export const roleService = {
  /**
   * Matrix for a single gym: its three tenant roles, with platform-wide defaults
   * already folded in. Platform-scoped permissions are read-only here.
   */
  async getTenantMatrix(tenantId: string) {
    const matrix = await buildMatrix({
      tenantId,
      scopes: ["TENANT"],
      manageable: TENANT_MANAGEABLE_PERMISSIONS,
    });

    return { data: { tenantId, ...matrix } };
  },

  /** Matrix for the platform: platform roles plus the tenant-role defaults. */
  async getPlatformMatrix() {
    const matrix = await buildMatrix({
      tenantId: null,
      scopes: ["PLATFORM", "TENANT"],
      manageable: ALL_PERMISSIONS,
    });

    return { data: { tenantId: null, ...matrix } };
  },

  /**
   * Replace a role's permission list.
   * The submitted list is diffed against the catalog baseline so only genuine
   * deviations are persisted — resetting a role to its defaults clears its rows.
   * Custom roles have an empty baseline, so every granted permission is stored
   * as an `allowed = true` row.
   */
  async updateRolePermissions(input: {
    tenantId: string | null;
    scope: PermissionScope;
    role: string;
    permissions: string[];
    actorId?: string;
  }) {
    const roleNames = input.scope === "PLATFORM" ? PLATFORM_ROLES : TENANT_ROLES;
    const isCustom = !roleNames.includes(input.role);

    if (!isCustom) {
      if (IMMUTABLE_ROLES.includes(input.role)) {
        return {
          error: `${roleLabel(input.scope, input.role)} always holds every permission and cannot be edited.`,
          status: 400 as const,
        };
      }
    } else {
      // The role must exist in the registry and belong to this scope container.
      const exists = await rolePermissionRepository.findCustomRole(input.tenantId, input.scope, input.role);
      if (!exists) {
        return { error: `Unknown ${input.scope.toLowerCase()} role: ${input.role}.`, status: 400 as const };
      }
    }

    // A gym may only tune tenant-scoped roles, and only with tenant-scoped
    // permissions — otherwise a gym admin could grant themselves platform reach.
    const manageable = input.tenantId ? TENANT_MANAGEABLE_PERMISSIONS : ALL_PERMISSIONS;

    if (input.tenantId && input.scope !== "TENANT") {
      return { error: "A gym can only manage its own tenant roles.", status: 403 as const };
    }

    const requested = new Set(input.permissions as Permission[]);
    const outOfScope = [...requested].filter((permission) => !manageable.includes(permission));

    if (outOfScope.length > 0) {
      return {
        error: `These permissions cannot be granted here: ${outOfScope.join(", ")}.`,
        status: 403 as const,
      };
    }

    const baseline = baselinePermissions(input.scope, input.role);
    const locked = LOCKED_ROLE_PERMISSIONS[input.role] ?? [];

    // Locked permissions stay granted no matter what the client submitted.
    for (const permission of locked) requested.add(permission);

    const overrides: { permission: string; allowed: boolean }[] = [];

    for (const permission of manageable) {
      const inBaseline = baseline.includes(permission);
      const inRequest = requested.has(permission);

      if (inRequest && !inBaseline) overrides.push({ permission, allowed: true });
      if (!inRequest && inBaseline) overrides.push({ permission, allowed: false });
    }

    await rolePermissionRepository.replaceRoleOverrides({
      tenantId: input.tenantId,
      scope: input.scope,
      role: input.role,
      overrides,
      updatedBy: input.actorId,
    });

    // Authorization caches these; drop the entry so the change is in force on
    // the next request in this isolate instead of after the TTL.
    invalidateCached(`role-overrides:${input.tenantId ?? "platform"}`);

    return {
      data: {
        scope: input.scope,
        role: input.role,
        permissions: [...requested].sort(),
        overrideCount: overrides.length,
      },
    };
  },

  /** Return a role to its catalog baseline by dropping its override rows. */
  async resetRole(input: { tenantId: string | null; scope: PermissionScope; role: string }) {
    const roleNames = input.scope === "PLATFORM" ? PLATFORM_ROLES : TENANT_ROLES;

    if (!roleNames.includes(input.role)) {
      const exists = await rolePermissionRepository.findCustomRole(input.tenantId, input.scope, input.role);
      if (!exists) {
        return { error: `Unknown ${input.scope.toLowerCase()} role: ${input.role}.`, status: 400 as const };
      }
    }

    if (input.tenantId && input.scope !== "TENANT") {
      return { error: "A gym can only manage its own tenant roles.", status: 403 as const };
    }

    await rolePermissionRepository.resetRole(input);
    // Authorization caches these; drop the entry so the change is in force on
    // the next request in this isolate instead of after the TTL.
    invalidateCached(`role-overrides:${input.tenantId ?? "platform"}`);

    return {
      data: {
        scope: input.scope,
        role: input.role,
        permissions: [...baselinePermissions(input.scope, input.role)].sort(),
      },
    };
  },

  /**
   * Create a custom role. The key is derived from the name (upper-snake), and
   * must not collide with a built-in role or an existing custom role in the
   * same scope container.
   */
  async createRole(input: {
    tenantId: string | null;
    scope: PermissionScope;
    name: string;
    description?: string;
    permissions: string[];
    actorId?: string;
  }) {
    if (input.tenantId && input.scope !== "TENANT") {
      return { error: "A gym can only create its own tenant roles.", status: 403 as const };
    }

    const manageable = input.tenantId ? TENANT_MANAGEABLE_PERMISSIONS : ALL_PERMISSIONS;
    const requested = new Set(input.permissions as Permission[]);
    const outOfScope = [...requested].filter((permission) => !manageable.includes(permission));

    if (outOfScope.length > 0) {
      return {
        error: `These permissions cannot be granted here: ${outOfScope.join(", ")}.`,
        status: 403 as const,
      };
    }

    const key = slugifyRoleKey(input.name);
    if (!key) {
      return { error: "Role name must include letters.", status: 400 as const };
    }

    const builtIn = input.scope === "PLATFORM" ? PLATFORM_ROLES : TENANT_ROLES;
    if (builtIn.includes(key)) {
      return {
        error: `A built-in role named "${key}" already exists. Choose a different name.`,
        status: 409 as const,
      };
    }

    const clash = await rolePermissionRepository.findCustomRole(input.tenantId, input.scope, key);
    if (clash) {
      return {
        error: `A role named "${input.name}" already exists in this ${input.scope.toLowerCase()}.`,
        status: 409 as const,
      };
    }

    await rolePermissionRepository.createRole({
      tenantId: input.tenantId,
      scope: input.scope,
      key,
      name: input.name,
      description: input.description,
      permissions: input.permissions,
      createdBy: input.actorId,
    });

    return { data: { scope: input.scope, role: key, name: input.name } };
  },

  /**
   * Rename a custom role (or update its description). The key stays stable —
   * memberships and override rows reference it, so a name change only alters
   * the label.
   */
  async updateRole(input: {
    tenantId: string | null;
    scope: PermissionScope;
    role: string;
    name?: string;
    description?: string | null;
    actorId?: string;
  }) {
    const builtIn = input.scope === "PLATFORM" ? PLATFORM_ROLES : TENANT_ROLES;
    if (builtIn.includes(input.role)) {
      return { error: "Built-in roles cannot be edited.", status: 400 as const };
    }

    if (input.tenantId && input.scope !== "TENANT") {
      return { error: "A gym can only manage its own tenant roles.", status: 403 as const };
    }

    const existing = await rolePermissionRepository.findCustomRole(input.tenantId, input.scope, input.role);
    if (!existing) {
      return { error: `Unknown ${input.scope.toLowerCase()} role: ${input.role}.`, status: 404 as const };
    }

    // A renamed role keeps its key; only the label/description change.
    const data: { name?: string; description?: string | null } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;

    await rolePermissionRepository.updateRole(input.tenantId, input.scope, input.role, data);

    return { data: { scope: input.scope, role: input.role, name: data.name ?? existing.name } };
  },

  /**
   * Delete a custom role. System roles can never be deleted, and a role that
   * members still hold is kept so nobody silently loses access.
   */
  async deleteRole(input: {
    tenantId: string | null;
    scope: PermissionScope;
    role: string;
  }) {
    const builtIn = input.scope === "PLATFORM" ? PLATFORM_ROLES : TENANT_ROLES;
    if (builtIn.includes(input.role)) {
      return { error: "Built-in roles cannot be deleted.", status: 400 as const };
    }

    if (input.tenantId && input.scope !== "TENANT") {
      return { error: "A gym can only manage its own tenant roles.", status: 403 as const };
    }

    const role = await rolePermissionRepository.findCustomRole(input.tenantId, input.scope, input.role);
    if (!role) {
      return { error: `Unknown ${input.scope.toLowerCase()} role: ${input.role}.`, status: 404 as const };
    }

    const assigned = await rolePermissionRepository.countMembersWithRole(input.tenantId, input.role);
    if (assigned > 0) {
      return {
        error: `Cannot delete "${role.name}": ${assigned} member${assigned === 1 ? "" : "s"} still hold${assigned === 1 ? "s" : ""} this role. Reassign them first.`,
        status: 409 as const,
      };
    }

    await rolePermissionRepository.deleteRole(input);
    invalidateCached(`role-overrides:${input.tenantId ?? "platform"}`);

    return { data: { scope: input.scope, role: input.role, deleted: true } };
  },
};
