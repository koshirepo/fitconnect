import { z } from "zod";

export const updateSettingsSchema = z.object({
  overdueDays: z.number().int().min(1).max(365).optional(),
});

export const createChargeSchema = z.object({
  name: z.string().min(2).max(120),
  amount: z.number().int().min(0),
  isMandatory: z.boolean().default(true),
});

export const updateChargeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  amount: z.number().int().min(0).optional(),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateChargeInput = z.infer<typeof createChargeSchema>;
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>;
