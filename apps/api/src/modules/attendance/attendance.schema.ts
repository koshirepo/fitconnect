/**
 * Documentation: Attendance schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for member check-ins, staff attendance marking, summaries, and calendar views.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: markAttendanceSchema, markAllAttendanceSchema, MarkAttendanceInput, MarkAllAttendanceInput.
 */
import { z } from "zod";

export const markAttendanceSchema = z.object({
  membershipId: z.string().min(1, "membershipId is required").optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  note: z.string().max(200).optional(),
});

export const markAllAttendanceSchema = z.object({
  membershipIds: z.array(z.string().min(1)).min(1, "At least one membershipId required"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type MarkAllAttendanceInput = z.infer<typeof markAllAttendanceSchema>;
