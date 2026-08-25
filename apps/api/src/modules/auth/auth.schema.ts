/**
 * Documentation: Auth schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for platform authentication, session lifecycle, bootstrap, and password recovery.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: bootstrapSchema, loginSchema, refreshTokenSchema, createPlatformUserSchema, forgotPasswordSchema, resetPasswordSchema, BootstrapInput, LoginInput, CreatePlatformUserInput, ForgotPasswordInput, ResetPasswordInput.
 */
import { z } from "zod";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@fitconnect/shared/constants";

export const bootstrapSchema = z.object({
  name: z.string().min(2).max(120),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  phone: z.string().min(10).max(15),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createPlatformUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  phone: z.string().min(10).max(15),
  role: z.enum(["SUPER_ADMIN", "SUPPORT"]),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

export type BootstrapInput = z.infer<typeof bootstrapSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreatePlatformUserInput = z.infer<typeof createPlatformUserSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
