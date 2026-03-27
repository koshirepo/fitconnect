import { z } from "zod";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../../shared/constants";

export const addMemberSchema = z.object({
  name: z.string().min(2).max(120),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  phone: z.string().min(10).max(15),
  role: z.enum(["MEMBER", "COACH", "ADMIN"]).default("MEMBER"),
  avatarUrl: z.string().optional(),
  subscriptionId: z.string().optional(),
  chargeIds: z.array(z.string()).optional(),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["MEMBER", "COACH", "ADMIN"]),
});

export const updateMyProfileSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().min(10).max(15).nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH)
      .max(MAX_PASSWORD_LENGTH)
      .optional(),
  })
  .refine(
    (data) => {
      if (data.newPassword && !data.currentPassword) return false;
      return true;
    },
    {
      message: "currentPassword is required when changing password.",
      path: ["currentPassword"],
    },
  );

export const updateMemberSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(10).max(15).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH)
    .optional(),
});

export const updateMemberStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
