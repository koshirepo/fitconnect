/**
 * Documentation: Password hashing utilities.
 *
 * - Wraps bcrypt hashing and verification so password-handling policy stays consistent across auth and member-management flows.
 * - Also produces strong temporary passwords for admin-created accounts and member reset flows.
 * - Primary exports: hashPassword, verifyPassword, generateRandomPassword.
 */
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { config } from "../config";

/**
 * Utility helper for the auth module that owns the `hash password` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const hashPassword = (plainPassword: string) => {
  return hash(plainPassword, config.bcryptSaltRounds);
};

/**
 * Utility helper for the auth module that owns the `verify password` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const verifyPassword = (plainPassword: string, passwordHash: string) => {
  return compare(plainPassword, passwordHash);
};

/**
 * Utility helper for the auth module that owns the `generate random password` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const generateRandomPassword = (length = 12): string => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
};
