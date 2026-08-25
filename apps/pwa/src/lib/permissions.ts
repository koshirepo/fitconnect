/**
 * Documentation: Client-side permission resolution.
 *
 * - Turns the signed-in user's role and the permission list the API returns into the capability set the UI gates on.
 * - The server-supplied list wins when present, because it already reflects any stored role overrides; the static catalog is only the fallback for a cached session issued before permissions were returned.
 * - Membership predicates (`hasPermission` and friends) live in `@fitconnect/shared/types/permissions`; this file only adds the client-specific resolution step.
 * - Gating here is a UX affordance only — the API enforces the same catalog on every request.
 * - Primary exports: resolveClientPermissions.
 */
import type { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";
import { type Permission, resolvePermissions } from "@fitconnect/shared/types/permissions";

export type { Permission };

/**
 * Effective capabilities for the current session.
 * Falls back to the static role catalog when the API has not supplied a list.
 */
export function resolveClientPermissions(input: {
  platformRole?: PlatformRole | null;
  tenantRole?: TenantRole | null;
  serverPermissions?: string[] | null;
}): Set<Permission> {
  if (input.serverPermissions?.length) {
    return new Set(input.serverPermissions as Permission[]);
  }

  return resolvePermissions({
    platformRole: input.platformRole ?? null,
    tenantRole: input.tenantRole ?? null,
  });
}
