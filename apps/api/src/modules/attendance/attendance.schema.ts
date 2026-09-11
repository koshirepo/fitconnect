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

export const qrAttendanceSchema = z.object({
  membershipId: z.string().min(1, "membershipId is required").optional(),
});

/**
 * How long somebody must have been away to count as at risk.
 *
 * Floored at 7 because anything shorter is a week off, not a warning, and a
 * list that cries wolf gets ignored. Capped at 180 because past that the
 * question is not "have they lapsed" but "are they still a member", which the
 * roster answers better than this does.
 */
export const atRiskQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(21),
});

export type AtRiskQuery = z.infer<typeof atRiskQuerySchema>;

/**
 * How many weeks of visits the busy-hours chart is built from.
 *
 * Four by default: enough that one public holiday does not set the shape of the
 * week, recent enough to still describe how the gym runs now. One week is
 * offered because a gym that has just changed its hours wants to see the new
 * ones, and twelve is the ceiling — beyond a quarter the average describes a
 * timetable the gym has probably already moved on from.
 */
export const heatmapQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(12).default(4),
});

export type HeatmapQuery = z.infer<typeof heatmapQuerySchema>;

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type MarkAllAttendanceInput = z.infer<typeof markAllAttendanceSchema>;
export type QrAttendanceInput = z.infer<typeof qrAttendanceSchema>;
