/**
 * Documentation: Payments service.
 *
 * - Implements the business rules for subscription management, payment collection, and membership validity tracking by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: paymentService.
 */
import type { PaymentStatus } from "@fitconnect/shared/types/enums";
import { memberRepository } from "../members/members.repository";
import { pushService } from "../push/push.service";
import { couponService, type Quote } from "../coupons/coupons.service";
import { freezeService } from "../freezes/freezes.service";
import { referralRewardService } from "../members/referral-rewards.service";
import { reminderService } from "../reminders/reminders.service";
import { paymentRepository } from "./payments.repository";
import { flattenNestedMember } from "../../lib/flatten";
import type {
  CreatePaymentInput,
  UpdatePaymentInput,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
} from "./payments.schema";

type BackgroundTaskScheduler = (promise: Promise<unknown>) => void;

function normalizeBadgeIds(badgeIds?: string[]) {
  return Array.from(new Set((badgeIds ?? []).map((id) => id.trim()).filter(Boolean)));
}

/**
 * Run an admin notification without making the caller wait for it.
 *
 * Falls back to awaiting when there is no scheduler — a cron or a test — so the
 * send still happens rather than being dropped on the floor.
 */
function notifyInBackground(
  scheduleBackgroundTask: BackgroundTaskScheduler | undefined,
  send: () => Promise<unknown>,
) {
  if (scheduleBackgroundTask) {
    scheduleBackgroundTask(send());
    return;
  }
  return send();
}

export const paymentService = {
  /**
   * Execute the `list payments` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listPayments(
    tenantId: string,
    page: number,
    limit: number,
    statusFilter?: string,
    search?: string,
    membershipId?: string,
  ) {
    const { payments, total } = await paymentRepository.listPayments(
      tenantId,
      page,
      limit,
      statusFilter,
      search,
      membershipId,
    );
    const flat = payments.map((p: {
      id: string;
      amount: number;
      status: string;
      paidAt?: Date | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
      description?: string | null;
      note?: string | null;
      createdAt: Date;
      member?: unknown;
      collectedBy?: unknown;
    }) => ({
      ...p,
      member: p.member ? flattenNestedMember(p.member as any) : undefined,
      collectedBy: p.collectedBy ? flattenNestedMember(p.collectedBy as any) : undefined,
    }));
    return { data: { payments: flat }, total };
  },

  /**
   * Execute the `get my payments` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getMyPayments(tenantId: string, userId: string) {
    const membership = await paymentRepository.findMembershipByUser(tenantId, userId);
    if (!membership) {
      return { error: "Not a member of this tenant.", status: 403 as const };
    }

    const payments = await paymentRepository.listMyPayments(membership.id);
    return { data: { payments } };
  },

  /**
   * Execute the `get payment by id` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getPaymentById(
    tenantId: string,
    paymentId: string,
    userId: string,
    canReadAll: boolean,
  ) {
    const payment = await paymentRepository.findPaymentDetail(paymentId, tenantId);
    if (!payment) {
      return { error: "Payment not found.", status: 404 as const };
    }

    // Without the gym-wide read capability the caller may only open their own receipt.
    if (!canReadAll) {
      const membership = await paymentRepository.findMembershipByUser(tenantId, userId);
      if (!membership || membership.id !== payment.membershipId) {
        return { error: "You can only view your own payments.", status: 403 as const };
      }
    }

    return {
      data: {
        payment: {
          id: payment.id,
          amount: payment.amount,
          description: payment.description,
          note: payment.note,
          status: payment.status,
          paidAt: payment.paidAt,
          validFrom: payment.validFrom,
          validUntil: payment.validUntil,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          member: payment.member ? flattenNestedMember(payment.member as any) : undefined,
          collectedBy: payment.collectedBy ? flattenNestedMember(payment.collectedBy as any) : undefined,
          subscription: payment.subscription,
        },
      },
    };
  },

  /**
   * Execute the `create payment` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createPayment(
    tenantId: string,
    userId: string,
    input: CreatePaymentInput,
    scheduleBackgroundTask?: BackgroundTaskScheduler,
  ) {
    // Run independent validation lookups in parallel
    const [targetMembership, subscription, collector] = await Promise.all([
      paymentRepository.findMembershipById(input.membershipId, tenantId),
      input.subscriptionId
        ? paymentRepository.findSubscription(input.subscriptionId, tenantId)
        : null,
      paymentRepository.findMembershipByUser(tenantId, userId),
    ]);

    if (!targetMembership) {
      return { error: "Target member not found in this tenant.", status: 404 as const };
    }

    if (input.subscriptionId && !subscription) {
      return { error: "Subscription not found in this tenant.", status: 404 as const };
    }

    // A frozen membership's end date is still moving, and every start-date rule
    // is computed from it. Unfreeze first.
    if (input.subscriptionId && (await freezeService.isFrozen(tenantId, input.membershipId))) {
      return {
        error: "This membership is frozen. Unfreeze it before selling a new term.",
        status: 400 as const,
      };
    }

    if (
      subscription?.badges.length &&
      !subscription.badges.some((badge) =>
        targetMembership.badges.some((memberBadge) => memberBadge.id === badge.id),
      )
    ) {
      return {
        error: "This member is not eligible for the selected subscription plan.",
        status: 400 as const,
      };
    }

    // Coupons and coins are priced here, not by the caller. `quote` is the
    // same function the preview screen and the online flows use, so a code
    // can never be worth one thing on one screen and another elsewhere.
    let quote: Quote | null = null;
    if (input.couponCode?.trim() || (input.coinsToSpend ?? 0) > 0) {
      const priced = await couponService.quote({
        tenantId,
        membershipId: input.membershipId,
        subscriptionId: input.subscriptionId ?? null,
        amount: input.amount,
        code: input.couponCode ?? null,
        coinsToSpend: input.coinsToSpend ?? 0,
      });

      if ("error" in priced) {
        return { error: priced.error, status: priced.status as 400 | 404 };
      }
      quote = priced.data;
    }

    // What the member owes after any coupon and coins.
    const payableAmount = quote ? quote.netAmount : input.amount;

    // A validity coupon's extra days go onto this payment's own window.
    // `refreshDueDate` derives the membership's due date from payment rows,
    // so days written anywhere else would vanish on the next recompute.
    const validUntilWithBonus =
      input.validUntil && quote && quote.bonusDays > 0
        ? new Date(
            input.validUntil.getTime() + quote.bonusDays * 24 * 60 * 60 * 1000,
          )
        : input.validUntil;

    // A part payment: the member hands over less than the price now, and the
    // rest is written as a second row they still owe. The membership still
    // gets its validity window — the desk decided to let them train, and the
    // balance is tracked rather than blocking them at the door.
    const paidAmount = Math.min(input.paidAmount ?? payableAmount, payableAmount);
    const balanceAmount =
      input.status === "COMPLETED" ? payableAmount - paidAmount : 0;

    const payment = await paymentRepository.createPayment({
      tenantId,
      membershipId: input.membershipId,
      subscriptionId: input.subscriptionId,
      chargeId: input.chargeId,
      description: input.description,
      note: input.note,
      status: input.status,
      // `amount` is always what was collected, so every revenue query keeps
      // working; the list price and what came off it sit beside it.
      amount: input.status === "COMPLETED" ? paidAmount : payableAmount,
      ...(quote
        ? {
            listAmount: quote.listAmount,
            discountAmount: quote.discountAmount,
            coinsRedeemed: quote.coinsRedeemed,
          }
        : {}),
      collectorId: collector?.id,
      paidAt: input.status === "COMPLETED" ? new Date() : undefined,
      validFrom: input.validFrom,
      validUntil: validUntilWithBonus,
    });

    // The balance carries no validity of its own — the row above already gave
    // the membership its window, and paying the remainder must not extend it a
    // second time.
    const label = input.description ?? subscription?.title ?? null;
    const balancePayment =
      balanceAmount > 0
        ? await paymentRepository.createPayment({
            tenantId,
            membershipId: input.membershipId,
            subscriptionId: input.subscriptionId,
            chargeId: input.chargeId,
            description: label ? `Balance — ${label}` : "Balance",
            note: input.note,
            status: "PENDING",
            amount: balanceAmount,
            collectorId: collector?.id,
          })
        : null;

    // Recorded only now: a redemption must always be traceable to the
    // payment it affected. A coupon exhausted between the quote and here
    // fails the redemption rather than the payment — the money was taken.
    if (quote && (quote.coupon || quote.coinsRedeemed > 0)) {
      const redeemed = await couponService.redeem({
        tenantId,
        membershipId: input.membershipId,
        quote,
        paymentId: payment.id,
        appliedById: userId,
      });

      if (!redeemed.ok) {
        console.warn("Coupon redemption failed after payment.", {
          paymentId: payment.id,
          reason: redeemed.reason,
        });
      }
    }

    // Keep membership.dueDate in sync
    if (validUntilWithBonus) {
      await paymentRepository.refreshDueDate(input.membershipId);
    }

    // Reactivate inactive member when due date is today or future
    if (targetMembership.status !== "ACTIVE") {
      const updatedMembership = await memberRepository.findMembershipById(
        input.membershipId,
        tenantId,
      );

      if (updatedMembership?.dueDate) {
        const now = new Date();
        const dueUtc = new Date(
          Date.UTC(
            updatedMembership.dueDate.getUTCFullYear(),
            updatedMembership.dueDate.getUTCMonth(),
            updatedMembership.dueDate.getUTCDate(),
          ),
        );
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

        if (dueUtc >= todayUtc) {
          await memberRepository.updateMembershipStatus(input.membershipId, "ACTIVE");
        }
      }
    }

    // A first subscription payment is what pays a referrer, so this sits
    // with the money rather than with the signup that preceded it.
    if (payment.status === "COMPLETED" && input.subscriptionId) {
      await referralRewardService.grantForFirstSubscription({
        tenantId,
        membershipId: input.membershipId,
        paymentId: payment.id,
        scheduleBackgroundTask,
      });
    }

    // Arrears the desk is collecting in the same breath as the plan. Settled
    // as their own rows rather than folded into the amount above: each keeps
    // its description and its date, so the ledger still says what was paid for.
    const settledPending =
      input.status === "COMPLETED" && input.settlePendingIds?.length
        ? await paymentRepository.settlePendingAtDesk(
            tenantId,
            input.membershipId,
            input.settlePendingIds,
            collector?.id,
          )
        : [];

    if (settledPending.length > 0) {
      await paymentRepository.refreshDueDate(input.membershipId);
    }

    // Whatever it took to get this member to pay now belongs to the payment
    // that ended the chase, so the desk can see the cost of collecting it.
    await reminderService.attachToPayment(
      input.membershipId,
      payment.id,
      payment.status,
    );

    // Only a completed row is money in hand; a PENDING one notifies when it
    // is settled, not when it is written.
    if (payment.status === "COMPLETED") {
      notifyInBackground(scheduleBackgroundTask, () =>
        pushService.notifyPaymentReceived(tenantId, {
          amount: payment.amount,
          memberId: payment.member?.memberId,
          memberName: payment.member?.user?.name,
          description: payment.description,
          paymentId: payment.id,
          source: "DESK",
          actorUserId: userId,
        }),
      );
    }

    return {
      data: {
        payment: {
          ...payment,
          member: payment.member ? flattenNestedMember(payment.member as any) : undefined,
        },
        /** The remainder still owed, when this was a part payment. */
        balancePayment: balancePayment
          ? { id: balancePayment.id, amount: balancePayment.amount }
          : null,
        /** Dues closed alongside this payment, and what they came to. */
        settledPending,
        /**
         * What actually changed hands: this payment plus any arrears settled
         * with it. The receipt and the confirmation both show this rather than
         * the plan price on its own.
         */
        collectedTotal:
          (input.status === "COMPLETED" ? payment.amount : 0) +
          settledPending.reduce((sum, row) => sum + row.amount, 0),
      },
    };
  },

  /**
   * Execute the `update payment` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updatePayment(tenantId: string, paymentId: string, input: UpdatePaymentInput) {
    const existing = await paymentRepository.findPayment(paymentId, tenantId);
    if (!existing) {
      return { error: "Payment not found.", status: 404 as const };
    }

    // Build changes diff (only fields that actually changed)
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const fields = ["amount", "description", "note", "validFrom", "validUntil"] as const;
    for (const key of fields) {
      if (!(key in input)) continue;
      const oldVal = existing[key];
      const newVal = input[key];
      const oldStr = oldVal instanceof Date ? oldVal.toISOString() : (oldVal ?? null);
      const newStr = newVal instanceof Date ? newVal.toISOString() : (newVal ?? null);
      if (String(oldStr) !== String(newStr)) {
        changes[key] = { from: oldStr, to: newStr };
      }
    }

    const payment = await paymentRepository.updatePayment(paymentId, input);

    // Keep membership.dueDate in sync if validity dates changed
    if (existing.membershipId && ("validUntil" in input || "validFrom" in input)) {
      await paymentRepository.refreshDueDate(existing.membershipId);
    }

    return { data: { payment }, changes };
  },

  /**
   * Execute the `update payment status` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: PaymentStatus,
    actorUserId?: string,
    scheduleBackgroundTask?: BackgroundTaskScheduler,
    /**
     * Whether the caller holds `PAYMENTS_UPDATE` rather than only
     * `PAYMENTS_SETTLE`. A settler closes out money that is still owed; an
     * editor may also reverse money already taken.
     */
    canEditSettled = true,
  ) {
    const existing = await paymentRepository.findPayment(paymentId, tenantId);
    if (!existing) {
      return { error: "Payment not found.", status: 404 as const };
    }

    if (!canEditSettled) {
      if (existing.status !== "PENDING") {
        return {
          error: "Only a pending payment can be settled. Ask an admin to change a settled one.",
          status: 403 as const,
        };
      }
      if (status !== "COMPLETED" && status !== "FAILED") {
        return {
          error: "A pending payment can only be approved or marked failed.",
          status: 403 as const,
        };
      }
    }

    const payment = await paymentRepository.updatePaymentStatus(paymentId, status);

    // Keep membership.dueDate in sync
    if (existing.membershipId) {
      await paymentRepository.refreshDueDate(existing.membershipId);
    }

    // A pending row settling is the other way a chase ends, and the reminders
    // that produced it belong to this payment just as much.
    await reminderService.attachToPayment(existing.membershipId, paymentId, status);

    // Money coming back takes the coupon with it: the redemption slot is
    // freed, granted coins are clawed back, and spent coins are returned.
    if (status === "REFUNDED" || status === "FAILED") {
      await couponService.reverseForPayment(tenantId, paymentId, actorUserId);
    }

    // The transition is what matters: re-saving an already-completed payment
    // should not buzz every admin a second time.
    if (status === "COMPLETED" && existing.status !== "COMPLETED") {
      notifyInBackground(scheduleBackgroundTask, () =>
        pushService.notifyPaymentReceived(tenantId, {
          amount: payment.amount,
          memberId: existing.member?.memberId,
          memberName: existing.member?.user?.name,
          description: existing.description,
          paymentId,
          source: "DESK",
          actorUserId,
        }),
      );
    }

    return { data: { payment }, previousStatus: existing.status };
  },

  /**
   * Execute the `delete payment` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async deletePayment(tenantId: string, paymentId: string) {
    const existing = await paymentRepository.findPayment(paymentId, tenantId);
    if (!existing) {
      return { error: "Payment not found.", status: 404 as const };
    }

    // Deleting removes the money this recorded, so anything the coupon gave
    // for it goes back too.
    await couponService.reverseForPayment(tenantId, paymentId);
    await paymentRepository.deletePayment(paymentId);
    await paymentRepository.refreshDueDate(existing.membershipId);

    return { data: { paymentId }, deletedPayment: existing };
  },

  /**
   * Execute the `list subscriptions` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listSubscriptions(tenantId: string, includeInactive = false) {
    const subscriptions = await paymentRepository.listSubscriptions(tenantId, includeInactive);
    return { data: { subscriptions } };
  },

  /**
   * Execute the `create subscription` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createSubscription(tenantId: string, input: CreateSubscriptionInput) {
    const badgeIds = normalizeBadgeIds(input.badgeIds);

    if (badgeIds.length > 0) {
      const badges = await paymentRepository.findBadgeIds(tenantId, badgeIds);
      if (badges.length !== badgeIds.length) {
        return {
          error: "One or more selected badges do not belong to this tenant.",
          status: 400 as const,
        };
      }
    }

    const subscription = await paymentRepository.createSubscription(tenantId, {
      ...input,
      badgeIds,
    });
    return { data: { subscription } };
  },

  /**
   * Execute the `update subscription` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updateSubscription(
    tenantId: string,
    subscriptionId: string,
    input: UpdateSubscriptionInput,
  ) {
    const existing = await paymentRepository.findSubscriptionDetail(subscriptionId, tenantId);
    if (!existing) {
      return { error: "Subscription not found.", status: 404 as const };
    }

    const hasBadgeIds = Object.prototype.hasOwnProperty.call(input, "badgeIds");
    const badgeIds = hasBadgeIds ? normalizeBadgeIds(input.badgeIds) : undefined;

    if (badgeIds && badgeIds.length > 0) {
      const badges = await paymentRepository.findBadgeIds(tenantId, badgeIds);
      if (badges.length !== badgeIds.length) {
        return {
          error: "One or more selected badges do not belong to this tenant.",
          status: 400 as const,
        };
      }
    }

    const subscription = await paymentRepository.updateSubscription(subscriptionId, {
      ...input,
      ...(hasBadgeIds ? { badgeIds } : {}),
    });
    return { data: { subscription }, previous: existing };
  },

  /**
   * Execute the `delete subscription` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async deleteSubscription(tenantId: string, subscriptionId: string) {
    const existing = await paymentRepository.findSubscriptionDetail(subscriptionId, tenantId);
    if (!existing) {
      return { error: "Subscription not found.", status: 404 as const };
    }

    const paymentCount = await paymentRepository.countPaymentsForSubscription(subscriptionId);
    if (paymentCount > 0) {
      return {
        error: "This plan already has payment history. Inactivate it instead of deleting it.",
        status: 409 as const,
      };
    }

    await paymentRepository.deleteSubscription(subscriptionId);
    return { data: { subscriptionId } };
  },

  /**
   * Execute the `get analytics` workflow for the payments module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getAnalytics(tenantId: string) {
    const analytics = await paymentRepository.getPaymentAnalytics(tenantId);
    return { data: { analytics } };
  },
};
