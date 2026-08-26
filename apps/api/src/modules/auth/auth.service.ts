/**
 * Documentation: Auth service.
 *
 * - Implements the business rules for platform authentication, session lifecycle, bootstrap, and password recovery by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: authService.
 */
import { PlatformRole, type TenantRole } from "@fitconnect/shared/types/enums";
import { isPlatformStaffRole, resolveEffectivePermissions } from "@fitconnect/shared/types/permissions";
import { rolePermissionRepository } from "../roles/roles.repository";
import type { RequestTenantHost } from "../../lib/tenant-host";
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
        id: string;
        tenantId: string;
        role: string;
        tenant: { name: string; slug: string; platformExpiresAt: Date | null };
      }
    | null
    | undefined,
) {
  if (!m) return undefined;
  return {
    id: m.id,
    tenantId: m.tenantId,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug,
    role: m.role,
    platformExpiresAt: m.tenant.platformExpiresAt?.toISOString() ?? null,
  };
}

/**
 * Effective capability list for a signed-in user, resolved for their own gym.
 * The PWA gates navigation and controls on this list, so it must be produced by
 * the same catalog and override rows the API authorizes with.
 */
async function resolveUserPermissions(input: {
  platformRole: PlatformRole;
  tenantRole?: string | null;
  tenantId?: string | null;
}) {
  const overrides = await rolePermissionRepository.listApplicableOverrides(
    input.tenantId ?? null,
  );

  return Array.from(
    resolveEffectivePermissions({
      platformRole: input.platformRole,
      tenantRole: (input.tenantRole as TenantRole | undefined) ?? null,
      overrides,
    }),
  ).sort();
}

/**
 * Reject a sign-in that arrives on a gym subdomain the account does not belong to.
 *
 * Returns an error result to hand straight back to the caller, or null when the
 * sign-in may proceed. Requests carrying no gym context (the app root, the REST
 * collection, a mobile client) are unrestricted — this narrows a gym's sign-in
 * surface, it is not the tenant authorization boundary. That boundary is the
 * per-request permission check, which scopes every read and write to the
 * membership in the token regardless of which host the session was created on.
 */
function checkTenantHostAccess(
  user: {
    platformRole: string;
    memberships: { tenant: { name: string; slug: string } }[];
  },
  requestTenant?: RequestTenantHost | null,
) {
  if (!requestTenant) return null;

  // Platform staff may sign in anywhere so they can reproduce a gym's own view.
  if (isPlatformStaffRole(user.platformRole as PlatformRole)) return null;

  const membership = user.memberships.find(
    (m) => m.tenant.slug === requestTenant.slug,
  );
  if (membership) return null;

  // The password already checked out, so naming the account's own gym leaks
  // nothing the person signing in does not already know — and without it they
  // have no way to find the right address.
  const ownTenant = user.memberships[0]?.tenant;
  const destination = ownTenant
    ? ` Sign in at ${ownTenant.slug}.${requestTenant.rootHost} instead.`
    : "";

  return {
    error: ownTenant
      ? `This account belongs to ${ownTenant.name}, not to this gym.${destination}`
      : "This account is not a member of this gym.",
    status: 403 as const,
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

type ScheduleBackgroundTask = (promise: Promise<unknown>) => void;

function buildResetPasswordUrl(token: string, appUrl?: string) {
  const baseUrl = (appUrl ?? process.env.APP_URL ?? "http://localhost:5173").trim();
  const url = new URL("/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
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
  async login(input: LoginInput, requestTenant?: RequestTenantHost | null) {
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

    // A gym subdomain is a gym-specific sign-in surface. Letting another gym's
    // member authenticate there would show their own data under this gym's
    // branding, which is confusing at best and a convincing phishing surface at
    // worst. Checked only after the password, so a wrong host cannot be used to
    // probe which emails exist.
    const tenantMismatch = checkTenantHostAccess(user, requestTenant);
    if (tenantMismatch) return tenantMismatch;

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

    const membership = mapMembership(user.memberships[0]);

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
          membership,
          permissions: await resolveUserPermissions({
            platformRole: user.platformRole as PlatformRole,
            tenantRole: membership?.role,
            tenantId: membership?.tenantId,
          }),
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

    const membershipRecord = await authRepository.getUserMembership(userId);
    const membership = mapMembership(membershipRecord);

    return {
      data: {
        user: {
          ...user,
          membership,
          permissions: await resolveUserPermissions({
            platformRole: user.platformRole as PlatformRole,
            tenantRole: membership?.role,
            tenantId: membership?.tenantId,
          }),
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
  async forgotPassword(
    input: ForgotPasswordInput,
    appUrl?: string,
    scheduleBackgroundTask?: ScheduleBackgroundTask,
  ) {
    // Deliberately tells the caller when no account matches, rather than the
    // usual "if that email is registered…". A member who mistypes their address
    // otherwise waits for a mail that is never coming, and this is a gym roster
    // rather than a public service. The cost is that the endpoint can be used to
    // test whether an address belongs to a member, which is why the route is
    // rate limited — see `middleware/abuse-guard`.
    const user = await authRepository.findUserByEmail(input.email);
    if (!user) {
      return {
        error: "No account found with this email address.",
        status: 404 as const,
      };
    }

    if (user.status !== "ACTIVE") {
      return {
        error: "This account is not active. Please ask your gym to restore it.",
        status: 403 as const,
      };
    }

    // Clean up old expired tokens
    await authRepository.deleteExpiredPasswordResetTokens(user.id);

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await authRepository.createPasswordResetToken(user.id, token, expiresAt);

    const resetUrl = buildResetPasswordUrl(token, appUrl);

    // Fire-and-forget — don't await so endpoint responds instantly
    // Fire-and-forget keeps the endpoint latency predictable even if the SMTP
    // provider is slow or temporarily unavailable.
    const sendResetEmail = emailService
      .sendPasswordResetEmail(user.email, user.name, resetUrl)
      .catch((err) => {
        console.error("Password reset email failed.", err);
      });

    if (scheduleBackgroundTask) {
      scheduleBackgroundTask(sendResetEmail);
    } else {
      await sendResetEmail;
    }

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
