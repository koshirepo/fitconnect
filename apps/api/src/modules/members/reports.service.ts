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
import { log } from "../../lib/logger";

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
          tenantId,
        )
        .catch((err) => {
          log.error("report.suspension.email.failed", { error: err });
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
 *
 * Reads. Does not enforce.
 *
 * This used to call `enforceOverdueMembershipsForTenant`, which suspends
 * memberships, revokes door access and sends suspension emails and pushes. The
 * analytics screen calls this on mount with `staleTime: 0`, so opening or
 * refreshing that page deactivated members and messaged them — a write, and an
 * irreversible one from the member's side, hiding behind a report. Enforcement
 * now belongs to the nightly cron alone, which is the only caller that should
 * be deciding somebody's membership is over.
 *
 * `suspended` is passed in by that cron, so the report it emails still names
 * the members its own run just swept. On the on-demand path it is empty and
 * `awaitingSuspension` carries the answer instead: who is past the grace period
 * and will be suspended by the next run.
 */
async function buildTenantReportData(
  tenantId: string,
  options: {
    gymName?: string;
    overdueDays?: number;
    /** Members the caller's own enforcement run just suspended. */
    suspended?: { id: string; memberId: number; name: string }[];
  } = {},
) {
  const {
    gymName: providedGymName,
    overdueDays: providedOverdueDays,
    suspended = [],
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

  // The same predicate enforcement uses, read without the write. It matches
  // only ACTIVE memberships, so after a sweep it is empty — which is why the
  // cron passes its own result in rather than reading again.
  const overdueMembers = await memberRepository.getOverdueMembers(tenantId, overdueDays);
  const awaitingSuspension = overdueMembers.map((member) => ({
    id: member.id,
    memberId: member.memberId,
    name: member.user.name,
  }));

  return {
    gymName,
    reportData: {
      members: memberStats,
      finances: financeStats,
      overdue: {
        allowedDays: overdueDays,
        found: awaitingSuspension.length,
        /** Suspended by the run this report accompanies; empty on demand. */
        suspended,
        /** Past the grace period, still active — what the next run will take. */
        awaitingSuspension,
      },
    },
  };
}

/**
 * Execute the `dispatch report emails` workflow for tenant reports.
 * Keep recipient fan-out isolated so both ad-hoc and scheduled report paths reuse the same email behavior.
 */
async function dispatchReportEmails(
  /** Whose mailbox the report leaves from. */
  tenantId: string,
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
          tenantId,
          to: recipient.email,
          adminName: recipient.name ?? "Admin",
          gymName,
          members: reportData.members,
          finances: reportData.finances,
          overdue: reportData.overdue,
        })
        .catch((err) => {
          log.error("report.email.failed", { error: err });
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
    // Read-only: this is what the analytics screen calls on every load. It
    // used to suspend members and message them as a side effect of that.
    const [adminUser, { gymName, reportData }] = await Promise.all([
      prisma.user.findUnique({
        where: { id: adminUserId },
        select: { email: true, name: true },
      }),
      buildTenantReportData(tenantId),
    ]);

    // Send report email to admin in the background.
    if (adminUser?.email) {
      await dispatchReportEmails(
        tenantId,
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

      const overdueDays = tenant.settings?.overdueDays ?? DEFAULT_OVERDUE_DAYS;

      // Enforce, then report on what enforcement did. This is the only path
      // that suspends anybody: the sweep, the door-access revocation and the
      // suspension notice all belong to the nightly run, not to whoever last
      // opened the analytics page.
      const { suspended } = await enforceOverdueMembershipsForTenant(
        tenant.id,
        tenant.name,
        overdueDays,
        scheduleBackgroundTask,
      );

      const { gymName, reportData } = await buildTenantReportData(tenant.id, {
        gymName: tenant.name,
        overdueDays,
        suspended,
      });

      await dispatchReportEmails(
        tenant.id,
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
};
