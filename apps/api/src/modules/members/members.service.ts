/**
 * Documentation: Members service.
 *
 * - Implements the business rules for tenant membership lifecycle, profile updates, reporting, and status management by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: memberService.
 */
import { PlatformRole, type TenantRole } from "@fitconnect/shared/types/enums";
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
import { tenantRepository } from "../tenants/tenants.repository";
import { renderWhatsAppTemplate } from "../../lib/whatsapp-templates";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;
type ServiceError = { error: string; status?: 400 | 403 | 404 | 409 };
type AddMemberResult = {
  membership: { id: string; [key: string]: unknown };
  [key: string]: unknown;
};
const DEFAULT_OVERDUE_DAYS = 30;

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
 * Execute the `enforce overdue memberships for tenant` workflow for the members module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
async function enforceOverdueMembershipsForTenant(
  tenantId: string,
  gymName: string,
  overdueDays: number,
  scheduleBackgroundTask?: BackgroundTaskScheduler,
) {
  const overdueMembers = (await memberRepository.getOverdueMembers(
    tenantId,
    overdueDays,
  )) as Array<{
    id: string;
    memberId: number;
    user: { name: string; email: string };
  }>;
  const suspended: { id: string; memberId: number; name: string }[] = [];

  if (overdueMembers.length === 0) {
    return { overdueMembers, suspended };
  }

  await memberRepository.suspendMany(overdueMembers.map((member) => member.id));

  for (const member of overdueMembers) {
    suspended.push({
      id: member.id,
      memberId: member.memberId,
      name: member.user.name,
    });
  }

  const backgroundWork = Promise.allSettled(
    overdueMembers.map((member) =>
      emailService
        .sendSuspensionEmail(
          member.user.email,
          member.user.name,
          gymName,
          overdueDays,
        )
        .catch((err) => {
          console.error("Suspension email failed.", err);
        }),
    ),
  ).then(() => undefined);

  if (scheduleBackgroundTask) {
    scheduleBackgroundTask(backgroundWork);
  } else {
    await backgroundWork;
  }

  return { overdueMembers, suspended };
}

/**
 * Execute the `build tenant report data` workflow for scheduled and on-demand reports.
 * Keep report aggregation in one place so HTTP-triggered and cron-triggered flows stay consistent.
 */
async function buildTenantReportData(
  tenantId: string,
  options: {
    gymName?: string;
    overdueDays?: number;
    scheduleBackgroundTask?: BackgroundTaskScheduler;
  } = {},
) {
  const {
    gymName: providedGymName,
    overdueDays: providedOverdueDays,
    scheduleBackgroundTask,
  } = options;

  const [memberStats, financeStats, settings, tenant] = await Promise.all([
    memberRepository.getDashboardStats(tenantId),
    memberRepository.getFinanceStats(tenantId),
    providedOverdueDays === undefined
      ? prisma.tenantSettings.findUnique({
          where: { tenantId },
          select: { overdueDays: true },
        })
      : Promise.resolve(null),
    providedGymName === undefined
      ? prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);

  const overdueDays =
    providedOverdueDays ?? settings?.overdueDays ?? DEFAULT_OVERDUE_DAYS;
  const gymName = providedGymName ?? tenant?.name ?? "Fit Connect";

  const { overdueMembers, suspended } =
    await enforceOverdueMembershipsForTenant(
      tenantId,
      gymName,
      overdueDays,
      scheduleBackgroundTask,
    );

  return {
    gymName,
    reportData: {
      members: memberStats,
      finances: financeStats,
      overdue: {
        allowedDays: overdueDays,
        found: overdueMembers.length,
        suspended,
      },
    },
  };
}

/**
 * Execute the `dispatch report emails` workflow for tenant reports.
 * Keep recipient fan-out isolated so both ad-hoc and scheduled report paths reuse the same email behavior.
 */
async function dispatchReportEmails(
  recipients: { email: string; name?: string | null }[],
  gymName: string,
  reportData: Awaited<ReturnType<typeof buildTenantReportData>>["reportData"],
  scheduleBackgroundTask?: BackgroundTaskScheduler,
) {
  if (recipients.length === 0) return;

  const backgroundWork = Promise.allSettled(
    recipients.map((recipient) =>
      emailService
        .sendReportEmail({
          to: recipient.email,
          adminName: recipient.name ?? "Admin",
          gymName,
          members: reportData.members,
          finances: reportData.finances,
          overdue: reportData.overdue,
        })
        .catch((err) => {
          console.error("Report email failed.", err);
        }),
    ),
  ).then(() => undefined);

  if (scheduleBackgroundTask) {
    scheduleBackgroundTask(backgroundWork);
  } else {
    await backgroundWork;
  }
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
  ): Promise<{ data: AddMemberResult } | ServiceError> {
    // Coaches can only add members (not other coaches or admins)
    if (callerRole === "COACH" && input.role !== "MEMBER") {
      return { error: "Coaches can only add members.", status: 403 as const };
    }

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
      input.role as TenantRole,
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

    const whatsappText = renderWhatsAppTemplate(
      "new_member_welcome",
      {
        gymName,
        memberName: input.name,
        memberId: membership.memberId,
        email: input.email,
        paymentSummarySection,
        subscriptionLine,
      },
      settings?.whatsappTemplates,
    );

    return {
      data: {
        membership: flattenNestedMember(membership),
        payments,
        whatsappText,
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
    return {
      data: {
        members: members.map((m) => {
          const flat = flattenMemberUser(m);
          const isDue =
            m.status === "ACTIVE" &&
            m.dueDate != null &&
            new Date(m.dueDate) <= now;
          return { ...flat, isDue, dueDate: m.dueDate };
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
    return { data: { member: flattenMemberDetail(member) } };
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
    return { data: { profile: flattenMemberUser(profile) } };
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

    const userUpdate: Record<string, unknown> = {};
    const nextAvatarUrl =
      input.avatarUrl !== undefined ? normalizeOptionalText(input.avatarUrl) : undefined;
    if (input.name !== undefined) userUpdate.name = input.name;
    if (input.phone !== undefined) userUpdate.phone = input.phone;
    if (input.avatarUrl !== undefined) userUpdate.avatarUrl = nextAvatarUrl;
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
      newRole as TenantRole,
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
   * Execute the `generate report` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async generateReport(
    tenantId: string,
    adminUserId: string,
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    const [adminUser, { gymName, reportData }] = await Promise.all([
      prisma.user.findUnique({
        where: { id: adminUserId },
        select: { email: true, name: true },
      }),
      buildTenantReportData(tenantId, { scheduleBackgroundTask }),
    ]);

    // Send report email to admin in the background.
    if (adminUser?.email) {
      await dispatchReportEmails(
        [{ email: adminUser.email, name: adminUser.name }],
        gymName,
        reportData,
        scheduleBackgroundTask,
      );
    }

    return { data: reportData };
  },

  /**
   * Execute the `run scheduled tenant reports` workflow for all active tenants.
   * Keep cron-specific fan-out logic here so the Worker scheduled handler stays thin.
   */
  async runScheduledTenantReports(
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    const tenants =
      await tenantRepository.listActiveTenantsForScheduledReports();
    const summary: {
      processedTenants: number;
      targetedAdmins: number;
      tenants: {
        tenantId: string;
        gymName: string;
        targetedAdmins: number;
        suspendedCount: number;
      }[];
    } = {
      processedTenants: tenants.length,
      targetedAdmins: 0,
      tenants: [],
    };

    for (const tenant of tenants) {
      const recipients = tenant.memberships
        .map((membership) => membership.user)
        .filter(
          (user, index, users) =>
            user.status === "ACTIVE" &&
            typeof user.email === "string" &&
            user.email.length > 0 &&
            users.findIndex((candidate) => candidate.id === user.id) === index,
        )
        .map((user) => ({
          email: user.email as string,
          name: user.name,
        }));

      const { gymName, reportData } = await buildTenantReportData(tenant.id, {
        gymName: tenant.name,
        overdueDays: tenant.settings?.overdueDays ?? DEFAULT_OVERDUE_DAYS,
        scheduleBackgroundTask,
      });

      await dispatchReportEmails(
        recipients,
        gymName,
        reportData,
        scheduleBackgroundTask,
      );

      summary.targetedAdmins += recipients.length;
      summary.tenants.push({
        tenantId: tenant.id,
        gymName,
        targetedAdmins: recipients.length,
        suspendedCount: reportData.overdue.suspended.length,
      });
    }

    return { data: summary };
  },

  /**
   * Execute the `run scheduled overdue enforcement` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async runScheduledOverdueEnforcement(
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    const tenants =
      await tenantRepository.listActiveTenantsForOverdueEnforcement();
    const summary: {
      processedTenants: number;
      suspendedMembers: number;
      tenants: {
        tenantId: string;
        gymName: string;
        overdueDays: number;
        suspendedCount: number;
      }[];
    } = {
      processedTenants: tenants.length,
      suspendedMembers: 0,
      tenants: [],
    };

    for (const tenant of tenants) {
      const overdueDays = tenant.settings?.overdueDays ?? DEFAULT_OVERDUE_DAYS;
      const result = await enforceOverdueMembershipsForTenant(
        tenant.id,
        tenant.name,
        overdueDays,
        scheduleBackgroundTask,
      );

      summary.suspendedMembers += result.suspended.length;
      summary.tenants.push({
        tenantId: tenant.id,
        gymName: tenant.name,
        overdueDays,
        suspendedCount: result.suspended.length,
      });
    }

    return { data: summary };
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
