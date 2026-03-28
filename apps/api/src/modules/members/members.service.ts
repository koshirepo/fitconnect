/**
 * Documentation: Members service.
 *
 * - Implements the business rules for tenant membership lifecycle, profile updates, reporting, and status management by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: memberService.
 */
import { PlatformRole, type TenantRole } from "../../shared/types/enums";
import {
  hashPassword,
  verifyPassword,
  generateRandomPassword,
} from "../../auth/password";
import { memberRepository } from "./members.repository";
import { flattenMemberUser, flattenNestedMember } from "../../lib/flatten";
import type {
  AddMemberInput,
  UpdateMemberInput,
  UpdateMyProfileInput,
} from "./members.schema";
import { prisma } from "../../lib/prisma";
import { emailService } from "../../lib/email";
import { tenantRepository } from "../tenants/tenants.repository";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;
type ServiceError = { error: string; status?: 400 | 403 | 404 | 409 };
type AddMemberResult = {
  membership: { id: string; [key: string]: unknown };
  [key: string]: unknown;
};
const DEFAULT_OVERDUE_DAYS = 30;

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
  const overdueMembers = await memberRepository.getOverdueMembers(
    tenantId,
    overdueDays,
  );
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

    // Upsert user (they may already exist on the platform)
    let user = await memberRepository.findUserByEmail(input.email);
    let generatedPassword: string | undefined;
    if (!user) {
      generatedPassword = generateRandomPassword();
      user = await memberRepository.createUser({
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: await hashPassword(generatedPassword),
        platformRole: PlatformRole.USER,
        ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
      });
    }

    // Check if already a member of this tenant
    const existing = await memberRepository.findMembership(tenantId, user.id);
    if (existing) {
      return {
        error: "User is already a member of this tenant.",
        status: 409 as const,
      };
    }

    let subscription: {
      id: string;
      amount: number;
      durationDays: number;
      title: string;
    } | null = null;
    let charges: { id: string; name: string; amount: number }[] = [];

    const [subscriptionResult, chargesResult] = await Promise.all([
      input.subscriptionId
        ? prisma.subscription.findFirst({
            where: { id: input.subscriptionId, tenantId, isActive: true },
            select: { id: true, amount: true, durationDays: true, title: true },
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
    ]);

    subscription = subscriptionResult;
    charges = chargesResult;

    if (input.subscriptionId && !subscription) {
      return { error: "Subscription plan not found.", status: 404 as const };
    }

    // Get collector membership
    const collector = await memberRepository.findMembershipByUserId(
      tenantId,
      callerRole ? user.id : "",
    );

    const membership = await memberRepository.createMembership(
      tenantId,
      user.id,
      input.role as TenantRole,
    );

    // Find the collector (caller's membership)
    const callerMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId, user: { email: { not: input.email } } },
      select: { id: true },
    });

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

    // Fetch tenant name for notifications
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const gymName = tenant?.name ?? "Fit Connect";

    // Send welcome email with credentials + payment summary.
    if (generatedPassword) {
      const sendWelcomeEmail = emailService
        .sendWelcomeEmail({
          to: input.email,
          memberName: input.name,
          gymName,
          email: input.email,
          password: generatedPassword,
          memberId: membership.memberId,
          payments: payments.map((p) => ({
            description: p.description,
            amount: p.amount,
          })),
          subscriptionTitle: subscription?.title,
          subscriptionDays: subscription?.durationDays,
        })
        .catch((err) => {
          console.error("Welcome email failed.", err);
        });

      if (scheduleBackgroundTask) {
        scheduleBackgroundTask(sendWelcomeEmail);
      } else {
        await sendWelcomeEmail;
      }
    }

    // Build WhatsApp message for auto-open on frontend
    const formatInr = (paise: number) =>
      `₹${(paise / 100).toLocaleString("en-IN")}`;
    const total = payments.reduce((s, p) => s + p.amount, 0);
    const paymentLines = payments
      .map((p) => `  • ${p.description ?? "Payment"}: ${formatInr(p.amount)}`)
      .join("\n");

    const whatsappText = [
      `🎉 Welcome to *${gymName}*!`,
      ``,
      `Hi *${input.name}*,`,
      `Your membership has been created successfully.`,
      `🆔 Member ID: *${membership.memberId}*`,
      ``,
      payments.length > 0 ? `💰 *Payment Summary*` : null,
      payments.length > 0 ? paymentLines : null,
      payments.length > 0 ? `  *Total: ${formatInr(total)}*` : null,
      subscription
        ? `\n📋 Plan: *${subscription.title}* (${subscription.durationDays} days)`
        : null,
      ``,
      generatedPassword
        ? `🔑 Your login password has been sent to your email (${input.email}). Please check your inbox.`
        : null,
      ``,
      `Thank you for joining us! 💪`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      data: {
        membership: flattenNestedMember(membership),
        payments,
        whatsappText,
        ...(generatedPassword ? { emailSent: true } : {}),
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
   * Execute the `get member detail` workflow for the members module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getMemberDetail(tenantId: string, membershipId: string) {
    const member = await memberRepository.getMemberDetail(
      membershipId,
      tenantId,
    );
    if (!member) return { error: "Member not found.", status: 404 as const };
    return { data: { member: flattenMemberUser(member) } };
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
    if (input.name !== undefined) userUpdate.name = input.name;
    if (input.phone !== undefined) userUpdate.phone = input.phone;
    if (input.avatarUrl !== undefined) userUpdate.avatarUrl = input.avatarUrl;
    if (input.newPassword) {
      userUpdate.passwordHash = await hashPassword(input.newPassword);
    }

    if (Object.keys(userUpdate).length === 0) {
      return { error: "No fields to update.", status: 400 as const };
    }

    const updatedUser = await memberRepository.updateUser(userId, userUpdate);
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
  ) {
    const membership = await memberRepository.findMembershipById(
      membershipId,
      tenantId,
    );
    if (!membership) {
      return { error: "Member not found.", status: 404 as const };
    }

    const userUpdate: Record<string, unknown> = {};
    if (input.name !== undefined) userUpdate.name = input.name;
    if (input.phone !== undefined) userUpdate.phone = input.phone;
    if (input.avatarUrl !== undefined) userUpdate.avatarUrl = input.avatarUrl;
    if (input.newPassword) {
      userUpdate.passwordHash = await hashPassword(input.newPassword);
    }

    let membershipUpdate: Record<string, unknown> = {};

    if (
      Object.keys(userUpdate).length === 0 &&
      Object.keys(membershipUpdate).length === 0
    ) {
      return { error: "No fields to update.", status: 400 as const };
    }

    // Update user if there are changes
    if (Object.keys(userUpdate).length > 0) {
      await memberRepository.updateUser(membership.userId, userUpdate);
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
    return { data: { member: flattenMemberUser(updated!) } };
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

    await memberRepository.softDeleteMember(membershipId);
    return { data: true };
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
    const [memberStats, financeStats, settings, tenant, adminUser] =
      await Promise.all([
        memberRepository.getDashboardStats(tenantId),
        memberRepository.getFinanceStats(tenantId),
        prisma.tenantSettings.findUnique({
          where: { tenantId },
          select: { overdueDays: true },
        }),
        prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        }),
        prisma.user.findUnique({
          where: { id: adminUserId },
          select: { email: true, name: true },
        }),
      ]);

    const overdueDays = settings?.overdueDays ?? DEFAULT_OVERDUE_DAYS;
    const gymName = tenant?.name ?? "Fit Connect";
    const backgroundJobs: Promise<unknown>[] = [];
    const { overdueMembers, suspended } =
      await enforceOverdueMembershipsForTenant(
        tenantId,
        gymName,
        overdueDays,
        scheduleBackgroundTask,
      );

    const reportData = {
      members: memberStats,
      finances: financeStats,
      overdue: {
        allowedDays: overdueDays,
        found: overdueMembers.length,
        suspended,
      },
    };

    // Send report email to admin in the background.
    if (adminUser?.email) {
      backgroundJobs.push(
        emailService
          .sendReportEmail({
            to: adminUser.email,
            adminName: adminUser.name ?? "Admin",
            gymName,
            members: memberStats,
            finances: financeStats,
            overdue: reportData.overdue,
          })
          .catch((err) => {
            console.error("Report email failed.", err);
          }),
      );
    }

    if (backgroundJobs.length > 0) {
      const backgroundWork = Promise.allSettled(backgroundJobs).then(
        () => undefined,
      );
      if (scheduleBackgroundTask) {
        scheduleBackgroundTask(backgroundWork);
      } else {
        await backgroundWork;
      }
    }

    return { data: reportData };
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
