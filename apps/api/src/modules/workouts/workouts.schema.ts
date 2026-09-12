/**
 * Documentation: Workouts schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for workout plan creation, assignment, and member program visibility.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createPlanSchema, updatePlanSchema, assignPlanSchema, CreatePlanInput, UpdatePlanInput.
 */
import { z } from "zod";

const exerciseSchema = z.object({
  /**
   * The library entry this line was picked from, where it was picked from one.
   *
   * Kept *beside* the copied name rather than instead of it. The name is what
   * the plan says and stays readable if the library later renames or retires
   * the exercise; the id is what lets a screen show that exercise's clip. A
   * line somebody typed by hand carries no id and needs none.
   *
   * Unknown keys are stripped here, so a line arriving without this field in
   * the schema loses its id silently — which is exactly what used to happen.
   */
  exerciseId: z.string().max(120).optional(),
  name: z.string(),
  sets: z.number().int().min(1).optional(),
  reps: z.number().int().min(1).optional(),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
});

export const createPlanSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  exercises: z.array(exerciseSchema).optional(),
});

export const updatePlanSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  exercises: z.array(exerciseSchema).optional(),
});

export const assignPlanSchema = z.object({
  membershipId: z.string(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
