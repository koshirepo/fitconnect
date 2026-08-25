/**
 * Documentation: Request-scoped permission helpers.
 *
 * - Reads the effective capability set that the authorize middleware published on the Hono context so controllers can branch on capabilities instead of role strings.
 * - Use these when a route is reachable by several roles but the response must be narrowed for the weaker one (for example, a member seeing only their own records).
 * - Primary exports: grantedPermissions, can, canAny, canAll.
 */
import type { Context } from "hono";
import type { Permission } from "@fitconnect/shared/types/permissions";
import type { AppBindings } from "../types/app-context";

type AppContext = Context<AppBindings>;

/** Effective permissions for the current request; empty when unauthenticated. */
export function grantedPermissions(c: AppContext): ReadonlySet<Permission> {
  return c.get("permissions") ?? new Set<Permission>();
}

export function can(c: AppContext, permission: Permission) {
  return grantedPermissions(c).has(permission);
}

export function canAny(c: AppContext, permissions: readonly Permission[]) {
  const granted = grantedPermissions(c);
  return permissions.some((permission) => granted.has(permission));
}

export function canAll(c: AppContext, permissions: readonly Permission[]) {
  const granted = grantedPermissions(c);
  return permissions.every((permission) => granted.has(permission));
}
