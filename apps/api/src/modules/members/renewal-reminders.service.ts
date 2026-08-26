/**
 * Documentation: Pre-expiry renewal reminders.
 *
 * - Nudges a member while their membership is still live, which is the only window where renewing is a decision rather than a recovery. The overdue enforcement in `reports.service` is the opposite end of the same story: by the time it runs, the member has already lapsed and been suspended.
 * - Reminders link to the member's own subscriptions screen, where `PAYMENTS_CHECKOUT_SELF` already lets them pay online — so the nudge and the renewal are one tap apart.
 * - Deliberately stateless: a reminder is sent when the due date is exactly N days out, for each N in `REMINDER_OFFSET_DAYS`. Running daily, that fires each offset once per member with no "already reminded" column to keep in step. A missed cron day costs one nudge rather than causing duplicates.
 * - Primary exports: renewalReminderService.
 */
import { prisma } from "../../lib/prisma";
import { pushService } from "../push/push.service";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;

/**
 * Days before expiry that earn a nudge.
 *
 * Three points: enough notice to arrange money, a reminder mid-week, and a
 * last call on the day before. More than this reads as nagging.
 */
const REMINDER_OFFSET_DAYS = [7, 3, 1];

/** UTC midnight, the boundary `dueDate` is compared against. */
function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDueDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** What a member is told, and where it takes them. */
function buildReminder(gymName: string, dueDate: Date, daysLeft: number) {
  const when =
    daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days (${formatDueDate(dueDate)})`;

  return {
    title: `Your ${gymName} membership expires ${when}`,
    body:
      daysLeft === 1
        ? "Renew now to keep your access without a break."
        : "Tap to renew online — it takes a minute.",
    // The screen that lists plans and can take the payment.
    url: "/dashboard/subscriptions",
  };
}

export const renewalReminderService = {
  /**
   * Notify every member whose membership expires on one of the offset days.
   *
   * Runs across all tenants in one pass: a single query per offset rather than
   * per gym, because the cron's cost is dominated by round trips to D1.
   */
  async runScheduledRenewalReminders(scheduleBackgroundTask?: BackgroundTaskScheduler) {
    const today = startOfUtcDay(new Date());

    const summary: {
      notified: number;
      byOffset: { daysLeft: number; members: number }[];
    } = { notified: 0, byOffset: [] };

    for (const daysLeft of REMINDER_OFFSET_DAYS) {
      const windowStart = addDays(today, daysLeft);
      const windowEnd = addDays(windowStart, 1);

      // Active members of active gyms whose term ends on exactly that day. A
      // suspended member is past reminding; enforcement already has them.
      const memberships = await prisma.tenantMembership.findMany({
        where: {
          status: "ACTIVE",
          dueDate: { gte: windowStart, lt: windowEnd },
          tenant: { status: "ACTIVE" },
        },
        select: {
          id: true,
          userId: true,
          dueDate: true,
          tenant: { select: { name: true } },
          user: { select: { status: true } },
        },
      });

      const targets = memberships.filter((membership) => membership.user.status === "ACTIVE");

      for (const membership of targets) {
        const reminder = buildReminder(
          membership.tenant.name,
          membership.dueDate ?? windowStart,
          daysLeft,
        );

        // Delivery is best effort and must never fail the cron: a member whose
        // phone has no subscription is simply not reachable this way.
        const delivery = pushService
          .sendToUser(membership.userId, reminder)
          .catch((error: unknown) => {
            console.error("[renewal-reminder] push failed", {
              membershipId: membership.id,
              reason: error instanceof Error ? error.message : String(error),
            });
          });

        if (scheduleBackgroundTask) {
          scheduleBackgroundTask(delivery);
        } else {
          await delivery;
        }
      }

      summary.byOffset.push({ daysLeft, members: targets.length });
      summary.notified += targets.length;
    }

    return { data: summary };
  },
};
