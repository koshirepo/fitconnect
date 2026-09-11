/**
 * Documentation: Tests for the joining terms.
 *
 * - The one rule that carries weight: clearing a gym's wording must fall back to the default, never to an empty consent. An empty consent would mean asking somebody to agree to nothing and recording that they did — a record that looks like consent and is not.
 * - The rest is rendering: paragraphs survive, whitespace a textarea collects does not.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONSENT_TEXT,
  consentParagraphs,
  normalizeConsentText,
  resolveConsentText,
} from "./consent";

describe("resolveConsentText", () => {
  it("uses the gym's own wording when it has some", () => {
    expect(resolveConsentText("Train at your own risk.")).toBe("Train at your own risk.");
  });

  /**
   * A gym clearing the box means "I no longer want my own wording", not "ask
   * joining members to agree to nothing". The latter would write a consent
   * record against an empty string.
   */
  it("falls back to the default rather than to nothing", () => {
    expect(resolveConsentText("")).toBe(DEFAULT_CONSENT_TEXT);
    expect(resolveConsentText("   \n\n  ")).toBe(DEFAULT_CONSENT_TEXT);
    expect(resolveConsentText(null)).toBe(DEFAULT_CONSENT_TEXT);
    expect(resolveConsentText(undefined)).toBe(DEFAULT_CONSENT_TEXT);
  });

  it("trims what a textarea leaves behind", () => {
    expect(resolveConsentText("  Be careful.  ")).toBe("Be careful.");
  });
});

describe("normalizeConsentText", () => {
  it("collapses the run of blank lines a textarea collects", () => {
    expect(normalizeConsentText("One.\n\n\n\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("reads Windows line endings as line endings", () => {
    expect(normalizeConsentText("One.\r\n\r\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("keeps a single break inside a paragraph", () => {
    expect(normalizeConsentText("One.\nStill one.")).toBe("One.\nStill one.");
  });
});

describe("consentParagraphs", () => {
  it("splits on blank lines, which is how the gym wrote it", () => {
    expect(consentParagraphs("First.\n\nSecond.\n\nThird.")).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
  });

  it("drops empty paragraphs rather than rendering blank rows", () => {
    expect(consentParagraphs("First.\n\n\n\nSecond.")).toEqual(["First.", "Second."]);
  });

  it("has something to render for the default wording", () => {
    expect(consentParagraphs(DEFAULT_CONSENT_TEXT).length).toBeGreaterThan(1);
  });

  it("returns nothing for nothing, so the notice can hide itself", () => {
    expect(consentParagraphs("   ")).toEqual([]);
  });
});
