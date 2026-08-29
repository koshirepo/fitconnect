/**
 * Documentation: Persistence for the record of chasing a member for money.
 *
 * - One row per reminder that actually went out. The cron writes `PUSH` rows as it sends; the desk writes a `WHATSAPP` row when staff open a message.
 * - Rows are written unlinked and claimed later: `linkToPayment` attaches everything still outstanding for a membership to the payment that finally arrives, which is what turns a pile of reminders into "this payment took four chases".
 * - `countSentSince` is the cron's own guard against sending the same nudge twice in one window; it is cheaper than carrying a "last reminded" column on the membership and cannot drift from the rows themselves.
 * - Primary exports: reminderRepository.
 */
import { prisma } from "../../lib/prisma";

export type ReminderChannel = "PUSH" | "WHATSAPP";

/**
 * Why a reminder went out.
 *
 * `RENEWAL_DUE` is the countdown before a term ends, `EXPIRED` is after it has,
 * `PENDING_PAYMENT` chases an unpaid row, and `SUSPENDED` is the last message a
 * member gets as their membership is deactivated.
 */
export type ReminderReason = "RENEWAL_DUE" | "EXPIRED" | "PENDING_PAYMENT" | "SUSPENDED";

export const reminderRepository = {
  /** Record one reminder. Never throws away the send it describes. */
  create(input: {
    tenantId: string;
    membershipId: string;
    channel: ReminderChannel;
    reason: ReminderReason;
    message?: string | null;
    actorId?: string | null;
    targetPaymentId?: string | null;
  }) {
    return prisma.paymentReminder.create({
      data: {
        tenantId: input.tenantId,
        membershipId: input.membershipId,
        channel: input.channel,
        reason: input.reason,
        message: input.message ?? null,
        actorId: input.actorId ?? null,
        targetPaymentId: input.targetPaymentId ?? null,
      },
      select: { id: true, sentAt: true },
    });
  },

  /**
   * How many reminders of one kind a member has had since a moment.
   *
   * The cron calls this before sending so a re-run — a retried schedule, a
   * manual invocation — does not nudge the same member twice in a day.
   */
  countSentSince(membershipId: string, reason: ReminderReason, since: Date) {
    return prisma.paymentReminder.count({
      where: { membershipId, reason, sentAt: { gte: since } },
    });
  },

  /**
   * Hand every outstanding reminder for this membership to the payment that
   * just landed.
   *
   * Deliberately unfiltered by reason: whatever it took to get the member to
   * pay — renewal countdown, expiry notice, WhatsApp from the desk — belongs to
   * the payment that ended the chase.
   */
  async linkToPayment(membershipId: string, paymentId: string) {
    const { count } = await prisma.paymentReminder.updateMany({
      where: { membershipId, paymentId: null },
      data: { paymentId },
    });
    return count;
  },

  /** Everything sent to one member, newest first. */
  listForMembership(membershipId: string, limit = 50) {
    return prisma.paymentReminder.findMany({
      where: { membershipId },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: {
        id: true,
        channel: true,
        reason: true,
        message: true,
        sentAt: true,
        paymentId: true,
        actor: { select: { id: true, user: { select: { name: true } } } },
      },
    });
  },

  /** What it took to collect one payment. */
  listForPayment(paymentId: string) {
    return prisma.paymentReminder.findMany({
      where: { paymentId },
      orderBy: { sentAt: "asc" },
      select: {
        id: true,
        channel: true,
        reason: true,
        message: true,
        sentAt: true,
        actor: { select: { id: true, user: { select: { name: true } } } },
      },
    });
  },

  /** How many chases are still unanswered, for the member list's badge. */
  countOutstanding(membershipId: string) {
    return prisma.paymentReminder.count({
      where: { membershipId, paymentId: null },
    });
  },
};
