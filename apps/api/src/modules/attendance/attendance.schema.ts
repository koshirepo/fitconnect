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
