/**
 * Documentation: Public tenant self-registration schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types for the unauthenticated list-your-gym flow, where an owner registers their own gym instead of waiting for a platform admin to create it.
 * - Deliberately narrower than `createTenantSchema`: an owner names their gym, their address, and themselves. Never a status, never a platform role, never a plan or an amount — a self-registered gym is born SUSPENDED and only a platform admin can change that.
 * - The slug is the gym's permanent public address, so it is validated here against the same shape and the same reserved prefixes the host parser enforces at request time.
 * - Primary exports: registerTenantSchema, checkSlugSchema, RegisterTenantInput, CheckSlugInput.
 */
import { z } from "zod";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  SLUG_REGEX,
} from "@fitconnect/shared/constants";
import { RESERVED_SUBDOMAIN_PREFIXES } from "@fitconnect/shared/tenant-host";
import { dataUrlField } from "../../lib/data-url-image";

/**
 * A gym address the platform can actually hand out.
 *
 * Reserved prefixes are refused rather than silently suffixed: `api.example.com`
 * is never going to resolve to a gym, so accepting it and quietly renaming it to
 * `api-2` would hand the owner an address they did not choose.
 */
const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Address must be at least 3 characters")
  .max(60, "Address must be at most 60 characters")
  .regex(SLUG_REGEX, "Use lowercase letters, numbers, and hyphens only")
  .refine(
    (value) => !RESERVED_SUBDOMAIN_PREFIXES.has(value),
    "That address is reserved. Please choose another.",
  );

export const checkSlugSchema = z.object({
  slug: slugField,
});

export const registerTenantSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Gym name must be at least 2 characters")
    .max(120, "Gym name must be at most 120 characters"),
  /**
   * Required here, unlike the admin form.
   *
   * An admin creating a gym can let the server derive a slug from the name and
   * fix it afterwards. An owner registering their own gym is choosing the web
   * address they will print on a board, so they pick it deliberately and get
   * told up front if it is taken.
   */
  slug: slugField,
  /**
   * Required. A gym with no logo has a public page and an ID card with a blank
   * where its identity should be, and the owner registering it is the only
   * person who can supply one.
   *
   * It rides along in the body rather than going through `/uploads` first,
   * because that endpoint needs a session and this caller has none.
   */
  logoDataUrl: dataUrlField({
    required: "A logo is required.",
    tooLarge: "That logo is too large. Maximum size is 5 MB.",
    unsupported: "That logo format is not supported.",
  }),
  email: z
    .string()
    .trim()
    .email("Invalid gym email format")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  phone: z
    .string()
    .trim()
    .min(6, "Phone must be at least 6 characters")
    .max(20, "Phone must be at most 20 characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  address: z
    .string()
    .trim()
    .max(500, "Address must be at most 500 characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  description: z
    .string()
    .trim()
    .max(300, "Description must be at most 300 characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),
  owner: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Your name must be at least 2 characters")
      .max(120, "Your name must be at most 120 characters"),
    email: z
      .string()
      .trim()
      .email("Invalid email format")
      .transform((v) => v.toLowerCase()),
    phone: z
      .string()
      .trim()
      .min(10, "Phone must be at least 10 characters")
      .max(15, "Phone must be at most 15 characters")
      .optional()
      .or(z.literal(""))
      .transform((v) => v || undefined),
    /**
     * Required, on the same grounds the member signup requires one: the owner
     * is a person the gym's own staff and members will see in the app, and a
     * self-registration is the one moment they can be asked for a photo.
     */
    avatarDataUrl: dataUrlField({
      required: "A photo is required.",
      tooLarge: "That photo is too large. Maximum size is 5 MB.",
      unsupported: "That photo format is not supported.",
    }),
    /**
     * The owner chooses it, so registering ends inside the dashboard rather
     * than at an inbox waiting for a generated password to arrive.
     */
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters`),
  }),
});

export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;
export type CheckSlugInput = z.infer<typeof checkSlugSchema>;
