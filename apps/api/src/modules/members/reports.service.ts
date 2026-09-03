/**
 * Documentation: Tenant reporting and overdue enforcement.
 *
 * - Owns the periodic side of membership: who has lapsed, who gets suspended for it, and the summary emailed to a gym's admins. Split out of the members service, which is about the lifecycle of one member rather than the state of the whole roster on a schedule.
 * - The same code serves both entry points — an admin asking for a report now, and the Worker's cron handler sweeping every gym — so a scheduled run and an on-demand one can never disagree about what "overdue" means.
 * - Suspension is deliberately a side effect of building the report: the numbers an admin reads are the numbers that were just acted on, not a snapshot taken before the fact.
 * - Primary exports: reportService, DEFAULT_OVERDUE_DAYS.
 */
import { prisma } from "../../lib/prisma";
import { emailService } from "../../lib/email";
import { memberRepository } from "./members.repository";
import { tenantRepository } from "../tenants/tenants.repository";
import { reminderService } from "../reminders/reminders.service";
import { provisioningService } from "../attendance/provisioning.service";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;

/** Days past a lapsed due date before a membership is suspended. */
export const DEFAULT_OVERDUE_DAYS = 30;
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
    userId: string;
    user: { name: string; email: string };
  }>;
  const suspended: { id: string; memberId: number; name: string }[] = [];

  if (overdueMembers.length === 0) {
    return { overdueMembers, suspended };
  }

  await memberRepository.suspendOverdue(tenantId, overdueDays);

  // Withdraw the cards of everybody just suspended, so an unpaid membership
  // stops opening the door rather than relying on somebody at the desk
  // recognising them. A member who paid between the read and the update simply
  // gets re-enrolled by that payment.
  for (const member of overdueMembers) {
    await provisioningService.syncMemberAccess(tenantId, member.id);
  }

  for (const member of overdueMembers) {
    suspended.push({
      id: member.id,
      memberId: member.memberId,
      name: member.user.name,
    });
  }

  const backgroundWork = Promise.allSettled(
    overdueMembers.flatMap((member) => [
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
      // The last thing this member hears from the app. Forced past the usual
      // "is this membership active" guard precisely because it is not any more:
      // the suspension has already been written by the time this runs, and the
      // point of the message is to say so.
      reminderService.sendPush(
        {
          tenantId,
          membershipId: member.id,
          userId: member.userId,
          reason: "SUSPENDED",
        },
        {
          title: `Your ${gymName} membership is now inactive`,
          body: `It has been more than ${overdueDays} days since it expired. Renew to reactivate it.`,
          url: "/dashboard/subscriptions",
        },
        { force: true },
      ),
    ]),
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

export const reportService = {
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
};
