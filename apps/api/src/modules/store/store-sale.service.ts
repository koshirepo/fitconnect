/**
 * Documentation: Gym store sales.
 *
 * - Takes money for a basket: prices it, claims the stock, writes the ledger row, spends and grants coins, and records the order.
 * - Stock is claimed before anything is charged, and each claim is a conditional decrement rather than a read followed by a write. Two people buying the last tub at the same moment cannot both succeed, and a basket that fails halfway puts back what it already took.
 * - Pricing is recomputed here from the database, never taken from the request. A client that could name its own total could buy a ₹5,000 tub for a rupee — the same rule the subscription checkout follows.
 * - This module covers the counter sale, which completes immediately because the money is already in the till. An online sale reserves stock the same way but settles against a gateway signature, and lands alongside the existing checkout code.
 * - Primary exports: storeSaleService.
 */
import { priceBasket, validateBasket, type BasketLine } from "@fitconnect/shared/store-pricing";
import { prisma } from "../../lib/prisma";
import { storeRepository } from "./store.repository";
import { couponService, findCoupon } from "../coupons/coupons.service";
import { paymentRepository } from "../payments/payments.repository";
import type { CounterSaleInput } from "./store.schema";

type SaleError = { error: string; status: 400 | 404 | 409 };

/** A line as the caller asked for it, joined to what the gym actually sells. */
type ResolvedLine = BasketLine & {
  productId: string;
  productName: string;
  variantName: string;
  attributes: unknown;
};

/**
 * Join the requested basket to the catalogue.
 *
 * Every price, coin grant, and stock figure comes from the database. The request
 * contributes nothing but variant ids and quantities.
 */
async function resolveLines(
  tenantId: string,
  items: { variantId: string; quantity: number }[],
): Promise<{ lines: ResolvedLine[] } | SaleError> {
  const variants = await storeRepository.findVariantsForSale(
    tenantId,
    items.map((item) => item.variantId),
  );

  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const lines: ResolvedLine[] = [];

  for (const item of items) {
    const variant = byId.get(item.variantId);
    if (!variant) {
      return {
        error: "One of those items is no longer on sale.",
        status: 404 as const,
      };
    }

    lines.push({
      variantId: variant.id,
      quantity: item.quantity,
      unitPrice: variant.price,
      coinsGrantedPerUnit: variant.product.coinsGranted,
      stock: variant.stock,
      productId: variant.product.id,
      productName: variant.product.name,
      variantName: variant.name,
      attributes: variant.attributes,
    });
  }

  return { lines };
}

/**
 * A coupon a member may spend on the store, or a reason they may not.
 *
 * Store coupons reuse the one registry, so `appliesTo` is what keeps a
 * membership-only code from being spent on protein.
 */
type CouponResolution =
  | { ok: true; coupon: Awaited<ReturnType<typeof findCoupon>> }
  | ({ ok: false } & SaleError);

async function resolveStoreCoupon(
  tenantId: string,
  membershipId: string,
  code: string | undefined,
  subtotal: number,
): Promise<CouponResolution> {
  if (!code) return { ok: true, coupon: null };

  const record = await findCoupon(tenantId, code);
  if (!record) {
    return { ok: false, error: "That coupon code was not recognised.", status: 404 };
  }

  if (record.appliesTo === "SUBSCRIPTION") {
    return {
      ok: false,
      error: "That coupon can only be used on a membership plan.",
      status: 400,
    };
  }

  const problem = await couponService.checkEligibility(
    tenantId,
    record,
    membershipId,
    subtotal,
    null,
  );
  if (problem) return { ok: false, error: problem, status: 400 };

  return { ok: true, coupon: record };
}

export const storeSaleService = {
  /**
   * Sell a basket to a member at the counter.
   *
   * Completes immediately: the staff member has taken the money, so there is no
   * pending state to settle. Stock is claimed first, because a sale that cannot
   * be stocked must not leave a payment behind.
   */
  async sellAtCounter(tenantId: string, input: CounterSaleInput, sellerUserId: string) {
    // Who rang it up, for the collector column and the "who sold this" question
    // a gym eventually asks. Null when platform staff sell without a membership.
    const seller = await paymentRepository.findMembershipByUser(tenantId, sellerUserId);
    const sellerMembershipId = seller?.id ?? null;

    const resolved = await resolveLines(tenantId, input.items);
    if ("error" in resolved) return resolved;

    const problem = validateBasket(resolved.lines);
    if (problem) {
      if (problem.reason === "EMPTY") {
        return { error: "Add something to the basket first.", status: 400 as const };
      }
      if (problem.reason === "INSUFFICIENT_STOCK") {
        const line = resolved.lines.find((l) => l.variantId === problem.variantId);
        return {
          error: `Only ${problem.available} of ${line?.variantName ?? "that item"} left.`,
          status: 409 as const,
        };
      }
      return { error: "That quantity is not valid.", status: 400 as const };
    }

    const subtotal = resolved.lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );

    const couponResult = await resolveStoreCoupon(
      tenantId,
      input.membershipId,
      input.couponCode,
      subtotal,
    );
    if (!couponResult.ok) {
      return { error: couponResult.error, status: couponResult.status };
    }
    const coupon = couponResult.coupon;

    const coinsAvailable = await couponService.getCoinBalance(tenantId, input.membershipId);

    const priced = priceBasket({
      lines: resolved.lines,
      coupon: coupon
        ? {
            percentOff: coupon.percentOff,
            amountOff: coupon.amountOff,
            maxDiscount: coupon.maxDiscount,
            minAmount: coupon.minAmount,
          }
        : null,
      coinsAvailable,
      coinsRequested: input.coinsToSpend ?? 0,
    });

    // ─── Claim the stock ──────────────────────────────────────────────────────
    // Conditional per line. Anything already taken goes back if a later line
    // cannot be met, so a failed sale leaves the shelf as it found it.
    const claimed: { variantId: string; quantity: number }[] = [];
    for (const line of resolved.lines) {
      const took = await storeRepository.decrementStock(line.variantId, line.quantity);
      if (!took) {
        for (const done of claimed) {
          await storeRepository.restoreStock(done.variantId, done.quantity);
        }
        return {
          error: `${line.variantName} just sold out. Recount and try again.`,
          status: 409 as const,
        };
      }
      claimed.push({ variantId: line.variantId, quantity: line.quantity });
    }

    // ─── Money ────────────────────────────────────────────────────────────────
    // Written to the same ledger as memberships and charges, so store takings
    // appear in the finance report rather than beside it.
    const payment = await paymentRepository.createPayment({
      tenantId,
      membershipId: input.membershipId,
      description: "Gym store purchase",
      status: "COMPLETED",
      amount: priced.total,
      ...(sellerMembershipId ? { collectorId: sellerMembershipId } : {}),
      paidAt: new Date(),
      ...(input.note ? { note: input.note } : {}),
    });

    const order = await prisma.storeOrder.create({
      data: {
        tenantId,
        membershipId: input.membershipId,
        soldById: sellerMembershipId,
        status: "COMPLETED",
        channel: "COUNTER",
        subtotalAmount: priced.subtotal,
        discountAmount: priced.discount,
        coinsRedeemed: priced.coinsRedeemed,
        totalAmount: priced.total,
        coinsEarned: priced.coinsEarned,
        paymentId: payment.id,
        ...(input.note ? { note: input.note } : {}),
        items: {
          create: resolved.lines.map((line) => ({
            variantId: line.variantId,
            productName: line.productName,
            variantName: line.variantName,
            attributes: line.attributes as object,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.unitPrice * line.quantity,
          })),
        },
      },
      select: { id: true, totalAmount: true, coinsEarned: true, coinsRedeemed: true },
    });

    // ─── Coins ────────────────────────────────────────────────────────────────
    // Both directions in one write: what was spent, and what the purchase
    // earned. Written after the order so every entry names something real.
    const entries = [];
    if (priced.coinsRedeemed > 0) {
      entries.push({
        tenantId,
        membershipId: input.membershipId,
        amount: -priced.coinsRedeemed,
        reason: "REDEEMED",
        note: "Spent on a gym store purchase",
        paymentId: payment.id,
        createdById: sellerUserId,
      });
    }
    if (priced.coinsEarned > 0) {
      entries.push({
        tenantId,
        membershipId: input.membershipId,
        amount: priced.coinsEarned,
        reason: "STORE_PURCHASE",
        note: "Earned on a gym store purchase",
        paymentId: payment.id,
        createdById: sellerUserId,
      });
    }
    if (entries.length > 0) {
      await prisma.coinLedgerEntry.createMany({ data: entries });
    }

    return {
      data: {
        order,
        paymentId: payment.id,
        subtotal: priced.subtotal,
        discount: priced.discount,
        coinsRedeemed: priced.coinsRedeemed,
        total: priced.total,
        coinsEarned: priced.coinsEarned,
      },
    };
  },
};
