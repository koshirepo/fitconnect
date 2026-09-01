/**
 * Documentation: Public tenant self-registration service.
 *
 * - Implements the list-your-gym flow for an owner with no account: it creates the gym, the owner's user, and the ADMIN membership that ties them together, then hands the browser a session.
 * - The gym is born SUSPENDED, which is what keeps self-registration safe. A suspended tenant is absent from `/public/gyms`, its slug does not resolve for members, and nobody can join it — the owner can sign in and set the place up, and a platform admin turns it on through the existing `PATCH /tenants/:tenantId/status`.
 * - Nothing here grants platform privileges. The owner is a plain `USER` who happens to hold ADMIN inside one gym, exactly like an admin-created tenant owner.
 * - The subdomain is registered in the background, the same as admin-created gyms: certificate issuance takes minutes and the owner should not wait on Cloudflare to see their dashboard.
 * - Primary exports: tenantSignupService.
 */
import { PlatformRole, type TenantRole } from "@fitconnect/shared/types/enums";
import { hashPassword } from "../../auth/password";
import {
  generateRefreshToken,
  refreshTokenExpiresAt,
  signAccessToken,
} from "../../auth/jwt";
import { provisionTenantSubdomain } from "../../lib/tenant-subdomain";
import { authRepository } from "../auth/auth.repository";
import { tenantRepository } from "../tenants/tenants.repository";
import type { RegisterTenantInput } from "./tenant-signup.schema";

type ServiceError = { error: string; status: 400 | 403 | 404 | 409 };

/**
 * What the service takes: the parsed request with both images already stored.
 *
 * The controller uploads them and swaps the data URLs for the URLs they landed
 * at, so nothing below this line handles base64.
 */
type RegisterTenantServiceInput = Omit<RegisterTenantInput, "logoDataUrl" | "owner"> & {
  logoUrl: string;
  owner: Omit<RegisterTenantInput["owner"], "avatarDataUrl"> & { avatarUrl: string };
};

/**
 * Whether a gym address is free.
 *
 * Read-only, and deliberately says nothing about who holds a taken slug — the
 * answer a registration form needs is only "pick another one".
 */
async function slugTaken(slug: string) {
  return Boolean(await tenantRepository.findBySlug(slug));
}

export const tenantSignupService = {
  /** Whether a gym address is still available, for the form's inline check. */
  async checkSlug(slug: string) {
    return { data: { slug, available: !(await slugTaken(slug)) } };
  },

  /**
   * Register a gym and its owner in one step.
   *
   * Every uniqueness check is made before anything is written, so a rejected
   * registration leaves no half-made gym behind.
   */
  async register(
    input: RegisterTenantServiceInput,
    scheduleBackgroundTask?: (promise: Promise<unknown>) => void,
  ): Promise<{ data: unknown } | ServiceError> {
    if (await slugTaken(input.slug)) {
      return {
        error: "That address is already taken. Please choose another.",
        status: 409,
      };
    }

    if (input.phone) {
      const existingPhone = await tenantRepository.findByPhone(input.phone);
      if (existingPhone) {
        return {
          error: "A gym with this phone number is already registered.",
          status: 409,
        };
      }
    }

    /**
     * An existing account cannot be claimed from here.
     *
     * The admin-created path reuses a matching user on purpose: a platform
     * admin naming an email has verified who it belongs to. Nobody has
     * verified anything on this path, so reusing an account would let a
     * stranger attach a gym to somebody else's login. They sign in and create
     * the gym from inside the app instead.
     */
    const existingUser = await tenantRepository.findUserByEmail(input.owner.email);
    if (existingUser) {
      return {
        error:
          "An account with this email already exists. Please sign in first, or use a different email.",
        status: 409,
      };
    }

    const { tenant, userId } = await tenantRepository.createWithAdmin({
      tenant: {
        name: input.name,
        slug: input.slug,
        // Awaiting review. Nothing else in the app has to know this flow
        // exists: every public read already filters on ACTIVE.
        status: "SUSPENDED",
        logoUrl: input.logoUrl,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.description ? { description: input.description } : {}),
      },
      admin: {
        name: input.owner.name,
        email: input.owner.email,
        avatarUrl: input.owner.avatarUrl,
        ...(input.owner.phone ? { phone: input.owner.phone } : {}),
        passwordHash: await hashPassword(input.owner.password),
      },
    });

    // The gym's own address. Registered now rather than at approval so the
    // owner can hand out the link straight away, and so approval stays the
    // single database flip it is today.
    const provisioning = provisionTenantSubdomain(input.slug).then((outcome) => {
      if (outcome.status === "failed") {
        console.error("Tenant subdomain provisioning failed.", {
          slug: input.slug,
          hostname: outcome.hostname,
          reason: outcome.reason,
        });
      }
      return outcome;
    });

    if (scheduleBackgroundTask) {
      scheduleBackgroundTask(provisioning);
    }

    // A session for the account just created, so registering ends inside the
    // dashboard rather than at a login form. ADMIN of one gym is all it
    // carries — and that gym is suspended until somebody approves it.
    const accessToken = await signAccessToken({
      userId,
      platformRole: PlatformRole.USER,
      tenants: { [tenant.id]: "ADMIN" as TenantRole },
    });
    const refreshToken = generateRefreshToken();
    await authRepository.createRefreshToken(
      userId,
      refreshToken,
      refreshTokenExpiresAt(),
    );

    return {
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        },
        auth: { accessToken, refreshToken },
        loginEmail: input.owner.email,
        ...(scheduleBackgroundTask ? {} : { subdomain: await provisioning }),
      },
    };
  },
};
