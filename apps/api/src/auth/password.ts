import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { config } from "../config";

export const hashPassword = (plainPassword: string) => {
  return hash(plainPassword, config.bcryptSaltRounds);
};

export const verifyPassword = (plainPassword: string, passwordHash: string) => {
  return compare(plainPassword, passwordHash);
};

export const generateRandomPassword = (length = 12): string => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
};
