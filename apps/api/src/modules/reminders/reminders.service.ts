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
