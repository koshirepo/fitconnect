/**
 * Documentation: Occupations schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests against the platform-wide occupation list.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createOccupationSchema, updateOccupationSchema, CreateOccupationInput, UpdateOccupationInput.
 */
import { z } from "zod";

/**
 * An icon key from the curated set the PWA draws, e.g. "graduation-cap".
 *
 * Kept to lowercase-and-dashes rather than validated against the set itself:
 * the API has no business shipping a copy of the client's icon catalogue, and
 * anything the PWA does not recognise falls back to a briefcase.
 */
const iconField = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use a lowercase icon key, like graduation-cap.")
  .max(60);

export const createOccupationSchema = z.object({
  name: z.string().trim().min(2).max(60),
  icon: iconField.nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const updateOccupationSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  icon: iconField.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export type CreateOccupationInput = z.infer<typeof createOccupationSchema>;
export type UpdateOccupationInput = z.infer<typeof updateOccupationSchema>;
