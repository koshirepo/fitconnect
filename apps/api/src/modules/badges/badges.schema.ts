/**
 * Documentation: Badges schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for badge definitions and member badge assignment.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createBadgeSchema, updateBadgeSchema, assignBadgeSchema, CreateBadgeInput, UpdateBadgeInput, AssignBadgeInput.
 */
import { z } from "zod";

export const createBadgeSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  icon: z.string().max(50).optional(),
  /**
   * Whether handing this badge out needs `badges:assign:restricted`.
   *
   * Settable only by someone who can create or edit badges, which is an admin
   * right already — so a coach can neither unrestrict a badge to grant it nor
   * restrict one to keep it from a colleague.
   */
  restricted: z.boolean().optional(),
});

export const updateBadgeSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  icon: z.string().max(50).optional(),
  restricted: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const assignBadgeSchema = z.object({
  membershipId: z.string(),
});

export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type UpdateBadgeInput = z.infer<typeof updateBadgeSchema>;
export type AssignBadgeInput = z.infer<typeof assignBadgeSchema>;
