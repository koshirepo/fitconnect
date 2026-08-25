/**
 * Documentation: Permission gating primitives.
 *
 * - `usePermissions` exposes the signed-in user's capability set; `<Can>` renders children only when the capability is held.
 * - Prefer these over comparing role strings so a permission change in the catalog (or via the role-management screens) reaches every control at once.
 * - Gating here is a UX affordance; the API enforces the same permissions on every request.
 * - Primary exports: usePermissions, Can.
 */
import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import type { Permission } from "@/lib/permissions";

type PermissionCheck = {
  granted: ReadonlySet<Permission>;
  can: (permission: Permission) => boolean;
  canAny: (...permissions: Permission[]) => boolean;
  canAll: (...permissions: Permission[]) => boolean;
};

/** Capability helpers for the current session, re-evaluated when the user changes. */
export function usePermissions(): PermissionCheck {
  const user = useAuthStore((state) => state.user);

  return React.useMemo(() => {
    const granted = useAuthStore.getState().permissions();

    return {
      granted,
      can: (permission: Permission) => granted.has(permission),
      canAny: (...permissions: Permission[]) =>
        permissions.some((permission) => granted.has(permission)),
      canAll: (...permissions: Permission[]) =>
        permissions.every((permission) => granted.has(permission)),
    };
    // `user` is the whole reason the set can change (role, membership, permissions list).
  }, [user]);
}

type CanProps = {
  /** Render children when the user holds this permission. */
  permission?: Permission;
  /** Render children when the user holds at least one of these. */
  anyOf?: Permission[];
  /** Render children when the user holds all of these. */
  allOf?: Permission[];
  /** Rendered instead of `children` when the check fails. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Conditional renderer for permission-gated controls.
 * With no props set it renders children, so an ungated call is a no-op rather
 * than an accidental hide.
 */
export function Can({ permission, anyOf, allOf, fallback = null, children }: CanProps) {
  const { can, canAny, canAll } = usePermissions();

  const checks = [
    permission ? can(permission) : true,
    anyOf?.length ? canAny(...anyOf) : true,
    allOf?.length ? canAll(...allOf) : true,
  ];

  return <>{checks.every(Boolean) ? children : fallback}</>;
}
