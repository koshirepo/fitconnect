/**
 * Documentation: Membership freezes.
 *
 * - A freeze pauses a term and hands the days back at the end. The money stays with the gym and the member keeps the days, which is what separates it from a refund.
 * - Every freeze attaches to the payment whose validity it extends, never to the membership. That is what makes the budget belong to the term — a new payment is a new term with a fresh budget — and it is what lets a reversal know exactly which `validUntil` to put back.
 * - The extension is written when the freeze is booked, not when it ends, so a member sees their new end date the moment they arrange it. Ending early or walking in mid-freeze corrects the difference.
 * - Days are compared at day granularity in one timezone, because a freeze is counted in days and half a day is not a thing anyone means.
 * - The rules implemented here are F1–F9 in `docs/subscriptions.md`; the comments name them where the reason is not obvious from the code.
 * - Primary exports: freezeService.
 */
import { prisma } from "../../lib/prisma";
import { paymentRepository } from "../payments/payments.repository";

const DAY_MS = 24 * 60 * 60 * 1000;

/** F3: anything shorter is a way to skip days, not a freeze. */
const MIN_FREEZE_DAYS = 3;

type ServiceError = { error: string; status: 400 | 403 | 404 | 409 };

/** Midnight UTC for a date, so day arithmetic never drifts on a time-of-day. */
function toDay(value: Date | string) {
  const date = new Date(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function today() {
  return toDay(new Date());
}

/** Inclusive day count: the 1st to the 3rd is three days, not two. */
function daysBetween(from: Date, to: Date) {
  return Math.round((toDay(to).getTime() - toDay(from).getTime()) / DAY_MS) + 1;
}

function addDays(date: Date, days: number) {
  return new Date(toDay(date).getTime() + days * DAY_MS);
}

/**
 * The payment that currently defines the member's term.
 *
 * A freeze extends this one, and its plan supplies the allowance. Null when the
 * member has never bought a plan, in which case there is no term to pause.
 */
async function findTermPayment(tenantId: string, membershipId: string) {
  return prisma.payment.findFirst({
    where: {
      tenantId,
      membershipId,
      status: "COMPLETED",
      subscriptionId: { not: null },
      validUntil: { not: null },
    },
    orderBy: { validUntil: "desc" },
    select: {
      id: true,
      validUntil: true,
      subscription: {
        select: { id: true, title: true, freezeDays: true, freezeCount: true },
      },
    },
  });
}

export const freezeService = {
  /**
   * What a member may still freeze, and whether they are frozen right now.
   *
   * Safe to call for anyone: a member with no term simply has no allowance.
   */
  async getStatus(tenantId: string, membershipId: string) {
    const payment = await findTermPayment(tenantId, membershipId);

    if (!payment?.subscription) {
      return {
        data: {
          canFreeze: false,
          reason: "This member has no active subscription to freeze.",
          allowanceDays: 0,
          usedDays: 0,
          remainingDays: 0,
          allowedFreezes: 0,
          usedFreezes: 0,
          currentFreeze: null,
          history: [],
        },
      };
    }

    const freezes = await prisma.membershipFreeze.findMany({
      where: { tenantId, paymentId: payment.id },
      orderBy: { startsOn: "desc" },
      select: {
        id: true,
        startsOn: true,
        plannedEndsOn: true,
        endedOn: true,
        daysUsed: true,
        reason: true,
        endedBy: true,
        createdAt: true,
      },
    });

    const usedDays = freezes.reduce((sum, freeze) => sum + freeze.daysUsed, 0);
    const allowanceDays = payment.subscription.freezeDays;
    const allowedFreezes = payment.subscription.freezeCount;
    const now = today();

    // Running or scheduled: not yet ended, and today has not passed its end.
    const currentFreeze =
      freezes.find(
        (freeze) => !freeze.endedOn && toDay(freeze.plannedEndsOn) >= now,
      ) ?? null;

    return {
      data: {
        canFreeze: allowanceDays > 0,
        reason:
          allowanceDays > 0
            ? null
            : `The ${payment.subscription.title} plan cannot be frozen.`,
        planTitle: payment.subscription.title,
        allowanceDays,
        usedDays,
        remainingDays: Math.max(0, allowanceDays - usedDays),
        allowedFreezes,
        usedFreezes: freezes.length,
        currentFreeze,
        history: freezes,
        termEndsOn: payment.validUntil,
      },
    };
  },

  /**
   * Book a freeze.
   *
   * Every rule that can refuse one is checked here rather than at the call
   * sites, so the desk and any future member-facing path cannot disagree.
   */
  async create(
    tenantId: string,
    membershipId: string,
    input: {
      startsOn: Date;
      days: number;
      reason?: string;
      /** F5: only an override may backdate, and it is recorded. */
      allowBackdate?: boolean;
    },
    actorId?: string,
  ): Promise<{ data: { freeze: { id: string }; newTermEndsOn: Date } } | ServiceError> {
    const membership = await prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true, status: true, dueDate: true },
    });
    if (!membership) return { error: "Member not found.", status: 404 };

    // F4: only an active membership. A suspended one must pay, not pause, and
    // grace is already borrowed time.
    if (membership.status !== "ACTIVE") {
      return { error: "Only an active membership can be frozen.", status: 400 };
    }
    if (!membership.dueDate || toDay(membership.dueDate) < today()) {
      return {
        error: "This membership has lapsed. Renew it before freezing.",
        status: 400,
      };
    }

    const payment = await findTermPayment(tenantId, membershipId);
    if (!payment?.subscription) {
      return { error: "This member has no subscription to freeze.", status: 400 };
    }

    const { freezeDays, freezeCount, title } = payment.subscription;
    if (freezeDays <= 0) {
      return { error: `The ${title} plan cannot be frozen.`, status: 400 };
    }

    // F3.
    if (input.days < MIN_FREEZE_DAYS) {
      return {
        error: `A freeze must be at least ${MIN_FREEZE_DAYS} days.`,
        status: 400,
      };
    }

    // F5.
    const startsOn = toDay(input.startsOn);
    if (startsOn < today() && !input.allowBackdate) {
      return { error: "A freeze cannot start in the past.", status: 400 };
    }

    const existing = await prisma.membershipFreeze.findMany({
      where: { tenantId, paymentId: payment.id },
      select: { id: true, daysUsed: true, endedOn: true, plannedEndsOn: true },
    });

    // F4: not while already frozen, and not overlapping one already booked.
    const overlapping = existing.some(
      (freeze) => !freeze.endedOn && toDay(freeze.plannedEndsOn) >= startsOn,
    );
    if (overlapping) {
      return {
        error: "This membership already has a freeze running or booked.",
        status: 409,
      };
    }

    // F1: the count guards against nuisance freezes, the days are the real limit.
    if (existing.length >= freezeCount) {
      return {
        error: `The ${title} plan allows ${freezeCount} freeze${freezeCount === 1 ? "" : "s"} per term, and that is used up.`,
        status: 400,
      };
    }

    const usedDays = existing.reduce((sum, freeze) => sum + freeze.daysUsed, 0);
    const remaining = freezeDays - usedDays;
    if (input.days > remaining) {
      return {
        error:
          remaining <= 0
            ? `This term's ${freezeDays} freeze days are used up.`
            : `Only ${remaining} freeze day${remaining === 1 ? "" : "s"} left on this term.`,
        status: 400,
      };
    }

    const plannedEndsOn = addDays(startsOn, input.days - 1);

    const freeze = await prisma.membershipFreeze.create({
      data: {
        tenantId,
        membershipId,
        paymentId: payment.id,
        startsOn,
        plannedEndsOn,
        // Charged optimistically so the member's new end date is true from the
        // moment they book. Corrected if the freeze ends early.
        daysUsed: input.days,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(actorId ? { createdById: actorId } : {}),
      },
      select: { id: true },
    });

    // F6: onto the payment's own window, never onto dueDate — the due date is
    // recomputed from payment rows and would wipe anything written there.
    const newTermEndsOn = addDays(payment.validUntil!, input.days);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { validUntil: newTermEndsOn },
    });
    await paymentRepository.refreshDueDate(membershipId);

    return { data: { freeze, newTermEndsOn } };
  },

  /**
   * End a running freeze on a given day and give back the days not used.
   *
   * Shared by the desk unfreezing early (F7) and by a member simply turning up
   * (F8), because the arithmetic is identical — only the reason differs.
   */
  async end(
    tenantId: string,
    freezeId: string,
    endedOn: Date,
    endedBy: "ENDED_EARLY" | "ATTENDED",
  ): Promise<{ data: { daysUsed: number; daysReturned: number } } | ServiceError> {
    const freeze = await prisma.membershipFreeze.findFirst({
      where: { id: freezeId, tenantId },
      select: {
        id: true,
        membershipId: true,
        paymentId: true,
        startsOn: true,
        plannedEndsOn: true,
        endedOn: true,
        daysUsed: true,
      },
    });
    if (!freeze) return { error: "Freeze not found.", status: 404 };
    if (freeze.endedOn) return { error: "This freeze has already ended.", status: 409 };

    const end = toDay(endedOn);

    // Ending on or after the planned end is not an early end at all.
    if (end >= toDay(freeze.plannedEndsOn)) {
      await prisma.membershipFreeze.update({
        where: { id: freeze.id },
        data: { endedOn: toDay(freeze.plannedEndsOn), endedBy },
      });
      return { data: { daysUsed: freeze.daysUsed, daysReturned: 0 } };
    }

    // A freeze that has not started yet is cancelled outright: nothing was used.
    const actualDays =
      end < toDay(freeze.startsOn) ? 0 : daysBetween(freeze.startsOn, end);
    const daysReturned = freeze.daysUsed - actualDays;

    await prisma.membershipFreeze.update({
      where: { id: freeze.id },
      data: { endedOn: end, endedBy, daysUsed: actualDays },
    });

    // Take back the part of the extension that was never used.
    if (daysReturned > 0) {
      const payment = await prisma.payment.findUnique({
        where: { id: freeze.paymentId },
        select: { validUntil: true },
      });

      if (payment?.validUntil) {
        await prisma.payment.update({
          where: { id: freeze.paymentId },
          data: { validUntil: addDays(payment.validUntil, -daysReturned) },
        });
        await paymentRepository.refreshDueDate(freeze.membershipId);
      }
    }

    return { data: { daysUsed: actualDays, daysReturned } };
  },

  /**
   * End whatever freeze covers this date, because the member attended (F8).
   *
   * A no-op when they are not frozen, so the attendance path can call it
   * without first asking.
   */
  async endForAttendance(tenantId: string, membershipId: string, date: Date) {
    const day = toDay(date);

    const freeze = await prisma.membershipFreeze.findFirst({
      where: {
        tenantId,
        membershipId,
        endedOn: null,
        startsOn: { lte: day },
        plannedEndsOn: { gte: day },
      },
      select: { id: true },
    });
    if (!freeze) return null;

    // Ended the day before they walked in: the day they trained is a training
    // day, not a frozen one.
    return freezeService.end(tenantId, freeze.id, addDays(day, -1), "ATTENDED");
  },

  /** F9: rules 1–3 all start from an end date, and a freeze is still moving it. */
  async isFrozen(tenantId: string, membershipId: string) {
    const now = today();
    const freeze = await prisma.membershipFreeze.findFirst({
      where: {
        tenantId,
        membershipId,
        endedOn: null,
        startsOn: { lte: now },
        plannedEndsOn: { gte: now },
      },
      select: { id: true },
    });
    return Boolean(freeze);
  },
};
