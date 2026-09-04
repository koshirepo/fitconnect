/**
 * Documentation: Sending a reminder, and remembering that it was sent.
 *
 * - One place decides whether a member may be reminded at all. A suspended membership, a suspended account, or a gym that is no longer active is left alone: the app has already told that member their access ended, and continuing to nudge them is how a reminder becomes spam.
 * - `sendPush` is best effort by design. A member with no push subscription, a dead endpoint, or a gym on a build with no VAPID keys is simply not reachable that way, and none of those may fail the cron that called it.
 * - A reminder is only recorded when it actually went somewhere: a push that reached no device writes no row, so the count on a payment means "times we reached them", not "times we tried".
 * - WhatsApp is recorded on the way out of the app, when staff open the message. Delivery and reading happen inside WhatsApp, where nothing can observe them, and the record says so by naming the channel rather than claiming more.
 * - Primary exports: reminderService.
 */
import { prisma } from "../../lib/prisma";
import { pushService } from "../push/push.service";
import {
  reminderRepository,
  type ReminderChannel,
  type ReminderReason,
} from "./reminders.repository";

type PushPayload = { title: string; body: string; url?: string };

/** A membership that may still be reminded, or null when it may not. */
async function findReachable(membershipId: string) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: membershipId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      userId: true,
      user: { select: { status: true } },
      tenant: { select: { status: true } },
    },
  });

  if (!membership) return null;
  // The three ways a membership stops being someone to remind. Suspension is
  // the important one: the deactivation notice is the last thing they hear.
  if (membership.status !== "ACTIVE") return null;
  if (membership.user.status !== "ACTIVE") return null;
  if (membership.tenant.status !== "ACTIVE") return null;

  return membership;
}

export const reminderService = {
  /**
   * Push a member, and record it if it landed.
   *
   * `force` is for the suspension notice, the one message that goes out to a
   * membership precisely as it stops being active.
   */
  async sendPush(
    input: {
      tenantId: string;
      membershipId: string;
      userId: string;
      reason: ReminderReason;
      targetPaymentId?: string | null;
    },
    payload: PushPayload,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    try {
      if (!options.force) {
        const reachable = await findReachable(input.membershipId);
        if (!reachable) return false;
      }

      const result = await pushService.sendToUser(input.userId, payload);
      // No subscription, no delivery, nothing to record.
      const delivered = (result?.data?.sent ?? 0) > 0;
      if (!delivered) return false;

      await reminderRepository.create({
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        channel: "PUSH",
        reason: input.reason,
        message: `${payload.title} — ${payload.body}`,
        targetPaymentId: input.targetPaymentId ?? null,
      });

      return true;
    } catch (error) {
      console.error("[reminder] push failed", {
        membershipId: input.membershipId,
        reason: input.reason,
        detail: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  },

  /** Whether this member has already had this kind of nudge since `since`. */
  async alreadySent(membershipId: string, reason: ReminderReason, since: Date) {
    return (await reminderRepository.countSentSince(membershipId, reason, since)) > 0;
  },

  /**
   * Record a message a member of staff sent by hand.
   *
   * Called when the app hands the message to WhatsApp, which is the last moment
   * it can observe anything about it.
   */
  async recordManual(input: {
    tenantId: string;
    membershipId: string;
    channel: ReminderChannel;
    reason: ReminderReason;
    message?: string | null;
    actorMembershipId?: string | null;
    targetPaymentId?: string | null;
  }) {
    const membership = await prisma.tenantMembership.findFirst({
      where: { id: input.membershipId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!membership) {
      return { error: "Member not found.", status: 404 as const };
    }

    const reminder = await reminderRepository.create({
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      channel: input.channel,
      reason: input.reason,
      message: input.message ?? null,
      actorId: input.actorMembershipId ?? null,
      targetPaymentId: input.targetPaymentId ?? null,
    });

    return { data: { reminder } };
  },

  /**
   * One month of a gym's reminders, bucketed by the day they went out.
   *
   * Days are keyed by local calendar date rather than by UTC instant: the
   * calendar is read by people standing in the gym, and a reminder sent at
   * 04:30 UTC belongs to the morning they saw it, not the day before.
   */
  async calendarForMonth(tenantId: string, month: string) {
    const [year, monthIndex] = month.split("-").map(Number);
    if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12) {
      return { error: "Month must look like 2026-08.", status: 400 as const };
    }

    const from = new Date(year, monthIndex - 1, 1);
    const to = new Date(year, monthIndex, 1);

    const rows = await reminderRepository.listForTenantRange(tenantId, from, to);

    const days: Record<
      string,
      {
        count: number;
        push: number;
        whatsapp: number;
        reminders: {
          id: string;
          membershipId: string;
          memberId: number | null;
          memberName: string;
          memberAvatarUrl: string | null;
          channel: string;
          reason: string;
          message: string | null;
          sentAt: Date;
          settled: boolean;
          actorName: string | null;
        }[];
      }
    > = {};

    for (const row of rows) {
      const sent = row.sentAt;
      const key = `${sent.getFullYear()}-${String(sent.getMonth() + 1).padStart(2, "0")}-${String(
        sent.getDate(),
      ).padStart(2, "0")}`;

      const bucket = (days[key] ??= { count: 0, push: 0, whatsapp: 0, reminders: [] });
      bucket.count += 1;
      if (row.channel === "WHATSAPP") bucket.whatsapp += 1;
      else bucket.push += 1;

      bucket.reminders.push({
        id: row.id,
        membershipId: row.membershipId,
        memberId: row.member?.memberId ?? null,
        memberName: row.member?.user.name ?? "Removed member",
        // Already selected by the repository; the calendar shows the same
        // person tile as every other list and needs the photo to do it.
        memberAvatarUrl: row.member?.user.avatarUrl ?? null,
        channel: row.channel,
        reason: row.reason,
        message: row.message,
        sentAt: row.sentAt,
        settled: Boolean(row.paymentId),
        actorName: row.actor?.user.name ?? null,
      });
    }

    return { data: { month, total: rows.length, days } };
  },

  /** One reminder in full, for the page that shows a single message. */
  async getById(tenantId: string, reminderId: string) {
    const reminder = await reminderRepository.findById(tenantId, reminderId);
    if (!reminder) {
      return { error: "Reminder not found.", status: 404 as const };
    }

    return { data: { reminder } };
  },

  /** A member's chase history, newest first. */
  async listForMember(tenantId: string, membershipId: string) {
    const membership = await prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true },
    });
    if (!membership) {
      return { error: "Member not found.", status: 404 as const };
    }

    const [reminders, outstanding] = await Promise.all([
      reminderRepository.listForMembership(membershipId),
      reminderRepository.countOutstanding(membershipId),
    ]);

    return { data: { reminders, outstanding } };
  },

  /**
   * Attach everything outstanding to a payment that has just been collected.
   *
   * Only completed money closes a chase: a pending row is the thing being
   * chased, so linking to it would call the reminder answered by the debt.
   */
  async attachToPayment(membershipId: string, paymentId: string, status: string) {
    if (status !== "COMPLETED") return 0;
    try {
      return await reminderRepository.linkToPayment(membershipId, paymentId);
    } catch (error) {
      console.error("[reminder] linking to payment failed", {
        paymentId,
        detail: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  },
};
