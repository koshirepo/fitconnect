/**
 * Documentation: Role permission request schemas.
 *
 * - Validates the payload used by the role-management screens when replacing a role's permission list.
 * - Keep validation shapes here so controllers stay thin and error responses stay uniform.
 * - Primary exports: updateRolePermissionsSchema, UpdateRolePermissionsInput.
 */
import { z } from "zod";
import { ALL_PERMISSIONS } from "@fitconnect/shared/types/permissions";

const permissionValues = ALL_PERMISSIONS as unknown as [string, ...string[]];

export const updateRolePermissionsSchema = z.object({
  /** The full permission list the role should end up with. */
  permissions: z.array(z.enum(permissionValues)).max(ALL_PERMISSIONS.length),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
