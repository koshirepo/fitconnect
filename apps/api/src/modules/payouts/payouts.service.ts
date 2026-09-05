/**
 * Documentation: Working out what a gym is owed, and moving a payout along.
 *
 * - The one place the arithmetic lives: gross, less what Razorpay charged, less FitConnect's cut, is what the gym receives. Every figure is in paise and every step is integer, because a statement that does not add up is worse than no statement.
 * - The commission is applied per payment, not to the total, because the two rates differ: a membership and a tub of protein can be charged differently, and a gym selling both would otherwise be billed at whichever rate happened to be applied last.
 * - The cut is taken on the gross, not on what is left after Razorpay. That is the honest reading of a percentage of sales, and it is what a gym will assume when it checks the number against its own takings.
 * - A payout snapshots its own deductions and the rate used. A gym's rate can change, and last month's statement has to keep saying what was actually taken on the day.
 * - Nothing here moves money. Platform staff make the transfer and record the reference; this owns the ledger, the queue, and the paperwork.
 * - Primary exports: payoutsService.
 */
import { open, seal } from "../../lib/secret-box";
import { payoutsRepository } from "./payouts.repository";

/** A percentage of something, in basis points, rounded to the paisa. */
function applyBps(amountPaise: number, bps: number) {
  return Math.round((amountPaise * bps) / 10_000);
}

export const payoutsService = {
  /**
   * What a gym has coming, and where it came from.
   *
   * Returns the parts as well as the total, because "you are owed ₹4,812" is a
   * number a gym has no way to check. The four lines behind it are.
   */
  async balance(tenantId: string) {
    const [collected, committed, rates] = await Promise.all([
      payoutsRepository.collectedForTenant(tenantId),
      payoutsRepository.committedPaise(tenantId),
      payoutsRepository.commissionRates(tenantId),
    ]);

    if (!rates) return { error: "Gym not found.", status: 404 as const };

    let grossPaise = 0;
    let gatewayFeePaise = 0;
    let commissionPaise = 0;
    // How much of the gateway deduction is assumed rather than known, so a
    // statement can say so instead of presenting an estimate as a fact.
    let estimatedFeePaise = 0;
    let estimatedCount = 0;

    for (const payment of collected) {
      const bps =
        payment.kind === "STORE"
          ? rates.storeCommissionBps
          : rates.subscriptionCommissionBps;

      grossPaise += payment.grossPaise;
      gatewayFeePaise += payment.gatewayFeePaise;
      if (payment.gatewayFeeEstimated) {
        estimatedFeePaise += payment.gatewayFeePaise;
        estimatedCount += 1;
      }
      // Per payment, at that payment's rate. Applying one rate to the total
      // would silently charge kit at the membership rate, or the reverse.
      commissionPaise += applyBps(payment.grossPaise, bps);
    }

    const earnedPaise = grossPaise - gatewayFeePaise - commissionPaise;

    return {
      data: {
        grossPaise,
        gatewayFeePaise,
        commissionPaise,
        /** Everything ever earned, before payouts. */
        earnedPaise,
        /** Already requested, approved, or sent. */
        committedPaise: committed,
        /** What can be asked for today. Never negative. */
        availablePaise: Math.max(0, earnedPaise - committed),
        paymentCount: collected.length,
        /** Of `gatewayFeePaise`, how much was estimated at the standard rate. */
        estimatedFeePaise,
        /** How many payments predate fee tracking. */
        estimatedFeeCount: estimatedCount,
        rates: {
          subscriptionBps: rates.subscriptionCommissionBps,
          storeBps: rates.storeCommissionBps,
        },
      },
    };
  },

  async getBankAccount(tenantId: string) {
    const account = await payoutsRepository.findBankAccount(tenantId);
    if (!account) return { data: { account: null } };

    // The number itself is never returned. A screen confirming where money is
    // going needs the last four digits and nothing more.
    return {
      data: {
        account: {
          accountHolder: account.accountHolder,
          accountLast4: account.accountLast4,
          ifsc: account.ifsc,
          bankName: account.bankName,
          updatedAt: account.updatedAt,
        },
      },
    };
  },

  async saveBankAccount(
    tenantId: string,
    input: { accountHolder: string; accountNumber: string; ifsc: string; bankName?: string },
  ) {
    const digits = input.accountNumber.replace(/\s+/g, "");

    const saved = await payoutsRepository.upsertBankAccount(tenantId, {
      accountHolder: input.accountHolder.trim(),
      accountNumber: await seal(digits),
      accountLast4: digits.slice(-4),
      ifsc: input.ifsc.trim().toUpperCase(),
      bankName: input.bankName?.trim() || null,
    });

    return {
      data: {
        account: {
          accountHolder: saved.accountHolder,
          accountLast4: saved.accountLast4,
          ifsc: saved.ifsc,
          bankName: saved.bankName,
          updatedAt: saved.updatedAt,
        },
      },
    };
  },

  /**
   * Ask for everything currently available.
   *
   * Deliberately all-or-nothing rather than an amount the gym types. A partial
   * request means deciding which payments it covers, and that is bookkeeping
   * nobody asked for — the balance is the balance.
   */
  async requestPayout(tenantId: string, requestedById?: string) {
    const [balance, account] = await Promise.all([
      this.balance(tenantId),
      payoutsRepository.findBankAccount(tenantId),
    ]);

    // Forwarded as its own shape rather than returned whole: handing back the
    // balance union here widens this function's return type and the caller can
    // no longer tell a payout from a balance.
    if ("error" in balance) return { error: balance.error, status: balance.status };

    if (!account) {
      return {
        error: "Add the bank account this should be paid into first.",
        status: 400 as const,
      };
    }

    if (balance.data.availablePaise <= 0) {
      return { error: "There is nothing to pay out right now.", status: 400 as const };
    }

    // The rate recorded is the one that produced this figure. Where a gym sells
    // both, the blended rate it actually paid is more honest on a statement than
    // either of the two rates on its own.
    const blendedBps =
      balance.data.grossPaise > 0
        ? Math.round((balance.data.commissionPaise * 10_000) / balance.data.grossPaise)
        : 0;

    const payout = await payoutsRepository.createPayout({
      tenantId,
      grossPaise: balance.data.grossPaise,
      gatewayFeePaise: balance.data.gatewayFeePaise,
      commissionPaise: balance.data.commissionPaise,
      commissionBps: blendedBps,
      netPaise: balance.data.availablePaise,
      requestedById: requestedById ?? null,
      accountHolder: account.accountHolder,
      accountLast4: account.accountLast4,
      ifsc: account.ifsc,
    });

    return { data: { payout } };
  },

  listForTenant(tenantId: string) {
    return payoutsRepository.listForTenant(tenantId).then((payouts) => ({ data: { payouts } }));
  },

  listPending() {
    return payoutsRepository.listPending().then((payouts) => ({ data: { payouts } }));
  },

  /**
   * The account to actually transfer into.
   *
   * The only path that unseals a number, and it is platform staff acting on a
   * specific payout. Every other screen sees the last four digits.
   */
  async revealAccountForPayout(payoutId: string) {
    const payout = await payoutsRepository.findPayout(payoutId);
    if (!payout) return { error: "Payout not found.", status: 404 as const };

    const account = await payoutsRepository.findBankAccount(payout.tenantId);
    if (!account) return { error: "That gym has no bank account saved.", status: 404 as const };

    return {
      data: {
        accountHolder: account.accountHolder,
        accountNumber: await open(account.accountNumber),
        ifsc: account.ifsc,
        bankName: account.bankName,
      },
    };
  },

  async approve(payoutId: string, decidedById?: string) {
    const payout = await payoutsRepository.advance(payoutId, ["REQUESTED"], {
      status: "APPROVED",
      decidedById: decidedById ?? null,
      decidedAt: new Date(),
    });

    if (!payout) {
      return { error: "That request has already been dealt with.", status: 409 as const };
    }
    return { data: { payout } };
  },

  async reject(payoutId: string, note: string, decidedById?: string) {
    const payout = await payoutsRepository.advance(payoutId, ["REQUESTED", "APPROVED"], {
      status: "REJECTED",
      decidedById: decidedById ?? null,
      decidedAt: new Date(),
      note,
    });

    if (!payout) {
      return { error: "That request has already been dealt with.", status: 409 as const };
    }
    return { data: { payout } };
  },

  /**
   * Record that the money was sent.
   *
   * The reference is required, not optional. A payout marked paid with nothing
   * to trace it by is a row that says money moved and cannot show that it did.
   */
  async markPaid(payoutId: string, reference: string, decidedById?: string) {
    const payout = await payoutsRepository.advance(payoutId, ["REQUESTED", "APPROVED"], {
      status: "PAID",
      decidedById: decidedById ?? null,
      reference: reference.trim(),
      paidAt: new Date(),
    });

    if (!payout) {
      return { error: "That payout has already been settled.", status: 409 as const };
    }
    return { data: { payout } };
  },
};
