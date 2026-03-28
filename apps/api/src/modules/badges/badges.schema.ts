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
});

export const updateBadgeSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color")
    .optional(),
  icon: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});

export const assignBadgeSchema = z.object({
  membershipId: z.string(),
});

export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type UpdateBadgeInput = z.infer<typeof updateBadgeSchema>;
export type AssignBadgeInput = z.infer<typeof assignBadgeSchema>;
