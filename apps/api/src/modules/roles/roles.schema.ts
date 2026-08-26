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

export const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  /** The full permission list the new role should start with. */
  permissions: z.array(z.enum(permissionValues)).max(ALL_PERMISSIONS.length).default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(200).nullable().optional(),
});

export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
