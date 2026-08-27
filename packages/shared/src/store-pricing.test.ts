/**
 * Documentation: Tests for gym store pricing.
 *
 * - Covers the arithmetic a wrong answer costs a gym real money or real stock: what a coupon takes off, how many coins may be spent, what a purchase earns back, and which baskets are refused.
 * - Deliberately the first tests in this repo. They are here because the store is the only place where a rounding slip or an ordering mistake silently undercharges every sale.
 */
import { describe, expect, it } from "vitest";
import { priceBasket, validateBasket, type BasketLine } from "./store-pricing";

/** A line, with the boring fields filled in. */
function line(overrides: Partial<BasketLine> = {}): BasketLine {
  return {
    variantId: "var_1",
    quantity: 1,
    unitPrice: 1000,
    coinsGrantedPerUnit: 0,
    stock: 10,
    ...overrides,
  };
}

describe("validateBasket", () => {
  it("refuses an empty basket", () => {
    expect(validateBasket([])).toEqual({ reason: "EMPTY" });
  });

  it("refuses a line asking for more than the gym has", () => {
    expect(validateBasket([line({ quantity: 3, stock: 2 })])).toEqual({
      reason: "INSUFFICIENT_STOCK",
      variantId: "var_1",
      available: 2,
    });
  });

  it("allows a line that takes the last of the stock", () => {
    expect(validateBasket([line({ quantity: 2, stock: 2 })])).toBeNull();
  });

  it.each([0, -1, 1.5])("refuses a quantity of %s", (quantity) => {
    expect(validateBasket([line({ quantity })])).toEqual({
      reason: "INVALID_QUANTITY",
      variantId: "var_1",
    });
  });
});

describe("priceBasket", () => {
  it("totals the lines", () => {
    const priced = priceBasket({
      lines: [line({ unitPrice: 1500, quantity: 2 }), line({ variantId: "var_2", unitPrice: 200 })],
    });

    expect(priced.subtotal).toBe(3200);
    expect(priced.total).toBe(3200);
  });

  it("earns coins per unit, not per line", () => {
    const priced = priceBasket({
      lines: [line({ quantity: 3, coinsGrantedPerUnit: 50 })],
    });

    expect(priced.coinsEarned).toBe(150);
  });

  describe("coupons", () => {
    it("takes a flat amount off", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 1000 })],
        coupon: { amountOff: 250 },
      });

      expect(priced.discount).toBe(250);
      expect(priced.total).toBe(750);
    });

    it("rounds a percentage down, so the buyer is never charged more than shown", () => {
      // 10% of 1,995 is 199.5 — a gym charging 1,796 rather than 1,795 would be
      // charging above the displayed price.
      const priced = priceBasket({
        lines: [line({ unitPrice: 1995 })],
        coupon: { percentOff: 10 },
      });

      expect(priced.discount).toBe(199);
      expect(priced.total).toBe(1796);
    });

    it("honours a cap on a percentage discount", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 10_000 })],
        coupon: { percentOff: 50, maxDiscount: 1000 },
      });

      expect(priced.discount).toBe(1000);
    });

    it("does not apply below the minimum basket", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 400 })],
        coupon: { amountOff: 100, minAmount: 500 },
      });

      expect(priced.discount).toBe(0);
      expect(priced.total).toBe(400);
    });

    it("never discounts past free", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 300 })],
        coupon: { amountOff: 1000 },
      });

      expect(priced.discount).toBe(300);
      expect(priced.total).toBe(0);
    });
  });

  describe("coins", () => {
    it("spends no more than the member holds", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 1000 })],
        coinsAvailable: 200,
        coinsRequested: 500,
      });

      expect(priced.coinsRedeemed).toBe(200);
      expect(priced.total).toBe(800);
    });

    it("spends no more than the bill", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 300 })],
        coinsAvailable: 5000,
        coinsRequested: 5000,
      });

      expect(priced.coinsRedeemed).toBe(300);
      expect(priced.total).toBe(0);
    });

    it("applies the coupon before coins, so a percentage cannot discount coins", () => {
      // 50% off 1,000 leaves 500; 500 coins clear it. Spending coins first
      // would leave 500 and then halve it, letting the member pay 250 for a
      // 1,000 basket while surrendering the same coins.
      const priced = priceBasket({
        lines: [line({ unitPrice: 1000 })],
        coupon: { percentOff: 50 },
        coinsAvailable: 500,
        coinsRequested: 500,
      });

      expect(priced.discount).toBe(500);
      expect(priced.coinsRedeemed).toBe(500);
      expect(priced.total).toBe(0);
    });

    it("spends nothing when none were asked for", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 1000 })],
        coinsAvailable: 900,
      });

      expect(priced.coinsRedeemed).toBe(0);
      expect(priced.total).toBe(1000);
    });

    it("still earns coins on a basket paid entirely with coins", () => {
      const priced = priceBasket({
        lines: [line({ unitPrice: 500, coinsGrantedPerUnit: 25 })],
        coinsAvailable: 500,
        coinsRequested: 500,
      });

      expect(priced.total).toBe(0);
      expect(priced.coinsEarned).toBe(25);
    });
  });
});
