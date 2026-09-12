/**
 * Documentation: That a part payment buys its share of a term, and that the shares add up.
 *
 * - The invariant is the point: however many instalments a period is paid in, the days they buy together must come to exactly one period and never more. A gym that hands out 45 days for a 30-day plan is losing a fortnight per member and has nothing on screen to say so.
 * - The rounding direction is deliberate and tested. Flooring is always in the gym's favour; a half-day is not a day, and a payment too small to buy one buys none.
 * - Written against whole rupees and whole days, which is what the ledger and the terms are actually denominated in.
 */
import { describe, expect, it } from "vitest";
import { proratedDays } from "./prorata";

describe("proratedDays", () => {
  it("gives the whole period when the payment covers the price", () => {
    expect(proratedDays(30, 600, 600)).toBe(30);
  });

  it("gives the whole period when the payment exceeds the price", () => {
    expect(proratedDays(30, 900, 600)).toBe(30);
  });

  it("gives half the period for half the money", () => {
    expect(proratedDays(30, 300, 600)).toBe(15);
  });

  /**
   * The invariant the balance row depends on.
   *
   * Settling a term in two goes has to buy one period between them. Before the
   * desk stopped sending its own end date this failed in production terms: the
   * first row was written with the plan's full length and the balance then
   * added its share on top, so ₹600 in two halves bought 45 days.
   */
  it("has the shares of a split payment add back to exactly one period", () => {
    const first = proratedDays(30, 300, 600);
    const balance = proratedDays(30, 300, 600);

    expect(first + balance).toBe(30);
  });

  it("has uneven shares add to no more than one period", () => {
    // ₹450 then ₹150 against ₹600: 22 days and 7, which is 29 — a day lost to
    // flooring, and lost in the gym's favour rather than the member's.
    expect(proratedDays(30, 450, 600) + proratedDays(30, 150, 600)).toBeLessThanOrEqual(30);
  });

  it("floors rather than rounding up, so no day is given away", () => {
    // 30 × 599 / 600 is 29.95 days.
    expect(proratedDays(30, 599, 600)).toBe(29);
  });

  it("buys no days at all when the money cannot cover one", () => {
    // 30 × 10 / 600 is half a day.
    expect(proratedDays(30, 10, 600)).toBe(0);
  });

  // Every row written before pro-rata existed carries no basis.
  it("treats a row with no basis as paid in full", () => {
    expect(proratedDays(30, 300, null)).toBe(30);
    expect(proratedDays(30, 300, 0)).toBe(30);
  });

  it("never returns a negative period", () => {
    expect(proratedDays(30, -100, 600)).toBe(0);
  });

  it("grants nothing for a plan that runs no days, whatever was paid", () => {
    // An admission fee: money, but not time.
    expect(proratedDays(0, 200, 200)).toBe(0);
  });
});
