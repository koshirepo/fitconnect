/**
 * Documentation: Gym store pricing.
 *
 * - Works out what a basket costs: line totals, what a coupon takes off, how many coins may be spent against the rest, and what the buyer earns back.
 * - Pure and shared, so the storefront can show a total before checkout and the API can recompute the same number without either trusting the other. The API's figure is the one that is charged; this exists so the two cannot disagree about the arithmetic.
 * - Money is whole rupees throughout, matching every other amount in the schema. Rounding happens once, on the percentage discount, and rounds down so a gym never charges more than the shown price.
 * - Primary exports: priceBasket, type BasketLine, type PricedBasket.
 */

/** One line a buyer has chosen, priced from the variant it names. */
export type BasketLine = {
  variantId: string;
  /** Whole units. A line that asks for more than `stock` is rejected, not trimmed. */
  quantity: number;
  unitPrice: number;
  /** What this variant's product gives back, per unit bought. */
  coinsGrantedPerUnit: number;
  /** What the gym actually has. */
  stock: number;
};

/** The benefit a coupon confers on a store basket. */
export type StoreCoupon = {
  percentOff?: number | null;
  amountOff?: number | null;
  /** Ceiling on a percentage discount, in rupees. */
  maxDiscount?: number | null;
  /** Basket must reach this before the coupon applies. */
  minAmount?: number | null;
};

export type PricedBasket = {
  subtotal: number;
  discount: number;
  coinsRedeemed: number;
  /** What the buyer pays after both. Never below zero. */
  total: number;
  /** Coins the purchase earns, on the lines as bought. */
  coinsEarned: number;
};

export type BasketProblem =
  | { reason: "EMPTY" }
  | { reason: "INVALID_QUANTITY"; variantId: string }
  | { reason: "INSUFFICIENT_STOCK"; variantId: string; available: number };

/**
 * Check a basket before pricing it.
 *
 * Returns the first problem found, or null when every line is sound. Stock is
 * checked here as a courtesy to the caller; the authoritative check is the
 * conditional decrement at sale time, which is what makes two people buying the
 * last tub at once safe.
 */
export function validateBasket(lines: BasketLine[]): BasketProblem | null {
  if (lines.length === 0) return { reason: "EMPTY" };

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return { reason: "INVALID_QUANTITY", variantId: line.variantId };
    }
    if (line.quantity > line.stock) {
      return {
        reason: "INSUFFICIENT_STOCK",
        variantId: line.variantId,
        available: line.stock,
      };
    }
  }

  return null;
}

/**
 * Price a basket.
 *
 * Order matters and is deliberate: the coupon comes off the subtotal first,
 * then coins are spent against what is left. Doing it the other way round would
 * let a percentage coupon discount money the member had already paid in coins.
 *
 * `coinsAvailable` is the member's balance; `coinsRequested` is what they chose
 * to spend. Neither can take the bill below zero, and coins are worth one rupee
 * each — the same rate the subscription checkout uses.
 */
export function priceBasket(input: {
  lines: BasketLine[];
  coupon?: StoreCoupon | null;
  coinsAvailable?: number;
  coinsRequested?: number;
}): PricedBasket {
  const { lines, coupon, coinsAvailable = 0, coinsRequested = 0 } = input;

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const coinsEarned = lines.reduce(
    (sum, line) => sum + line.coinsGrantedPerUnit * line.quantity,
    0,
  );

  const discount = couponDiscount(subtotal, coupon);
  const afterDiscount = Math.max(subtotal - discount, 0);

  // Spend no more than the member holds, asked for, or still owes.
  const coinsRedeemed = Math.max(
    0,
    Math.min(coinsRequested, coinsAvailable, afterDiscount),
  );

  return {
    subtotal,
    discount,
    coinsRedeemed,
    total: afterDiscount - coinsRedeemed,
    coinsEarned,
  };
}

/** What a coupon takes off a subtotal, or zero when it does not apply. */
function couponDiscount(subtotal: number, coupon?: StoreCoupon | null): number {
  if (!coupon) return 0;
  if (coupon.minAmount != null && subtotal < coupon.minAmount) return 0;

  if (coupon.percentOff != null && coupon.percentOff > 0) {
    // Rounded down: a gym should never charge more than the price it showed.
    const raw = Math.floor((subtotal * coupon.percentOff) / 100);
    const capped = coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;
    return Math.min(capped, subtotal);
  }

  if (coupon.amountOff != null && coupon.amountOff > 0) {
    return Math.min(coupon.amountOff, subtotal);
  }

  return 0;
}
