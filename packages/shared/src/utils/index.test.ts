/**
 * Documentation: Tests for the shared pure utilities.
 *
 * - Covers slug generation and validation, which decide a gym's public address, and the money and date formatting both apps render.
 * - The date helpers format in whatever zone the process is in, so these tests assert structure rather than an exact string: pinning "3 Sept 2026" would pass on a machine in IST and fail on a CI runner in UTC, which is a broken test rather than a caught bug.
 */
import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  getInitials,
  isValidSlug,
  toSlug,
} from "./index";

describe("formatCurrency", () => {
  it("renders rupees with no decimal places", () => {
    expect(formatCurrency(1000)).toBe("₹1,000");
  });

  it("renders zero", () => {
    expect(formatCurrency(0)).toBe("₹0");
  });

  /** Indian grouping is by lakh, not by thousand: 1,23,456 rather than 123,456. */
  it("groups large amounts the Indian way", () => {
    expect(formatCurrency(123456)).toBe("₹1,23,456");
  });

  it("renders a negative amount", () => {
    expect(formatCurrency(-500)).toContain("500");
    expect(formatCurrency(-500)).toMatch(/^-|^₹-/);
  });

  /**
   * `minimumFractionDigits: 0` sets only the floor; the maximum still defaults
   * to 2. So a whole amount renders clean but a fractional one keeps its paise,
   * and keeps them unpadded — "₹99.4", not "₹99.40". Recorded here as the
   * behaviour callers actually get rather than endorsed: every amount the app
   * passes in today is whole rupees, which is why nobody has hit it.
   */
  it("keeps paise on a fractional amount, unpadded", () => {
    expect(formatCurrency(99.4)).toBe("₹99.4");
    expect(formatCurrency(99.45)).toBe("₹99.45");
  });
});

describe("formatDate", () => {
  it("renders a date containing the day, month and year", () => {
    const formatted = formatDate("2026-09-03T12:00:00.000Z");
    expect(formatted).toMatch(/3/);
    expect(formatted).toMatch(/sep/i);
    expect(formatted).toMatch(/2026/);
  });

  it("accepts a Date as readily as a string", () => {
    expect(formatDate(new Date("2026-09-03T12:00:00.000Z"))).toBe(
      formatDate("2026-09-03T12:00:00.000Z"),
    );
  });
});

describe("formatDateTime", () => {
  it("renders the date and a time alongside it", () => {
    const formatted = formatDateTime("2026-09-03T12:00:00.000Z");
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it("says more than the date-only form does", () => {
    const stamp = "2026-09-03T12:00:00.000Z";
    expect(formatDateTime(stamp).length).toBeGreaterThan(formatDate(stamp).length);
  });
});

describe("getInitials", () => {
  it.each([
    ["Ravi Kumar", "RK"],
    ["Asha", "A"],
    ["ravi kumar", "RK"],
    ["Ravi Kumar Singh", "RK"],
  ])("turns %s into %s", (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });

  it("copes with an extra space between names", () => {
    expect(getInitials("Ravi  Kumar")).toBe("RK");
  });

  it("returns nothing for an empty name rather than throwing", () => {
    expect(getInitials("")).toBe("");
  });
});

describe("isValidSlug", () => {
  it.each(["rudra", "iron-house", "gym24", "a", "a-b-c"])("accepts %s", (slug) => {
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["a leading hyphen", "-rudra"],
    ["a trailing hyphen", "rudra-"],
    ["a double hyphen", "iron--house"],
    ["capitals", "Rudra"],
    ["a space", "iron house"],
    ["an underscore", "iron_house"],
    ["a dot", "iron.house"],
    ["a slash", "iron/house"],
  ])("rejects %s", (_label, slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});

describe("toSlug", () => {
  it.each([
    ["Iron House", "iron-house"],
    ["Rudra", "rudra"],
    ["Gold's Gym", "gold-s-gym"],
    ["  Leading and trailing  ", "leading-and-trailing"],
    ["Multiple   Spaces", "multiple-spaces"],
    ["Fit&Fine", "fit-fine"],
    ["24/7 Fitness", "24-7-fitness"],
  ])("turns %s into %s", (name, expected) => {
    expect(toSlug(name)).toBe(expected);
  });

  /** Whatever it produces has to be something isValidSlug will accept. */
  it.each([
    "Iron House",
    "Gold's Gym",
    "24/7 Fitness",
    "  Padded  ",
    "Fit&Fine",
    "UPPER CASE GYM",
  ])("produces a valid slug for %s", (name) => {
    expect(isValidSlug(toSlug(name))).toBe(true);
  });

  it("is idempotent", () => {
    const once = toSlug("Iron House");
    expect(toSlug(once)).toBe(once);
  });

  /**
   * A name with nothing slug-worthy in it produces an empty string, which
   * isValidSlug rejects — so a caller must not assume toSlug always yields a
   * usable slug.
   */
  it("produces an empty string when a name has nothing usable in it", () => {
    expect(toSlug("!!!")).toBe("");
    expect(isValidSlug(toSlug("!!!"))).toBe(false);
  });
});
