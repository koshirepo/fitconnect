import { z } from "zod";
import { SLUG_REGEX } from "../../shared/constants";

export const createTenantAdminSchema = z.object({
  name: z
    .string()
    .min(2, "Admin name must be at least 2 characters")
    .max(120, "Admin name must be at most 120 characters"),
  email: z
    .string()
    .email("Invalid email format")
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .min(10, "Phone must be at least 10 characters")
    .max(15, "Phone must be at most 15 characters")
    .optional()
    .or(z.literal("")),
  avatarUrl: z.string().url("Avatar URL must be a valid URL").optional().or(z.literal("")),
});

export const createTenantSchema = z.object({
  name: z
    .string()
    .min(2, "Gym name must be at least 2 characters")
    .max(120, "Gym name must be at most 120 characters"),
  slug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .max(60, "Slug must be at most 60 characters")
    .regex(SLUG_REGEX, "Slug must be lowercase alphanumeric with hyphens only")
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .email("Invalid gym email format")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  phone: z
    .string()
    .min(6, "Phone must be at least 6 characters")
    .max(20, "Phone must be at most 20 characters")
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .max(500, "Address must be at most 500 characters")
    .optional()
    .or(z.literal("")),
  logoUrl: z.string().url("Logo URL must be a valid URL").optional().or(z.literal("")),
  markdown: z
    .string()
    .max(20000, "Markdown description must be at most 20000 characters")
    .optional()
    .or(z.literal("")),
  description: z
    .string()
    .max(300, "Description must be at most 300 characters")
    .optional()
    .or(z.literal("")),
  admin: createTenantAdminSchema,
});

export const updateTenantSchema = z.object({
  name: z
    .string()
    .min(2, "Gym name must be at least 2 characters")
    .max(120, "Gym name must be at most 120 characters")
    .optional(),
  email: z.string().email("Invalid email format").optional(),
  phone: z
    .string()
    .min(6, "Phone must be at least 6 characters")
    .max(20, "Phone must be at most 20 characters")
    .optional(),
  address: z.string().max(500, "Address must be at most 500 characters").optional(),
  logoUrl: z.string().url("Logo URL must be a valid URL").optional(),
  markdown: z
    .string()
    .max(20000, "Markdown description must be at most 20000 characters")
    .optional(),
  description: z.string().max(300, "Description must be at most 300 characters").optional(),
});

export const updateTenantStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export const recordPlatformPaymentSchema = z.object({
  amount: z.number().int().min(1, "Amount must be at least 1"),
  note: z.string().max(500).optional(),
  extendsUntil: z.string().datetime({ message: "extendsUntil must be a valid ISO datetime" }),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type RecordPlatformPaymentInput = z.infer<typeof recordPlatformPaymentSchema>;
