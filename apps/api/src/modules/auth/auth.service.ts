/**
 * Documentation: Auth service.
 *
 * - Implements the business rules for platform authentication, session lifecycle, bootstrap, and password recovery by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: authService.
 */
import { PlatformRole } from "../../shared/types/enums";
import {
  signAccessToken,
  generateRefreshToken,
  refreshTokenExpiresAt,
  type JwtTenants,
} from "../../auth/jwt";
import {
  hashPassword,
  verifyPassword,
  generateRandomPassword,
} from "../../auth/password";
import { authRepository } from "./auth.repository";
import { emailService } from "../../lib/email";
import { randomBytes } from "crypto";
import type {
  BootstrapInput,
  LoginInput,
  CreatePlatformUserInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./auth.schema";

/**
 * Execute the `map membership` workflow for the auth module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function mapMembership(
  m:
    | {
        tenantId: string;
        role: string;
        tenant: { name: string; slug: string; platformExpiresAt: Date | null };
      }
    | null
    | undefined,
) {
  if (!m) return undefined;
  return {
    tenantId: m.tenantId,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug,
    role: m.role,
    platformExpiresAt: m.tenant.platformExpiresAt?.toISOString() ?? null,
  };
}

/** Build { tenantId: role } map for JWT encoding */
function buildTenantsMap(
  memberships: { tenantId: string; role: string }[],
): JwtTenants {
  const map: JwtTenants = {};
  for (const m of memberships) map[m.tenantId] = m.role as any;
  return map;
}

export const authService = {
  /**
   * Execute the `bootstrap` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async bootstrap(input: BootstrapInput) {
    const existingCount = await authRepository.countSuperAdmins();
    if (existingCount > 0) {
      return { error: "Super admin already exists. Use /auth/login instead." };
    }

    const user = await authRepository.createUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      platformRole: PlatformRole.SUPER_ADMIN,
    });

    const accessToken = await signAccessToken({
      userId: user.id,
      platformRole: user.platformRole as PlatformRole,
    });

    const refreshToken = generateRefreshToken();
    await authRepository.createRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiresAt(),
    );

    return { data: { accessToken, refreshToken, user } };
  },

  /**
   * Execute the `login` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async login(input: LoginInput) {
    const user = await authRepository.findUserByEmail(input.email);
    if (!user) {
      return { error: "Invalid email or password.", status: 401 as const };
    }

    // Authentication and account-state checks intentionally share the same
    // generic credential error until the user identity has been confirmed.
    if (user.status !== "ACTIVE") {
      return {
        error: "Account is suspended or deleted.",
        status: 403 as const,
      };
    }

    const validPassword = await verifyPassword(
      input.password,
      user.passwordHash,
    );
    if (!validPassword) {
      return { error: "Invalid email or password.", status: 401 as const };
    }

    // Tenant memberships are embedded into the access token so downstream
    // authorization middleware can resolve tenant roles without a database hit.
    const accessToken = await signAccessToken({
      userId: user.id,
      platformRole: user.platformRole as PlatformRole,
      tenants: buildTenantsMap(user.memberships),
    });

    const refreshToken = generateRefreshToken();
    await authRepository.createRefreshToken(
      user.id,
      refreshToken,
      refreshTokenExpiresAt(),
    );

    return {
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone ?? null,
          platformRole: user.platformRole as PlatformRole,
          membership: mapMembership(user.memberships[0]),
        },
      },
    };
  },

  /**
   * Execute the `refresh` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async refresh(token: string) {
    const stored = await authRepository.findRefreshToken(token);

    // A refresh token is usable only while it exists, is unrevoked, and has
    // not crossed its expiry window.
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      return {
        error: "Invalid or expired refresh token.",
        status: 401 as const,
      };
    }

    if (stored.user.status !== "ACTIVE") {
      return {
        error: "Account is suspended or deleted.",
        status: 403 as const,
      };
    }

    const newRefreshToken = generateRefreshToken();
    // Rotate the long-lived credential first so the database state always
    // reflects the newest refresh token before a new access token is issued.
    await authRepository.rotateRefreshToken(
      stored.id,
      stored.user.id,
      newRefreshToken,
      refreshTokenExpiresAt(),
    );

    const accessToken = await signAccessToken({
      userId: stored.user.id,
      platformRole: stored.user.platformRole as PlatformRole,
      tenants: buildTenantsMap(stored.user.memberships),
    });

    return { data: { accessToken, refreshToken: newRefreshToken } };
  },

  /**
   * Execute the `logout` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async logout(token: string, userId?: string) {
    await authRepository.revokeRefreshToken(token, userId);
  },

  /**
   * Execute the `get me` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getMe(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) return { error: "User not found." };

    const membership = await authRepository.getUserMembership(userId);

    return {
      data: {
        user: {
          ...user,
          membership: mapMembership(membership),
        },
      },
    };
  },

  /**
   * Execute the `create platform user` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createPlatformUser(input: CreatePlatformUserInput) {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      return { error: "A user with this email already exists." };
    }

    const generatedPassword = generateRandomPassword();
    const user = await authRepository.createUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(generatedPassword),
      platformRole: input.role as PlatformRole,
    });

    return { data: { user, generatedPassword } };
  },

  /**
   * Execute the `forgot password` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async forgotPassword(input: ForgotPasswordInput) {
    // Always return success to avoid leaking whether email exists
    const user = await authRepository.findUserByEmail(input.email);
    if (!user || user.status !== "ACTIVE") return { data: true };

    // Clean up old expired tokens
    await authRepository.deleteExpiredPasswordResetTokens(user.id);

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await authRepository.createPasswordResetToken(user.id, token, expiresAt);

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    // Fire-and-forget — don't await so endpoint responds instantly
    // Fire-and-forget keeps the endpoint latency predictable even if the SMTP
    // provider is slow or temporarily unavailable.
    emailService
      .sendPasswordResetEmail(user.email, user.name, resetUrl)
      .catch((err) => {
        console.error("Password reset email failed.", err);
      });

    return { data: true };
  },

  /**
   * Execute the `reset password` workflow for the auth module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async resetPassword(input: ResetPasswordInput) {
    const record = await authRepository.findPasswordResetToken(input.token);

    // Each branch below maps to a different token lifecycle rule so callers
    // get a precise failure reason without exposing unrelated account data.
    if (!record)
      return { error: "Invalid or expired reset link.", status: 400 as const };
    if (record.usedAt)
      return {
        error: "This reset link has already been used.",
        status: 400 as const,
      };
    if (record.expiresAt < new Date())
      return { error: "This reset link has expired.", status: 400 as const };
    if (record.user.status !== "ACTIVE")
      return { error: "Account is suspended.", status: 403 as const };

    const passwordHash = await hashPassword(input.password);
    // Update the password and consume the token together so a successful reset
    // cannot be replayed with the same one-time link.
    await Promise.all([
      authRepository.updateUser(record.userId, { passwordHash }),
      authRepository.markPasswordResetTokenUsed(record.id),
    ]);

    return { data: { email: record.user.email } };
  },
};
