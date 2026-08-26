/**
 * Documentation: Coins for bringing in a member.
 *
 * - Pays a referrer when the person they brought in completes their first subscription payment, not when that person signs up. Rewarding a signup pays for names typed into a form; rewarding a payment pays for members.
 * - Both sides can earn: the referrer for the introduction, and optionally the new member as a joining bonus. A gym sets both amounts, and zero — the default — means the feature is simply off.
 * - Once per referred member, ever. The check is the count of their completed subscription payments, so a renewal never pays the referrer a second time.
 * - Coins are the currency because they are already a ledger: a referral reward is auditable, explainable, and reversible exactly like a coupon's.
 * - Primary exports: referralRewardService.
 */
import { prisma } from "../../lib/prisma";
import { pushService } from "../push/push.service";

export const referralRewardService = {
  /**
   * Grant referral coins if this payment was the member's first subscription.
   *
   * Safe to call after any completed payment: everything that would make it a
   * no-op is checked here rather than at the call sites.
   */
  async grantForFirstSubscription(input: {
    tenantId: string;
    membershipId: string;
    paymentId: string;
    /** Notifications are optional; a cron has no request to hang them on. */
    scheduleBackgroundTask?: (promise: Promise<unknown>) => void;
  }) {
    const { tenantId, membershipId, paymentId } = input;

    const [membership, settings, completedSubscriptions] = await Promise.all([
      prisma.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: {
          id: true,
          memberId: true,
          referredByMembershipId: true,
          user: { select: { name: true } },
        },
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { referralRewardCoins: true, referralRefereeCoins: true },
      }),
      prisma.payment.count({
        where: {
          tenantId,
          membershipId,
          status: "COMPLETED",
          subscriptionId: { not: null },
        },
      }),
    ]);

    if (!membership?.referredByMembershipId) return;
    if (!settings) return;

    const referrerCoins = settings.referralRewardCoins ?? 0;
    const refereeCoins = settings.referralRefereeCoins ?? 0;
    if (referrerCoins <= 0 && refereeCoins <= 0) return;

    // The payment that triggered this is already written, so "first" means
    // exactly one. A renewal makes this two or more and pays nothing.
    if (completedSubscriptions !== 1) return;

    // A second guard for the same thing from the other direction: if a reward
    // row already exists for this member, the payment count was wrong.
    const alreadyPaid = await prisma.coinLedgerEntry.findFirst({
      where: { tenantId, membershipId, reason: "REFERRAL" },
      select: { id: true },
    });
    if (alreadyPaid) return;

    const referrer = await prisma.tenantMembership.findFirst({
      where: { id: membership.referredByMembershipId, tenantId, status: { not: "DELETED" } },
      select: { id: true, memberId: true, userId: true, user: { select: { name: true } } },
    });
    if (!referrer) return;

    const entries = [];
    if (referrerCoins > 0) {
      entries.push({
        tenantId,
        membershipId: referrer.id,
        amount: referrerCoins,
        reason: "REFERRAL",
        note: `Referred #${membership.memberId} ${membership.user.name}`,
        paymentId,
      });
    }
    if (refereeCoins > 0) {
      entries.push({
        tenantId,
        membershipId,
        amount: refereeCoins,
        reason: "REFERRAL",
        note: `Joining bonus, referred by #${referrer.memberId} ${referrer.user.name}`,
        paymentId,
      });
    }

    for (const entry of entries) {
      await prisma.coinLedgerEntry.create({ data: entry });
    }

    // Telling the referrer is most of the point — an unannounced reward
    // motivates nobody to make the next introduction.
    if (referrerCoins > 0) {
      const notify = pushService.sendToUser(referrer.userId, {
        title: `You earned ${referrerCoins} coins`,
        body: `${membership.user.name} joined on your referral. Spend your coins on your next renewal.`,
        url: "/dashboard/profile",
      }).catch(() => {
        // A referral reward must not fail because a phone could not be reached.
      });

      if (input.scheduleBackgroundTask) {
        input.scheduleBackgroundTask(notify);
      } else {
        await notify;
      }
    }
  },
};
