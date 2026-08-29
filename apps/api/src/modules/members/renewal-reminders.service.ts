/**
 * Documentation: The daily chase — before a membership lapses, after it has, and for money still owed.
 *
 * - Three passes over the same idea, in the order a member experiences them. `RENEWAL_DUE` nudges while the membership is still live, which is the only window where renewing is a decision rather than a recovery. `EXPIRED` picks up on the day it lapses and through the grace period. `PENDING_PAYMENT` chases a recorded payment nobody has settled.
 * - Reminders link to the member's own subscriptions screen, where `PAYMENTS_CHECKOUT_SELF` already lets them pay online — so the nudge and the renewal are one tap apart.
 * - Every send goes through `reminderService`, which refuses to reach a suspended membership and writes the row that a later payment claims. The overdue enforcement in `reports.service` owns the other end: the suspension notice, and after it, silence.
 * - Offsets rather than a running counter: a nudge fires when the date is exactly N days out (or past), for each N. Running daily that fires each offset once per member, and a missed cron day costs one nudge rather than causing duplicates. The `alreadySent` guard covers the other case — a schedule that runs twice in one day.
 * - Primary exports: renewalReminderService.
 */
import { prisma } from "../../lib/prisma";
import { reminderService } from "../reminders/reminders.service";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;

/**
 * Days before expiry that earn a nudge.
 *
 * Three points: enough notice to arrange money, a reminder mid-week, and a
 * last call on the day before. More than this reads as nagging.
 */
const REMINDER_OFFSET_DAYS = [7, 3, 1];

/**
 * Days after expiry that earn one more.
 *
 * Day 0 is the lapse itself, then a fortnight of grace at two points. Anything
 * at or past the gym's own `overdueDays` is skipped: enforcement is about to
 * suspend the member, and that notice should not arrive alongside a nudge to
 * renew.
 */
const LAPSED_OFFSET_DAYS = [0, 7, 14];

/**
 * How old an unpaid payment has to be before each chase.
 *
 * Four contacts across a fortnight, then the row is left alone — past that
 * point it is a conversation for the desk, not another notification.
 */
const PENDING_OFFSET_DAYS = [1, 3, 7, 14];

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

/** Rupees, the way every other member-facing amount is written. */
function formatInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * What a member still owes, as a sentence to append to any reminder.
 *
 * Money already recorded against them is the most useful thing a nudge can
 * carry: a member who owes nothing reads a renewal notice differently from one
 * who has a balance sitting on their account.
 */
function outstandingSuffix(pendingAmount: number) {
  return pendingAmount > 0 ? ` ${formatInr(pendingAmount)} is also pending on your account.` : "";
}

/** What a member is told before their membership ends, and where it takes them. */
function buildReminder(gymName: string, dueDate: Date, daysLeft: number, pendingAmount = 0) {
  const when =
    daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days (${formatDueDate(dueDate)})`;

  return {
    title: `Your ${gymName} membership expires ${when}`,
    body:
      (daysLeft === 1
        ? "Renew now to keep your access without a break."
        : "Tap to renew online — it takes a minute.") + outstandingSuffix(pendingAmount),
    // The screen that lists plans and can take the payment.
    url: "/dashboard/subscriptions",
  };
}

/** What a member is told once it has ended. */
function buildLapsedReminder(gymName: string, dueDate: Date, daysPast: number, pendingAmount = 0) {
  if (daysPast === 0) {
    return {
      title: `Your ${gymName} membership has expired`,
      body: "Renew today to pick up where you left off." + outstandingSuffix(pendingAmount),
      url: "/dashboard/subscriptions",
    };
  }

  return {
    title: `Your ${gymName} membership expired on ${formatDueDate(dueDate)}`,
    body:
      `It has been ${daysPast} days. Renew to get your access back.` +
      outstandingSuffix(pendingAmount),
    url: "/dashboard/subscriptions",
  };
}

/**
 * What a member is told about money the gym has recorded but not received.
 *
 * The title carries the whole outstanding balance rather than this one row: a
 * member with three unpaid entries wants the number they have to bring, and the
 * body names the item that prompted the reminder.
 */
function buildPendingReminder(
  gymName: string,
  amount: number,
  description: string | null,
  totalPending = 0,
) {
  const outstanding = Math.max(totalPending, amount);
  const others = outstanding - amount;

  return {
    title: `${formatInr(outstanding)} pending at ${gymName}`,
    body:
      (description
        ? `${description} (${formatInr(amount)}) is still unpaid.`
        : `${formatInr(amount)} on your account is still unpaid.`) +
      (others > 0 ? ` ${formatInr(others)} more is outstanding.` : "") +
      " Tap to settle it.",
    url: "/dashboard/payments",
  };
}

/**
 * What every member with an unpaid row still owes, keyed by membership.
 *
 * One grouped read for the whole run rather than a lookup per member: the
 * result is bounded by how many people owe something, which is a small
 * fraction of the roster, and an `IN` list of membership ids would exceed
 * D1's bind-parameter limit on any busy gym.
 */
async function pendingTotalsByMembership() {
  const rows = await prisma.payment.groupBy({
    by: ["membershipId"],
    where: { status: "PENDING", tenant: { status: "ACTIVE" } },
    _sum: { amount: true },
  });

  return new Map(rows.map((row) => [row.membershipId, row._sum.amount ?? 0]));
}

/**
 * The memberships whose term ends (or ended) on a given day.
 *
 * One query per offset across all gyms rather than per gym, because the cron's
 * cost is dominated by round trips to D1.
 */
async function membershipsDueOn(windowStart: Date) {
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      status: "ACTIVE",
      dueDate: { gte: windowStart, lt: addDays(windowStart, 1) },
      tenant: { status: "ACTIVE" },
    },
    select: {
      id: true,
      tenantId: true,
      userId: true,
      dueDate: true,
      tenant: { select: { name: true, settings: { select: { overdueDays: true } } } },
      user: { select: { status: true } },
    },
  });

  return memberships.filter((membership) => membership.user.status === "ACTIVE");
}

export const renewalReminderService = {
  /**
   * Run the day's reminders: the countdown, the lapse, and the unpaid.
   *
   * Runs across all tenants in one pass. Delivery is best effort — a member
   * whose phone has no subscription is simply not reachable this way — and
   * nothing here may fail the cron.
   */
  async runScheduledRenewalReminders(scheduleBackgroundTask?: BackgroundTaskScheduler) {
    const today = startOfUtcDay(new Date());
    const sinceMidnight = today;
    // Read once and reused by all three passes: every reminder says what the
    // member still owes, and that is the same number in each of them.
    const pendingTotals = await pendingTotalsByMembership();

    const summary: {
      notified: number;
      byOffset: { daysLeft: number; members: number }[];
      lapsed: { daysPast: number; members: number }[];
      pending: { daysOld: number; members: number }[];
    } = { notified: 0, byOffset: [], lapsed: [], pending: [] };

    /** Send one reminder, in the background when the caller offered one. */
    const dispatch = (promise: Promise<unknown>) => {
      if (scheduleBackgroundTask) scheduleBackgroundTask(promise);
      return promise;
    };

    // ── Before the term ends ─────────────────────────────────────────────────
    for (const daysLeft of REMINDER_OFFSET_DAYS) {
      const targets = await membershipsDueOn(addDays(today, daysLeft));

      for (const membership of targets) {
        if (await reminderService.alreadySent(membership.id, "RENEWAL_DUE", sinceMidnight)) {
          continue;
        }

        dispatch(
          reminderService.sendPush(
            {
              tenantId: membership.tenantId,
              membershipId: membership.id,
              userId: membership.userId,
              reason: "RENEWAL_DUE",
            },
            buildReminder(
              membership.tenant.name,
              membership.dueDate ?? addDays(today, daysLeft),
              daysLeft,
              pendingTotals.get(membership.id) ?? 0,
            ),
          ),
        );
      }

      summary.byOffset.push({ daysLeft, members: targets.length });
      summary.notified += targets.length;
    }

    // ── After it has ─────────────────────────────────────────────────────────
    for (const daysPast of LAPSED_OFFSET_DAYS) {
      const targets = await membershipsDueOn(addDays(today, -daysPast));
      let reminded = 0;

      for (const membership of targets) {
        // Never on or past the day enforcement suspends them: that member is
        // getting the deactivation notice instead.
        const overdueDays = membership.tenant.settings?.overdueDays ?? 30;
        if (daysPast >= overdueDays) continue;
        if (await reminderService.alreadySent(membership.id, "EXPIRED", sinceMidnight)) {
          continue;
        }

        reminded += 1;
        dispatch(
          reminderService.sendPush(
            {
              tenantId: membership.tenantId,
              membershipId: membership.id,
              userId: membership.userId,
              reason: "EXPIRED",
            },
            buildLapsedReminder(
              membership.tenant.name,
              membership.dueDate ?? addDays(today, -daysPast),
              daysPast,
              pendingTotals.get(membership.id) ?? 0,
            ),
          ),
        );
      }

      summary.lapsed.push({ daysPast, members: reminded });
      summary.notified += reminded;
    }

    // ── Money recorded but not received ──────────────────────────────────────
    for (const daysOld of PENDING_OFFSET_DAYS) {
      const windowStart = addDays(today, -daysOld);
      const payments = await prisma.payment.findMany({
        where: {
          status: "PENDING",
          createdAt: { gte: windowStart, lt: addDays(windowStart, 1) },
          tenant: { status: "ACTIVE" },
          member: { status: "ACTIVE" },
        },
        select: {
          id: true,
          amount: true,
          description: true,
          membershipId: true,
          tenantId: true,
          tenant: { select: { name: true } },
          member: { select: { userId: true, user: { select: { status: true } } } },
        },
      });

      const targets = payments.filter((payment) => payment.member.user.status === "ACTIVE");

      for (const payment of targets) {
        if (
          await reminderService.alreadySent(payment.membershipId, "PENDING_PAYMENT", sinceMidnight)
        ) {
          continue;
        }

        dispatch(
          reminderService.sendPush(
            {
              tenantId: payment.tenantId,
              membershipId: payment.membershipId,
              userId: payment.member.userId,
              reason: "PENDING_PAYMENT",
              targetPaymentId: payment.id,
            },
            buildPendingReminder(
              payment.tenant.name,
              payment.amount,
              payment.description,
              pendingTotals.get(payment.membershipId) ?? 0,
            ),
          ),
        );
      }

      summary.pending.push({ daysOld, members: targets.length });
      summary.notified += targets.length;
    }

    return { data: summary };
  },
};
