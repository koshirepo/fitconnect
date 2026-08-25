/**
 * Documentation: JWT access and refresh token utilities.
 *
 * - Signs and verifies HMAC-based access tokens, and defines the tenant-role map shape embedded in JWT claims.
 * - Generates opaque refresh tokens plus their expiry timestamps for persistence in the auth repository.
 * - Primary exports: signAccessToken, verifyAccessToken, generateRefreshToken, refreshTokenExpiresAt, JwtTenants.
 */
import { SignJWT, jwtVerify } from "jose";
import type { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";
import { config } from "../config";

/**
 * Utility helper for the auth module that owns the `get jwt secret` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

// ─── Access Token ─────────────────────────────────────────────────────────────

/** Tenant membership map encoded into JWT: { [tenantId]: role } */
export type JwtTenants = Record<string, TenantRole>;
type AccessTokenPayload = {
  sub: string;
  platformRole: PlatformRole;
  tenants: JwtTenants;
  type: "access";
};

/**
 * Utility helper for the auth module that owns the `sign access token` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const signAccessToken = async (input: {
  userId: string;
  platformRole: PlatformRole;
  tenants?: JwtTenants;
}) => {
  return new SignJWT({
    platformRole: input.platformRole,
    tenants: input.tenants ?? {},
    type: "access",
  } satisfies Omit<AccessTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtAccessTtlSeconds}s`)
    .sign(getJwtSecret());
};

/**
 * Utility helper for the auth module that owns the `verify access token` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const verifyAccessToken = async (token: string) => {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ["HS256"],
  });

  if (payload.type !== "access" || typeof payload.sub !== "string") {
    throw new Error("Invalid token payload.");
  }

  if (typeof payload.platformRole !== "string") {
    throw new Error("Token missing platform role.");
  }

  return {
    userId: payload.sub,
    platformRole: payload.platformRole as PlatformRole,
    tenants: (payload.tenants ?? {}) as JwtTenants,
  };
};

// ─── Refresh Token ────────────────────────────────────────────────────────────

/**
 * Utility helper for the auth module that owns the `generate refresh token` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const generateRefreshToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Utility helper for the auth module that owns the `refresh token expires at` step.
 * Keeping this logic isolated avoids repeating the same parsing, formatting, mapping, or transport behavior elsewhere.
 */
export const refreshTokenExpiresAt = (): Date => {
  return new Date(Date.now() + config.jwtRefreshTtlSeconds * 1000);
};
