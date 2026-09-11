/**
 * Documentation: Tests for what a variant is called.
 *
 * - The name is no longer typed, so this function is the only thing standing between a seller's attributes and the label a buyer reads on the shelf, in their cart, and on their order. It runs on both sides — the API stores its output, the form previews it — so a disagreement here is a label that changes between the two.
 * - The separator is asserted explicitly. It was chosen to match names the catalogue already had, so that deriving a name for an existing variant reproduces it rather than renaming it.
 */
import { describe, expect, it } from "vitest";
import {
  VARIANT_NAME_SEPARATOR,
  deriveVariantName,
  hasUsableAttributes,
} from "./variant-name";

describe("deriveVariantName", () => {
  it("joins the values, not the keys", () => {
    expect(deriveVariantName({ flavour: "Chocolate", size: "1kg" })).toBe("Chocolate · 1kg");
  });

  /**
   * Insertion order is the seller's order. Alphabetising would turn
   * "Chocolate · 1kg" into "1kg · Chocolate" the moment somebody named their
   * attribute "weight" instead of "size".
   */
  it("keeps the order the seller entered", () => {
    expect(deriveVariantName({ size: "1kg", flavour: "Chocolate" })).toBe("1kg · Chocolate");
  });

  it("reads a single attribute as the whole name", () => {
    expect(deriveVariantName({ variant: "Standard" })).toBe("Standard");
  });

  it("uses the separator the catalogue already wrote by hand", () => {
    expect(VARIANT_NAME_SEPARATOR).toBe(" · ");
  });

  it("trims what a text input leaves behind", () => {
    expect(deriveVariantName({ flavour: "  Vanilla  ", size: " 2kg " })).toBe("Vanilla · 2kg");
  });

  /**
   * A half-typed row — a key with no value yet — must not leave a dangling
   * separator in the live preview while somebody is still typing.
   */
  it("skips attributes with no value", () => {
    expect(deriveVariantName({ flavour: "Mango", size: "" })).toBe("Mango");
    expect(deriveVariantName({ flavour: "Mango", size: "   " })).toBe("Mango");
  });

  it("is empty for nothing at all", () => {
    expect(deriveVariantName({})).toBe("");
    expect(deriveVariantName(null)).toBe("");
    expect(deriveVariantName(undefined)).toBe("");
  });
});

describe("hasUsableAttributes", () => {
  it("accepts attributes that can name a variant", () => {
    expect(hasUsableAttributes({ flavour: "Chocolate" })).toBe(true);
  });

  /**
   * This is the check that replaced "did they type a name". A variant it lets
   * through with nothing usable is a variant a buyer cannot tell from its
   * siblings in a picker.
   */
  it.each([
    ["nothing", {}],
    ["null", null],
    ["a key with no value", { size: "" }],
    ["only whitespace", { size: "  " }],
  ])("refuses %s", (_label, attributes) => {
    expect(hasUsableAttributes(attributes)).toBe(false);
  });
});
