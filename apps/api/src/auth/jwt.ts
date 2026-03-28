import { SignJWT, jwtVerify } from "jose";
import type { PlatformRole, TenantRole } from "../shared/types/enums";
import { config } from "../config";

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

export const generateRefreshToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const refreshTokenExpiresAt = (): Date => {
  return new Date(Date.now() + config.jwtRefreshTtlSeconds * 1000);
};
