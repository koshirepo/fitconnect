/**
 * Documentation: Members schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for tenant membership lifecycle, profile updates, reporting, and status management.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: addMemberSchema, updateMemberRoleSchema, updateMyProfileSchema, updateMemberSchema, updateMemberStatusSchema, AddMemberInput, UpdateMemberRoleInput, UpdateMyProfileInput, UpdateMemberInput, UpdateMemberStatusInput.
 */
import { email, z } from "zod";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@fitconnect/shared/constants";

export const addMemberSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().optional(),
  phone: z.string().min(10).max(15),
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key created by the gym. */
  role: z.string().min(2).max(60).default("MEMBER"),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  avatarUrl: z.string().optional(),
  subscriptionId: z.string().optional(),
  chargeIds: z.array(z.string()).optional(),
  shiftId: z.string().optional(),
  referredByMembershipId: z.string().optional(),
});

export const updateMemberRoleSchema = z.object({
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key created by the gym. */
  role: z.string().min(2).max(60),
});

export const updateMyProfileSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    phone: z.string().min(10).max(15).nullable().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
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
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .max(MAX_PASSWORD_LENGTH)
    .optional(),
  shiftId: z.string().nullable().optional(),
});

export const updateMemberStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
