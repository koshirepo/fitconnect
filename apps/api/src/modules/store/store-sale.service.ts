/**
 * Documentation: Gym store sales.
 *
 * - Takes money for a basket, whether the till or a card takes it: prices it, claims the stock, writes the ledger row, spends and grants coins, and records the order.
 * - Both channels share `priceForSale`, `claimStock`, `createOrderRecord`, and `writeCoinEntries`, so a counter sale and an online one can never charge or credit differently for the same basket.
 * - Stock is claimed before anything is charged, and each claim is a conditional decrement rather than a read followed by a write. Two people buying the last tub at once cannot both succeed, and a basket that fails halfway puts back what it already took.
 * - Pricing is recomputed here from the database, never taken from the request. A client that could name its own total could buy a ₹5,000 tub for a rupee — the rule the subscription checkout already follows.
 * - Primary exports: storeSaleService, storeCheckoutService.
 */
import { priceBasket, validateBasket, type BasketLine } from "@fitconnect/shared/store-pricing";
import { prisma } from "../../lib/prisma";
import { createOrder, verifyCheckoutSignature } from "../../lib/razorpay";
import { storeRepository } from "./store.repository";
import { couponService, findCoupon } from "../coupons/coupons.service";
import { gatewayService } from "../payments/gateway.service";
import { paymentRepository } from "../payments/payments.repository";
import type {
  CounterSaleInput,
  StoreCheckoutInput,
  StoreCheckoutVerifyInput,
} from "./store.schema";

type SaleError = { error: string; status: 400 | 404 | 409 };

/** A line as the caller asked for it, joined to what the gym actually sells. */
type ResolvedLine = BasketLine & {
  productId: string;
  productName: string;
  variantName: string;
  attributes: unknown;
};

type PricedSale = {
  lines: ResolvedLine[];
  priced: ReturnType<typeof priceBasket>;
};

// ─── Resolution and pricing ───────────────────────────────────────────────────

/**
 * Join the requested basket to the catalogue.
 *
 * Every price, coin grant, and stock figure comes from the database; the request
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
      return { error: "One of those items is no longer on sale.", status: 404 };
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

type CouponResolution =
  | { ok: true; coupon: Awaited<ReturnType<typeof findCoupon>> }
  | ({ ok: false } & SaleError);

/**
 * A coupon a member may spend on the store, or a reason they may not.
 *
 * Store coupons live in the one registry, so `appliesTo` is what keeps a
 * membership-only code from being spent on protein. Every other condition —
 * windows, caps, per-member limits, badges, gender — comes from the coupon
 * module's own eligibility check rather than a second implementation.
 */
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

/** Resolve, validate, and price a basket. The shared front half of any sale. */
async function priceForSale(
  tenantId: string,
  membershipId: string,
  input: {
    items: { variantId: string; quantity: number }[];
    couponCode?: string;
    coinsToSpend?: number;
  },
): Promise<PricedSale | SaleError> {
  const resolved = await resolveLines(tenantId, input.items);
  if ("error" in resolved) return resolved;

  const problem = validateBasket(resolved.lines);
  if (problem) {
    if (problem.reason === "EMPTY") {
      return { error: "Add something to the basket first.", status: 400 };
    }
    if (problem.reason === "INSUFFICIENT_STOCK") {
      const line = resolved.lines.find((l) => l.variantId === problem.variantId);
      return {
        error: `Only ${problem.available} of ${line?.variantName ?? "that item"} left.`,
        status: 409,
      };
    }
    return { error: "That quantity is not valid.", status: 400 };
  }

  const subtotal = resolved.lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  const couponResult = await resolveStoreCoupon(
    tenantId,
    membershipId,
    input.couponCode,
    subtotal,
  );
  if (!couponResult.ok) {
    return { error: couponResult.error, status: couponResult.status };
  }

  const coupon = couponResult.coupon;
  const coinsAvailable = await couponService.getCoinBalance(tenantId, membershipId);

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

  return { lines: resolved.lines, priced };
}

// ─── Stock ────────────────────────────────────────────────────────────────────

/**
 * Take every line's stock, or none of it.
 *
 * Each decrement is conditional on the stock still being there, so two sales of
 * the last tub cannot both succeed. Anything already taken is put back when a
 * later line cannot be met.
 */
async function claimStock(
  lines: { variantId: string; quantity: number; variantName?: string }[],
): Promise<{ claimed: { variantId: string; quantity: number }[] } | SaleError> {
  const claimed: { variantId: string; quantity: number }[] = [];

  for (const line of lines) {
    const took = await storeRepository.decrementStock(line.variantId, line.quantity);
    if (!took) {
      await releaseStock(claimed);
      return {
        error: `${line.variantName ?? "That item"} just sold out. Recount and try again.`,
        status: 409,
      };
    }
    claimed.push({ variantId: line.variantId, quantity: line.quantity });
  }

  return { claimed };
}

/** Put stock back, for a failed claim or an abandoned checkout. */
async function releaseStock(lines: { variantId: string; quantity: number }[]) {
  for (const line of lines) {
    await storeRepository.restoreStock(line.variantId, line.quantity);
  }
}

// ─── Writes ───────────────────────────────────────────────────────────────────

/** Record the order and its lines, with the names and attributes frozen. */
function createOrderRecord(input: {
  tenantId: string;
  membershipId: string;
  sellerMembershipId: string | null;
  channel: "COUNTER" | "ONLINE";
  status: "PENDING" | "COMPLETED";
  priced: PricedSale;
  paymentId: string;
  note?: string;
}) {
  const { priced } = input.priced;

  return prisma.storeOrder.create({
    data: {
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      soldById: input.sellerMembershipId,
      status: input.status,
      channel: input.channel,
      subtotalAmount: priced.subtotal,
      discountAmount: priced.discount,
      coinsRedeemed: priced.coinsRedeemed,
      totalAmount: priced.total,
      coinsEarned: priced.coinsEarned,
      paymentId: input.paymentId,
      ...(input.note ? { note: input.note } : {}),
      items: {
        create: input.priced.lines.map((line) => ({
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
}

/**
 * The coins a completed sale moves: what was spent, and what it earned.
 *
 * Shared by both channels so the same basket can never credit a member
 * differently depending on how they paid.
 */
async function writeCoinEntries(input: {
  tenantId: string;
  membershipId: string;
  paymentId: string;
  coinsRedeemed: number;
  coinsEarned: number;
  createdById?: string;
}) {
  const entries = [];

  if (input.coinsRedeemed > 0) {
    entries.push({
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      amount: -input.coinsRedeemed,
      reason: "REDEEMED",
      note: "Spent on a gym store purchase",
      paymentId: input.paymentId,
      ...(input.createdById ? { createdById: input.createdById } : {}),
    });
  }

  if (input.coinsEarned > 0) {
    entries.push({
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      amount: input.coinsEarned,
      reason: "STORE_PURCHASE",
      note: "Earned on a gym store purchase",
      paymentId: input.paymentId,
      ...(input.createdById ? { createdById: input.createdById } : {}),
    });
  }

  if (entries.length > 0) {
    await prisma.coinLedgerEntry.createMany({ data: entries });
  }
}

/** Everything a finished sale hands back, whichever channel took the money. */
function saleResult(order: { id: string }, priced: PricedSale, paymentId: string) {
  return {
    order,
    paymentId,
    subtotal: priced.priced.subtotal,
    discount: priced.priced.discount,
    coinsRedeemed: priced.priced.coinsRedeemed,
    total: priced.priced.total,
    coinsEarned: priced.priced.coinsEarned,
  };
}

// ─── Counter ──────────────────────────────────────────────────────────────────

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

    const priced = await priceForSale(tenantId, input.membershipId, input);
    if ("error" in priced) return priced;

    const claim = await claimStock(priced.lines);
    if ("error" in claim) return claim;

    const payment = await paymentRepository.createPayment({
      tenantId,
      membershipId: input.membershipId,
      description: "Gym store purchase",
      status: "COMPLETED",
      amount: priced.priced.total,
      ...(sellerMembershipId ? { collectorId: sellerMembershipId } : {}),
      paidAt: new Date(),
      ...(input.note ? { note: input.note } : {}),
    });

    const order = await createOrderRecord({
      tenantId,
      membershipId: input.membershipId,
      sellerMembershipId,
      channel: "COUNTER",
      status: "COMPLETED",
      priced,
      paymentId: payment.id,
      note: input.note,
    });

    await writeCoinEntries({
      tenantId,
      membershipId: input.membershipId,
      paymentId: payment.id,
      coinsRedeemed: priced.priced.coinsRedeemed,
      coinsEarned: priced.priced.coinsEarned,
      createdById: sellerUserId,
    });

    return { data: saleResult(order, priced, payment.id) };
  },
};

// ─── Online ───────────────────────────────────────────────────────────────────

export const storeCheckoutService = {
  /**
   * Open an online purchase.
   *
   * Stock is claimed now rather than at settlement, so the tub is the buyer's
   * while they are typing their card number. The cost is that an abandoned
   * checkout holds stock until `cancel` releases it.
   */
  async start(
    tenantId: string,
    membershipId: string,
    input: StoreCheckoutInput,
    userId: string,
  ) {
    const priced = await priceForSale(tenantId, membershipId, input);
    if ("error" in priced) return priced;

    // Coins and a coupon can legitimately clear a bill. There is nothing to
    // send a gateway, so the sale simply completes.
    if (priced.priced.total === 0) {
      const claim = await claimStock(priced.lines);
      if ("error" in claim) return claim;

      const payment = await paymentRepository.createPayment({
        tenantId,
        membershipId,
        description: "Gym store purchase",
        status: "COMPLETED",
        amount: 0,
        paidAt: new Date(),
      });

      const order = await createOrderRecord({
        tenantId,
        membershipId,
        sellerMembershipId: null,
        channel: "ONLINE",
        status: "COMPLETED",
        priced,
        paymentId: payment.id,
        note: input.note,
      });

      await writeCoinEntries({
        tenantId,
        membershipId,
        paymentId: payment.id,
        coinsRedeemed: priced.priced.coinsRedeemed,
        coinsEarned: priced.priced.coinsEarned,
        createdById: userId,
      });

      return { data: { ...saleResult(order, priced, payment.id), checkout: null } };
    }

    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials) {
      return { error: "This gym has not set up online payments yet.", status: 409 as const };
    }

    const claim = await claimStock(priced.lines);
    if ("error" in claim) return claim;

    try {
      const payment = await paymentRepository.createPayment({
        tenantId,
        membershipId,
        description: "Gym store purchase",
        status: "PENDING",
        amount: priced.priced.total,
        gateway: "RAZORPAY",
        gatewayAccount: credentials.source,
      });

      const gatewayOrder = await createOrder(credentials, {
        amount: priced.priced.total,
        receipt: payment.id,
        notes: { tenantId, membershipId, kind: "store" },
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: { gatewayOrderId: gatewayOrder.id },
      });

      const order = await createOrderRecord({
        tenantId,
        membershipId,
        sellerMembershipId: null,
        channel: "ONLINE",
        status: "PENDING",
        priced,
        paymentId: payment.id,
        note: input.note,
      });

      return {
        data: {
          ...saleResult(order, priced, payment.id),
          checkout: {
            orderId: gatewayOrder.id,
            keyId: credentials.keyId,
            amount: priced.priced.total,
            currency: "INR",
          },
        },
      };
    } catch (error) {
      // The gateway refused, or a write failed. Either way nothing was sold, so
      // the stock goes back rather than sitting reserved for nobody.
      await releaseStock(claim.claimed);
      throw error;
    }
  },

  /**
   * Settle an online purchase against what Razorpay signed.
   *
   * Idempotent by a conditional status update: a browser returning at the same
   * moment as the webhook must not credit the coins twice.
   */
  async verify(tenantId: string, membershipId: string, input: StoreCheckoutVerifyInput) {
    const credentials = await gatewayService.resolveCredentials(tenantId);
    if (!credentials) {
      return { error: "This gym has not set up online payments yet.", status: 409 as const };
    }

    const valid = await verifyCheckoutSignature(credentials.keySecret, input);
    if (!valid) return { error: "That payment could not be verified.", status: 400 as const };

    const payment = await prisma.payment.findFirst({
      where: { tenantId, membershipId, gatewayOrderId: input.orderId },
      select: { id: true },
    });
    if (!payment) return { error: "That order was not found.", status: 404 as const };

    const order = await prisma.storeOrder.findFirst({
      where: { tenantId, paymentId: payment.id },
      select: { id: true, status: true, coinsRedeemed: true, coinsEarned: true },
    });
    if (!order) return { error: "That order was not found.", status: 404 as const };

    const claimed = await prisma.storeOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "COMPLETED" },
    });
    if (claimed.count === 0) {
      return { data: { orderId: order.id, alreadySettled: true } };
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "COMPLETED",
        paidAt: new Date(),
        gatewayPaymentId: input.paymentId,
      },
    });

    await writeCoinEntries({
      tenantId,
      membershipId,
      paymentId: payment.id,
      coinsRedeemed: order.coinsRedeemed,
      coinsEarned: order.coinsEarned,
    });

    return { data: { orderId: order.id, alreadySettled: false } };
  },

  /**
   * Give up on an online purchase and put the stock back.
   *
   * Only ever touches an order that is still pending, so a settled sale cannot
   * be unwound this way.
   */
  async cancel(tenantId: string, membershipId: string, orderId: string) {
    const order = await prisma.storeOrder.findFirst({
      where: { id: orderId, tenantId, membershipId, status: "PENDING" },
      select: {
        id: true,
        paymentId: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });
    if (!order) return { error: "That order was not found.", status: 404 as const };

    const released = await prisma.storeOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "CANCELLED" },
    });
    if (released.count === 0) {
      return { data: { orderId: order.id, cancelled: false } };
    }

    await releaseStock(order.items);

    if (order.paymentId) {
      await prisma.payment.update({
        where: { id: order.paymentId },
        data: { status: "FAILED" },
      });
    }

    return { data: { orderId: order.id, cancelled: true } };
  },
};

// ─── Guests ───────────────────────────────────────────────────────────────────

/**
 * Buying without joining.
 *
 * A visitor on the public storefront has no membership, so none of the things
 * that hang off one apply: no coupon, no coins earned, no coins spent. What is
 * left is a basket, a name, and a phone number.
 *
 * The store is collection-only, so a guest order is a reservation the desk
 * fulfils. It is written with channel `PICKUP` and, deliberately, claims no
 * stock: nothing has been paid, and holding the last tub for somebody who may
 * never arrive costs a sale to somebody standing at the counter. Stock moves
 * when a coach or an admin completes the order, which is also when the money
 * is taken.
 *
 * Guest sales write no `Payment` row — relaxing `Payment.membershipId` would
 * mean rebuilding a table four others reference and making `payment.member`
 * optional across the API — so their revenue reaches finance from `StoreOrder`.
 */
export const storeGuestService = {
  /** Price a guest basket. No coupon and no coins: both belong to a member. */
  async quote(tenantId: string, items: { variantId: string; quantity: number }[]) {
    const resolved = await resolveLines(tenantId, items);
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

    const priced = priceBasket({
      lines: resolved.lines,
      coupon: null,
      coinsAvailable: 0,
      coinsRequested: 0,
    });

    return { lines: resolved.lines, priced };
  },

  /**
   * Reserve a basket for collection.
   *
   * Prices from the database, never from the request — the rule every other
   * sale in this file follows, and the reason a visitor cannot name their own
   * total.
   */
  async place(
    tenantId: string,
    input: {
      items: { variantId: string; quantity: number }[];
      buyerName?: string;
      buyerPhone?: string;
      buyerEmail?: string;
      note?: string;
    },
    /**
     * Set when a member chose to pay at the counter rather than online.
     *
     * The same reservation either way — nothing charged, no stock moved until
     * handover — but attached to the membership, so it reaches their order
     * history and the desk knows who is coming for it without being told a
     * name and a phone number they already hold.
     */
    membershipId: string | null = null,
  ) {
    const priced = await storeGuestService.quote(tenantId, input.items);
    if ("error" in priced) return priced;

    const order = await prisma.storeOrder.create({
      data: {
        tenantId,
        membershipId,
        soldById: null,
        // Contact details belong to a guest order only: a member is already
        // reachable through their own record, and a stale copy here would be
        // one more place for a changed phone number to be wrong.
        ...(membershipId
          ? {}
          : {
              buyerName: input.buyerName ?? null,
              buyerPhone: input.buyerPhone ?? null,
              ...(input.buyerEmail ? { buyerEmail: input.buyerEmail } : {}),
            }),
        status: "PENDING",
        channel: "PICKUP",
        subtotalAmount: priced.priced.subtotal,
        discountAmount: 0,
        coinsRedeemed: 0,
        totalAmount: priced.priced.total,
        // What the basket is worth in coins, frozen now so editing a product
        // later cannot rewrite what the buyer was promised. The ledger entry
        // itself waits until the money is actually taken.
        coinsEarned: priced.priced.coinsEarned,
        ...(input.note ? { note: input.note } : {}),
        items: {
          create: priced.lines.map((line) => ({
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
      select: { id: true, createdAt: true },
    });

    return {
      data: {
        orderId: order.id,
        total: priced.priced.total,
        subtotal: priced.priced.subtotal,
        placedAt: order.createdAt,
        // The desk needs something the buyer can quote when they arrive, and an
        // order id is not something anybody reads down a phone.
        reference: order.id.slice(-6).toUpperCase(),
      },
    };
  },

  /**
   * Hand a reserved order over: take the money at the counter, move the stock.
   *
   * Stock is claimed here rather than at reservation, so a no-show costs the
   * gym nothing. It can therefore fail at this point — somebody else bought the
   * last tub in the meantime — and the order stays pending rather than
   * completing against stock that is not there.
   */
  async complete(tenantId: string, orderId: string, sellerMembershipId: string | null) {
    const order = await prisma.storeOrder.findFirst({
      where: { id: orderId, tenantId, status: "PENDING", channel: "PICKUP" },
      select: {
        id: true,
        membershipId: true,
        totalAmount: true,
        coinsEarned: true,
        items: { select: { variantId: true, quantity: true, variantName: true } },
      },
    });
    if (!order) {
      return { error: "That reservation was not found, or is already closed.", status: 404 as const };
    }

    const claim = await claimStock(order.items);
    if ("error" in claim) return claim;

    // Conditional on still being pending: two staff pressing Complete at once
    // must not both move stock.
    const completed = await prisma.storeOrder.updateMany({
      where: { id: order.id, status: "PENDING" },
      data: { status: "COMPLETED", soldById: sellerMembershipId },
    });

    if (completed.count === 0) {
      await releaseStock(claim.claimed);
      return { data: { orderId: order.id, completed: false } };
    }

    // A member order can carry a payment row, so it does: that is how store
    // revenue reaches the finance page through the same ledger as memberships
    // and charges. A guest has no membership to hang one off, and their
    // revenue is read from the order itself.
    if (order.membershipId) {
      const payment = await paymentRepository.createPayment({
        tenantId,
        membershipId: order.membershipId,
        description: "Gym store purchase",
        status: "COMPLETED",
        amount: order.totalAmount,
        paidAt: new Date(),
      });

      await prisma.storeOrder.update({
        where: { id: order.id },
        data: { paymentId: payment.id },
      });

      // Coins are granted now rather than at reservation: an order nobody
      // collected should reward nobody.
      await writeCoinEntries({
        tenantId,
        membershipId: order.membershipId,
        paymentId: payment.id,
        coinsRedeemed: 0,
        coinsEarned: order.coinsEarned,
        ...(sellerMembershipId ? { createdById: sellerMembershipId } : {}),
      });
    }

    return { data: { orderId: order.id, completed: true } };
  },

  /**
   * Sell to somebody at the counter who is not a member.
   *
   * A walk-in buying a shaker should not have to join the gym first. Same act
   * as the member counter sale — stock moves and the money is in the till, so
   * the order is complete the moment it is written — minus the two things that
   * need a membership: no coupon, no coins, and no payment row, so this
   * revenue is read from the order itself.
   *
   * The name and phone are kept because a gym asked to take something back
   * needs to know who it sold it to.
   */
  async sellAtCounter(
    tenantId: string,
    input: {
      items: { variantId: string; quantity: number }[];
      buyerName: string;
      buyerPhone: string;
      buyerEmail?: string;
      note?: string;
    },
    sellerMembershipId: string | null,
  ) {
    const priced = await storeGuestService.quote(tenantId, input.items);
    if ("error" in priced) return priced;

    const claim = await claimStock(priced.lines);
    if ("error" in claim) return claim;

    try {
      const order = await prisma.storeOrder.create({
        data: {
          tenantId,
          membershipId: null,
          soldById: sellerMembershipId,
          buyerName: input.buyerName,
          buyerPhone: input.buyerPhone,
          ...(input.buyerEmail ? { buyerEmail: input.buyerEmail } : {}),
          status: "COMPLETED",
          channel: "COUNTER",
          subtotalAmount: priced.priced.subtotal,
          discountAmount: 0,
          coinsRedeemed: 0,
          totalAmount: priced.priced.total,
          // Coins need a membership to land in. Nothing is promised here, so
          // nothing is recorded as owed.
          coinsEarned: 0,
          ...(input.note ? { note: input.note } : {}),
          items: {
            create: priced.lines.map((line) => ({
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
        select: { id: true },
      });

      return {
        data: {
          orderId: order.id,
          reference: order.id.slice(-6).toUpperCase(),
          subtotal: priced.priced.subtotal,
          total: priced.priced.total,
        },
      };
    } catch (error) {
      // Nothing was sold, so the stock goes back rather than sitting claimed
      // against an order that does not exist.
      await releaseStock(claim.claimed);
      throw error;
    }
  },

  /**
   * The queue the desk works from: what has been reserved and not yet handed
   * over, newest first, with the buyer named whichever way they are known.
   */
  async listOrders(
    tenantId: string,
    filters: { status?: string; channel?: string } = {},
  ) {
    const orders = await prisma.storeOrder.findMany({
      where: {
        tenantId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        status: true,
        channel: true,
        subtotalAmount: true,
        discountAmount: true,
        coinsRedeemed: true,
        totalAmount: true,
        coinsEarned: true,
        buyerName: true,
        buyerPhone: true,
        note: true,
        createdAt: true,
        paymentId: true,
        member: {
          select: {
            id: true,
            memberId: true,
            user: { select: { name: true, phone: true } },
          },
        },
        soldBy: { select: { user: { select: { name: true } } } },
        items: {
          select: {
            productName: true,
            variantName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
      },
    });

    return { data: { orders } };
  },

  /**
   * Drop a reservation.
   *
   * Nothing is released, because a reservation never took stock in the first
   * place. That asymmetry with the member checkout's `cancel` is deliberate and
   * is the whole reason reservations are safe to leave lying around.
   */
  async cancel(tenantId: string, orderId: string) {
    const cancelled = await prisma.storeOrder.updateMany({
      where: { id: orderId, tenantId, status: "PENDING", channel: "PICKUP" },
      data: { status: "CANCELLED" },
    });

    if (cancelled.count === 0) {
      return { error: "That reservation was not found, or is already closed.", status: 404 as const };
    }

    return { data: { orderId, cancelled: true } };
  },

  /** What the buyer sees when they come back to check on it. */
  async lookup(tenantId: string, orderId: string, buyerPhone: string) {
    const order = await prisma.storeOrder.findFirst({
      where: { id: orderId, tenantId, buyerPhone },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
        buyerName: true,
        items: {
          select: { productName: true, variantName: true, quantity: true, lineTotal: true },
        },
      },
    });
    if (!order) return { error: "No order matches that reference and phone number.", status: 404 as const };

    return { data: { order } };
  },
};
