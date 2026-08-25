/**
 * Documentation: Shifts schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for tenant shift management.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createShiftSchema, updateShiftSchema, CreateShiftInput, UpdateShiftInput.
 */
import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const hasValidTimeRange = (startTime: string, endTime: string) => startTime < endTime;

export const createShiftSchema = z
  .object({
    name: z.string().min(2).max(100),
    description: z.string().max(500).optional(),
    startTime: z.string().regex(timePattern, "Must be a valid HH:MM time"),
    endTime: z.string().regex(timePattern, "Must be a valid HH:MM time"),
    isActive: z.boolean().default(true),
  })
  .refine((data) => hasValidTimeRange(data.startTime, data.endTime), {
    message: "End time must be later than start time.",
    path: ["endTime"],
  });

export const updateShiftSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  startTime: z.string().regex(timePattern, "Must be a valid HH:MM time").optional(),
  endTime: z.string().regex(timePattern, "Must be a valid HH:MM time").optional(),
  isActive: z.boolean().optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;