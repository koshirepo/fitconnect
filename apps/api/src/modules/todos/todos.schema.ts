/**
 * Documentation: Todo schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for tenant todo management.
 * - Keep visibility and completion payload rules centralized here so controllers do not duplicate request validation logic.
 * - Primary exports: createTodoSchema, updateTodoSchema, CreateTodoInput, UpdateTodoInput.
 */
import { z } from "zod";
import { TodoVisibility } from "@fitconnect/shared/types/enums";

const visibilitySchema = z.enum([
  TodoVisibility.PRIVATE,
  TodoVisibility.PROTECTED,
  TodoVisibility.PUBLIC,
]);

export const createTodoSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  visibility: visibilitySchema.default(TodoVisibility.PUBLIC),
});

export const updateTodoSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  visibility: visibilitySchema.optional(),
  isCompleted: z.boolean().optional(),
});

export type CreateTodoInput = z.infer<typeof createTodoSchema>;
export type UpdateTodoInput = z.infer<typeof updateTodoSchema>;
