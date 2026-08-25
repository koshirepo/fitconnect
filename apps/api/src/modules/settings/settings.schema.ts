/**
 * Documentation: Settings schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for tenant settings and extra charge configuration.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: updateSettingsSchema, createChargeSchema, updateChargeSchema, UpdateSettingsInput, CreateChargeInput, UpdateChargeInput.
 */
import { z } from "zod";
import { whatsappTemplateKeys } from "../../lib/whatsapp-templates";

const whatsappTemplateShape = Object.fromEntries(
  whatsappTemplateKeys.map((key) => [key, z.string().trim().min(1).max(4000).optional()]),
) as Record<string, z.ZodOptional<z.ZodString>>;

export const updateSettingsSchema = z.object({
  overdueDays: z.number().int().min(1).max(365).optional(),
  whatsappTemplates: z.object(whatsappTemplateShape).optional(),
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
