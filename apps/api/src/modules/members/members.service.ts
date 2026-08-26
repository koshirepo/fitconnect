/**
 * Documentation: Members service.
 *
 * - Implements the business rules for tenant membership lifecycle, profile updates, reporting, and status management by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: memberService.
 */
import { PlatformRole, type TenantRole } from "@fitconnect/shared/types/enums";
import { TenantRole as TenantRoleKeys } from "@fitconnect/shared/types/enums";
import { rolePermissionRepository } from "../roles/roles.repository";
import {
  hashPassword,
  verifyPassword,
  generateRandomPassword,
} from "../../auth/password";
import { memberRepository } from "./members.repository";
import { flattenMemberUser, flattenNestedMember } from "../../lib/flatten";
import { deleteFileByUrl, type StorageOptions } from "../../lib/storage";
import type {
  AddMemberInput,
  UpdateMemberInput,
  UpdateMyProfileInput,
} from "./members.schema";
import { prisma } from "../../lib/prisma";
import { emailService } from "../../lib/email";
import { settingsRepository } from "../settings/settings.repository";
import { pushService } from "../push/push.service";
import { buildIdCardUrl, idCardService } from "../public/id-card.service";
import { renderWhatsAppTemplate } from "@fitconnect/shared/whatsapp-templates";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;
type ServiceError = { error: string; status?: 400 | 403 | 404 | 409 };
type AddMemberResult = {
  membership: { id: string; [key: string]: unknown };
  [key: string]: unknown;
};
const DEFAULT_OVERDUE_DAYS = 30;

/**
 * A role key is valid for a gym when it is one of the built-in tenant roles or
 * an active custom role in that gym's registry.
 */
async function isTenantRoleValid(tenantId: string, role: string) {
  if ((TenantRoleKeys as Record<string, string>)[role]) return true;
  return Boolean(
    await rolePermissionRepository.findCustomRole(tenantId, "TENANT", role),
  );
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function flattenReferralMember<
  T extends {
    user: { id: string; [key: string]: unknown };
    [key: string]: unknown;
  },
>(membership: T) {
  return flattenMemberUser(membership);
}

function flattenMemberDetail<
  T extends {
    user: { id: string; [key: string]: unknown };
    referredBy?: {
      user: { id: string; [key: string]: unknown };
      [key: string]: unknown;
    } | null;
    referrals: Array<{
      user: { id: string; [key: string]: unknown };
      [key: string]: unknown;
    }>;
    _count: { referrals: number };
    [key: string]: unknown;
  },
>(membership: T) {
  const flat = flattenMemberUser(membership);
  const {
    _count: _ignoredCount,
    referredBy: _ignoredReferredBy,
    referrals: _ignoredReferrals,
    ...rest
  } = flat;
  return {
    ...rest,
    referredBy: membership.referredBy ? flattenReferralMember(membership.referredBy) : null,
    referrals: membership.referrals.map((referral) => flattenReferralMember(referral)),
    referralCount: membership._count.referrals,
  };
}

function flattenReferralLeader<
  T extends {
    user: { id: string; [key: string]: unknown };
    referrals: Array<{
      user: { id: string; [key: string]: unknown };
      [key: string]: unknown;
    }>;
    _count: { referrals: number };
    [key: string]: unknown;
  },
>(membership: T) {
  const flat = flattenMemberUser(membership);
  const { _count: _ignoredCount, referrals: _ignoredReferrals, ...rest } = flat;
  return {
    ...rest,
    referrals: membership.referrals.map((referral) => flattenReferralMember(referral)),
    referralCount: membership._count.referrals,
  };
}

async function cleanupPreviousAsset(
  label: string,
  previousUrl: string | null | undefined,
  nextUrl: string | null | undefined,
  storage: StorageOptions = {},
  scheduleBackgroundTask?: BackgroundTaskScheduler,
) {
  if (!previousUrl || previousUrl === nextUrl) {
    return;
  }

  const cleanup = deleteFileByUrl(previousUrl, storage).catch((error) => {
    console.error(`Failed to delete previous ${label}.`, {
      previousUrl,
      nextUrl,
      error,
    });
  });

  if (scheduleBackgroundTask) {
    scheduleBackgroundTask(cleanup);
    return;
  }

  await cleanup;
}

/**
 * Enforce that an email and phone are not already in use inside this gym.
 *
 * Returns a ready-to-return error when the contact is taken, or null when it is
 * free. The message names the member holding it, because "email already in use"
 * with twenty-odd members and no pointer is a dead end for whoever is on the
 * front desk.
 */
async function checkContactIsFree(
  tenantId: string,
  contact: { email?: string | null; phone?: string | null },
  excludeMembershipId?: string,
) {
  const clash = await memberRepository.findMembershipByContact(
    tenantId,
    contact,
    excludeMembershipId,
  );
  if (!clash) return null;

  const emailTaken = Boolean(contact.email) && clash.user.email === contact.email;
  const field = emailTaken ? "email address" : "phone number";
  const value = emailTaken ? contact.email : contact.phone;

  return {
    error: `That ${field} (${value}) already belongs to #${clash.memberId} ${clash.user.name} in this gym.`,
    status: 409 as const,
  };
}

export const memberService = {
  /**
   * Execute the `add member` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async addMember(
    tenantId: string,
    input: AddMemberInput,
    callerRole: TenantRole | null,
    scheduleBackgroundTask?: BackgroundTaskScheduler,
    /** Who is adding them — excluded from the admin notification below. */
    actorUserId?: string,
  ): Promise<{ data: AddMemberResult } | ServiceError> {
    // Coaches can only add members (not other coaches or admins, and not
    // custom roles — those carry their own permissions).
    if (callerRole === "COACH" && input.role !== "MEMBER") {
      return { error: "Coaches can only add members.", status: 403 as const };
    }

    // The role must exist: a built-in tenant role or a custom role in this gym.
    if (!(await isTenantRoleValid(tenantId, input.role))) {
      return { error: `Unknown role: ${input.role}.`, status: 400 as const };
    }

    // A photo is part of the record for everyone except an admin, who is
    // trusted to add one from the desk and fill the photo in later. Platform
    // staff (no tenant role) fall under the same trust.
    if (callerRole && callerRole !== "ADMIN" && !input.avatarUrl) {
      return { error: "A photo is required.", status: 400 as const };
    }

    const contactClash = await checkContactIsFree(tenantId, {
      email: input.email,
      phone: input.phone,
    });
    if (contactClash) return contactClash;

    let user;
    if(input.email){
      user = await memberRepository.findUserByEmail(input.email);
    }
    if (!user) {
      user = await memberRepository.createUser({
        name: input.name,
        phone: input.phone,
        email: input.email || `${input.phone}@${input.name.replaceAll(' ', '')}.com`,
        passwordHash: await hashPassword(input.phone),
        platformRole: PlatformRole.USER,
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
        ...(input.gender ? { gender: input.gender } : {}),
      });
    }

    const existingMembership = await memberRepository.findMembershipForUser(
      user.id,
    );
    if (existingMembership) {
      if (existingMembership.tenantId === tenantId) {
        if (existingMembership.status === "DELETED") {
          return {
            error:
              "This email is already linked to a deleted member record in this gym. Restore that member or use a different email address.",
            status: 409 as const,
          };
        }

        return {
          error: "User is already a member of this tenant.",
          status: 409 as const,
        };
      }

      return {
        error: `This email is already linked to ${existingMembership.tenant.name}. Use a different email address for this member.`,
        status: 409 as const,
      };
    }

    let subscription: {
      id: string;
      amount: number;
      durationDays: number;
      title: string;
      badges: { id: string }[];
    } | null = null;
    let charges: { id: string; name: string; amount: number }[] = [];
    let shift: {
      id: string;
      tenantId: string;
      name: string;
      description: string | null;
      startTime: string;
      endTime: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    } | null = null;
    let referredByMembership: { id: string } | null = null;

    const [subscriptionResult, chargesResult, shiftResult, referredByResult] = await Promise.all([
      input.subscriptionId
        ? prisma.subscription.findFirst({
            where: { id: input.subscriptionId, tenantId, isActive: true },
            select: {
              id: true,
              amount: true,
              durationDays: true,
              title: true,
              badges: {
                select: { id: true },
              },
            },
          })
        : null,
      input.chargeIds && input.chargeIds.length > 0
        ? prisma.tenantCharge.findMany({
            where: { id: { in: input.chargeIds }, tenantId, isActive: true },
            select: { id: true, name: true, amount: true },
          })
        : prisma.tenantCharge.findMany({
            where: { tenantId, isMandatory: true, isActive: true },
            select: { id: true, name: true, amount: true },
          }),
      input.shiftId
        ? prisma.shift.findFirst({
            where: { id: input.shiftId, tenantId, isActive: true },
            select: {
              id: true,
              tenantId: true,
              name: true,
              description: true,
              startTime: true,
              endTime: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          })
        : null,
      input.referredByMembershipId
        ? memberRepository.findReferralCandidate(tenantId, input.referredByMembershipId)
        : null,
    ]);

    subscription = subscriptionResult;
    charges = chargesResult;
    shift = shiftResult;
    referredByMembership = referredByResult;

    if (input.subscriptionId && !subscription) {
      return { error: "Subscription plan not found.", status: 404 as const };
    }
    if (subscription?.badges.length) {
      return {
        error:
          "Badge-restricted plans cannot be assigned while adding a new member. Assign the badge first, then record the payment.",
        status: 400 as const,
      };
    }
    if (input.shiftId && !shift) {
      return { error: "Shift not found.", status: 404 as const };
    }
    if (input.referredByMembershipId && !referredByMembership) {
      return { error: "Referring member not found.", status: 404 as const };
    }

    const membership = await memberRepository.createMembership(
      tenantId,
      user.id,
      input.role,
      input.shiftId,
      input.referredByMembershipId,
    );

    // Create payments for charges and subscription in parallel
    const now = new Date();
    const paymentPromises: Promise<{
      id: string;
      amount: number;
      description: string | null;
    }>[] = [];

    for (const charge of charges) {
      paymentPromises.push(
        prisma.payment.create({
          data: {
            tenantId,
            membershipId: membership.id,
            chargeId: charge.id,
            amount: charge.amount,
            description: charge.name,
            status: "COMPLETED",
            paidAt: now,
          },
          select: { id: true, amount: true, description: true },
        }),
      );
    }

    if (subscription) {
      const validFrom = now;
      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + subscription.durationDays);

      paymentPromises.push(
        prisma.payment.create({
          data: {
            tenantId,
            membershipId: membership.id,
            subscriptionId: subscription.id,
            amount: subscription.amount,
            status: "COMPLETED",
            paidAt: now,
            validFrom,
            validUntil,
          },
          select: { id: true, amount: true, description: true },
        }),
      );
    }

    const payments = await Promise.all(paymentPromises);

    // Fetch tenant name and template overrides for notifications
    const [tenant, settings] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      }),
      settingsRepository.getSettings(tenantId),
    ]);
    const gymName = tenant?.name ?? "Fit Connect";

    // Build WhatsApp message for auto-open on frontend
    const formatInr = (amount: number) =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
      }).format(amount);
    const total = payments.reduce((s, p) => s + p.amount, 0);
    const paymentLines = payments
      .map((p) => `- ${p.description ?? "Payment"}: ${formatInr(p.amount)}`)
      .join("\n");

    const paymentSummarySection =
      payments.length > 0
        ? `Payment Summary\n${paymentLines}\nTotal: ${formatInr(total)}\n\n`
        : "";
    const subscriptionLine = subscription
      ? `Plan: *${subscription.title}* (${subscription.durationDays} days)\n\n`
      : "";

    // A stable link. What it shows is re-read every time it is opened, so a
    // later photo change or renewal appears on the same URL.
    const tenantSlug = await prisma.tenant
      .findUnique({ where: { id: tenantId }, select: { slug: true } })
      .then((row) => row?.slug ?? null);
    const idCardUrl =
      tenantSlug && membership.idCardToken
        ? buildIdCardUrl(tenantSlug, membership.idCardToken)
        : null;

    const whatsappText = renderWhatsAppTemplate(
      "new_member_welcome",
      {
        gymName,
        memberName: input.name,
        memberId: membership.memberId,
        email: input.email,
        paymentSummarySection,
        subscriptionLine,
        idCardLine: idCardUrl
          ? `

Your membership card: ${idCardUrl}`
          : "",
      },
      settings?.whatsappTemplates,
    );

    // The gym's admins hear about the admission and, when money changed hands
    // with it, about the payment. Both go out in the background: a push
    // provider having a slow day must not hold up the response.
    // A member who gave a real address gets their credentials by email. The
    // synthetic `phone@name.com` address invented for phone-only members is
    // not a mailbox, so there is nothing to send to.
    const welcomeEmailTo = input.email?.trim() ? input.email.trim() : null;


    const sendWelcomeEmail = async () => {
      if (!welcomeEmailTo) return;
      try {
        await emailService.sendWelcomeEmail({
          to: welcomeEmailTo,
          memberName: input.name,
          gymName,
          email: welcomeEmailTo,
          // The phone number is what `createUser` hashed as the password.
          password: input.phone,
          memberId: membership.memberId,
          idCardUrl,
          payments: payments.map((payment) => ({
            description: payment.description,
            amount: payment.amount,
          })),
          ...(subscription
            ? {
                subscriptionTitle: subscription.title,
                subscriptionDays: subscription.durationDays,
              }
            : {}),
        });
      } catch (error) {
        // A mail server having a bad day must not fail an admission that has
        // already been written.
        console.error("Welcome email failed.", { membershipId: membership.id, error });
      }
    };

    const notifyAdmins = async () => {
      await pushService.notifyNewMember(tenantId, {
        membershipId: membership.id,
        memberId: membership.memberId,
        name: input.name,
        actorUserId,
      });

      if (total > 0) {
        await pushService.notifyPaymentReceived(tenantId, {
          amount: total,
          memberId: membership.memberId,
          memberName: input.name,
          description: subscription?.title ?? null,
          source: "DESK",
          actorUserId,
        });
      }
    };

    if (scheduleBackgroundTask) {
      scheduleBackgroundTask(Promise.all([notifyAdmins(), sendWelcomeEmail()]));
    } else {
      await Promise.all([notifyAdmins(), sendWelcomeEmail()]);
    }

    return {
      data: {
        membership: flattenNestedMember(membership),
        payments,
        whatsappText,
        /** Whether a welcome email was dispatched to a real address. */
        emailSent: Boolean(welcomeEmailTo),
        /** Stable link to this member's card; its contents render live. */
        idCardUrl,
      },
    };
  },

  /**
   * Execute the `list members` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listMembers(
    tenantId: string,
    page: number,
    limit: number,
    roleFilter?: string,
    search?: string,
    statusFilter?: string,
    badgeId?: string,
  ) {
    const { members, total } = await memberRepository.listMembers(
      tenantId,
      page,
      limit,
      roleFilter,
      search,
      statusFilter,
      badgeId,
    );
    const now = new Date();

    // One read for the gym: a member with an unpaid row is worth singling out
    // in the list, and asking per member would not scale.
    const pendingTotals =
      await memberRepository.findPendingPaymentTotals(tenantId);

    return {
      data: {
        members: members.map((m) => {
          const flat = flattenMemberUser(m);
          const isDue =
            m.status === "ACTIVE" &&
            m.dueDate != null &&
            new Date(m.dueDate) <= now;
          const pendingPaymentAmount = pendingTotals.get(m.id);
          return {
            ...flat,
            isDue,
            dueDate: m.dueDate,
            hasPendingPayment: pendingPaymentAmount !== undefined,
            ...(pendingPaymentAmount !== undefined
              ? { pendingPaymentAmount }
              : {}),
          };
        }),
      },
      total,
    };
  },

  /**
   * Execute the `list referral leaders` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listReferrals(
    tenantId: string,
    page: number,
    limit: number,
    search?: string,
    order: "asc" | "desc" = "desc",
  ) {
    const leaders = await memberRepository.listReferralLeaders(tenantId, search);
    const normalized = leaders.map((leader) => flattenReferralLeader(leader));
    normalized.sort((a, b) => {
      const delta =
        order === "asc"
          ? a.referralCount - b.referralCount
          : b.referralCount - a.referralCount;
      if (delta !== 0) return delta;
      if (a.memberId !== b.memberId) return a.memberId - b.memberId;
      const aName = "name" in a && typeof a.name === "string" ? a.name : "";
      const bName = "name" in b && typeof b.name === "string" ? b.name : "";
      return aName.localeCompare(bName);
    });

    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      data: {
        referrals: normalized.slice(start, end),
      },
      total: normalized.length,
    };
  },

  /**
   * Execute the `get member detail` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getMemberDetail(
    tenantId: string,
    membershipId: string,
    userId: string,
    callerRole: TenantRole | null,
  ) {
    if (callerRole === "MEMBER") {
      const callerMembership = await memberRepository.findMembershipByUserId(tenantId, userId);
      if (!callerMembership || callerMembership.id !== membershipId) {
        return { error: "You can only view your own member profile.", status: 403 as const };
      }
    }

    const member = await memberRepository.getMemberDetail(
      membershipId,
      tenantId,
    );
    if (!member) return { error: "Member not found.", status: 404 as const };

    // The card link travels with the record so the profile can offer it without
    // a second call. A member who predates the feature gets a token minted here,
    // which is why this is a write-capable read.
    const [token, tenant] = await Promise.all([
      idCardService.ensureToken(member.id),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    ]);

    return {
      data: {
        member: {
          ...flattenMemberDetail(member),
          idCardUrl: token && tenant?.slug ? buildIdCardUrl(tenant.slug, token) : null,
        },
      },
    };
  },

  /**
   * Execute the `get my profile` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getMyProfile(tenantId: string, userId: string) {
    const profile = await memberRepository.getProfile(tenantId, userId);
    if (!profile) {
      return { error: "Not a member of this tenant.", status: 403 as const };
    }

    // A member's own card link, minted here for anyone who joined before the
    // feature existed.
    const [token, tenant] = await Promise.all([
      idCardService.ensureToken(profile.id),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
    ]);

    return {
      data: {
        profile: {
          ...flattenMemberUser(profile),
          idCardUrl: token && tenant?.slug ? buildIdCardUrl(tenant.slug, token) : null,
        },
      },
    };
  },

  /**
   * Execute the `update my profile` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateMyProfile(
    tenantId: string,
    userId: string,
    input: UpdateMyProfileInput,
    storage: StorageOptions = {},
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    const membership = await memberRepository.findMembership(tenantId, userId);
    if (!membership) {
      return { error: "Not a member of this tenant.", status: 403 as const };
    }

    // A member editing their own phone is still subject to the gym's uniqueness rule.
    if (input.phone !== undefined) {
      const contactClash = await checkContactIsFree(
        tenantId,
        { phone: input.phone },
        membership.id,
      );
      if (contactClash) return contactClash;
    }

    // Handle password change
    if (input.newPassword) {
      const user = await memberRepository.findUserPasswordHash(userId);
      const valid = await verifyPassword(
        input.currentPassword!,
        user!.passwordHash,
      );
      if (!valid) {
        return {
          error: "Current password is incorrect.",
          status: 401 as const,
        };
      }
    }

    // Build the User update payload
    const userUpdate: Record<string, unknown> = {};
    const nextAvatarUrl =
      input.avatarUrl !== undefined ? normalizeOptionalText(input.avatarUrl) : undefined;
    if (input.name !== undefined) userUpdate.name = input.name;
    if (input.phone !== undefined) userUpdate.phone = input.phone;
    if (input.avatarUrl !== undefined) userUpdate.avatarUrl = nextAvatarUrl;
    if (input.gender !== undefined) userUpdate.gender = input.gender;
    if (input.newPassword) {
      userUpdate.passwordHash = await hashPassword(input.newPassword);
    }

    if (Object.keys(userUpdate).length === 0) {
      return { error: "No fields to update.", status: 400 as const };
    }

    const updatedUser = await memberRepository.updateUser(userId, userUpdate);

    if (input.avatarUrl !== undefined) {
      await cleanupPreviousAsset(
        "user avatar",
        membership.user.avatarUrl,
        nextAvatarUrl,
        storage,
        scheduleBackgroundTask,
      );
    }

    return {
      data: { user: updatedUser },
      passwordChanged: !!input.newPassword,
      fields: Object.keys(userUpdate).filter((k) => k !== "passwordHash"),
    };
  },

  /**
   * Execute the `update member` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateMember(
    tenantId: string,
    membershipId: string,
    input: UpdateMemberInput,
    storage: StorageOptions = {},
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    const membership = await memberRepository.findMembershipById(
      membershipId,
      tenantId,
    );
    if (!membership) {
      return { error: "Member not found.", status: 404 as const };
    }

    // Changing a contact detail must not collide with another member of this
    // gym. Only the phone is editable here; email is fixed after creation.
    if (input.phone !== undefined) {
      const contactClash = await checkContactIsFree(
        tenantId,
        { phone: input.phone },
        membershipId,
      );
      if (contactClash) return contactClash;
    }

    const userUpdate: Record<string, unknown> = {};
    const nextAvatarUrl =
      input.avatarUrl !== undefined ? normalizeOptionalText(input.avatarUrl) : undefined;
    if (input.name !== undefined) userUpdate.name = input.name;
    if (input.phone !== undefined) userUpdate.phone = input.phone;
    if (input.avatarUrl !== undefined) userUpdate.avatarUrl = nextAvatarUrl;
    if (input.gender !== undefined) userUpdate.gender = input.gender;
    if (input.newPassword) {
      userUpdate.passwordHash = await hashPassword(input.newPassword);
    }

    let membershipUpdate: Record<string, unknown> = {};
    if (input.shiftId !== undefined) {
      if (input.shiftId === null) {
        membershipUpdate.shiftId = null;
      } else {
        const shift = await prisma.shift.findFirst({
          where: { id: input.shiftId, tenantId, isActive: true },
          select: { id: true },
        });
        if (!shift) {
          return { error: "Shift not found.", status: 404 as const };
        }
        membershipUpdate.shiftId = shift.id;
      }
    }

    if (
      Object.keys(userUpdate).length === 0 &&
      Object.keys(membershipUpdate).length === 0
    ) {
      return { error: "No fields to update.", status: 400 as const };
    }

    // Update user if there are changes
    if (Object.keys(userUpdate).length > 0) {
      await memberRepository.updateUser(membership.userId, userUpdate);

      if (input.avatarUrl !== undefined) {
        await cleanupPreviousAsset(
          "user avatar",
          membership.user.avatarUrl,
          nextAvatarUrl,
          storage,
          scheduleBackgroundTask,
        );
      }
    }

    // Update membership if there are changes
    if (Object.keys(membershipUpdate).length > 0) {
      await prisma.tenantMembership.update({
        where: { id: membershipId },
        data: membershipUpdate,
      });
    }

    const updated = await memberRepository.getMemberDetail(
      membershipId,
      tenantId,
    );
    return { data: { member: flattenMemberDetail(updated!) } };
  },

  /**
   * Execute the `update member role` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateMemberRole(
    tenantId: string,
    membershipId: string,
    newRole: string,
  ) {
    const membership = await memberRepository.findMembershipById(
      membershipId,
      tenantId,
    );
    if (!membership) {
      return { error: "Membership not found.", status: 404 as const };
    }

    // The target role must exist: a built-in tenant role or a custom role in
    // this gym. A gym cannot assign its members a role from another gym.
    if (!(await isTenantRoleValid(tenantId, newRole))) {
      return { error: `Unknown role: ${newRole}.`, status: 400 as const };
    }

    // Prevent demotion of the last admin
    if (membership.role === "ADMIN" && newRole !== "ADMIN") {
      const adminCount = await memberRepository.countActiveAdmins(tenantId);
      if (adminCount <= 1) {
        return {
          error: "Cannot demote the last admin of a tenant.",
          status: 400 as const,
        };
      }
    }

    const updated = await memberRepository.updateMemberRole(
      membershipId,
      newRole,
    );
    return {
      data: { membership: flattenNestedMember(updated) },
      previousRole: membership.role,
    };
  },

  /**
   * Execute the `update member status` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateMemberStatus(
    tenantId: string,
    membershipId: string,
    status: "ACTIVE" | "SUSPENDED",
  ) {
    const membership = await memberRepository.findMembershipById(
      membershipId,
      tenantId,
    );
    if (!membership) {
      return { error: "Member not found.", status: 404 as const };
    }
    const updated = await memberRepository.updateMembershipStatus(
      membershipId,
      status,
    );
    return { data: { membership: updated }, previousStatus: membership.status };
  },

  /**
   * Execute the `remove member` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async removeMember(tenantId: string, membershipId: string) {
    const membership = await memberRepository.findMembershipById(
      membershipId,
      tenantId,
    );
    if (!membership) {
      return { error: "Membership not found.", status: 404 as const };
    }

    if (membership.role === "ADMIN" && membership.status === "ACTIVE") {
      const adminCount = await memberRepository.countActiveAdmins(tenantId);
      if (adminCount <= 1) {
        return {
          error: "Cannot delete the last active admin of this tenant.",
          status: 400 as const,
        };
      }
    }

    const deleted = await memberRepository.deleteMemberCascade(membershipId);
    return { data: { membershipId, deleted } };
  },

  /**
   * Execute the `reset member password` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async resetMemberPassword(tenantId: string, membershipId: string) {
    const membership = await memberRepository.findMembershipById(
      membershipId,
      tenantId,
    );
    if (!membership) {
      return { error: "Member not found.", status: 404 as const };
    }

    const newPassword = generateRandomPassword();
    await memberRepository.updateUser(membership.userId, {
      passwordHash: await hashPassword(newPassword),
    });

    return { data: { generatedPassword: newPassword } };
  },
};
