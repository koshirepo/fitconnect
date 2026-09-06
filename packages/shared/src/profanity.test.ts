/**
 * Documentation: What the bad-word filter must and must not catch.
 *
 * - The false-positive cases matter more than the true positives. A filter that misses one insult is a filter with a gap; a filter that rejects "assessment" is one somebody has to work around, and the first person it lands on is writing in good faith.
 * - Every entry in the allow list has a test here, so removing one from `ALLOW` fails loudly rather than quietly rejecting a real word.
 */
import { describe, expect, it } from "vitest";
import { containsProfanity, findProfanity } from "./profanity";

describe("containsProfanity", () => {
  describe("catches", () => {
    it.each([
      ["a plain English word", "what a shit product"],
      ["a strong word inside another", "this guy is a dumbass"],
      ["Hinglish", "bhosdike mat bech ye"],
      ["Hinglish inside another word", "chutiyapa hai ye"],
      ["leetspeak", "sh1t quality"],
      ["stretched vowels", "fuuuuck this"],
      ["punctuation between letters", "f.u.c.k this thing"],
      ["hyphens between letters", "f-u-c-k off"],
      ["letters spelled out", "you are f u c k ing useless"],
      ["mixed case", "WhAt A ShIt product"],
      ["accented letters", "shít product"],
    ])("%s", (_label, text) => {
      expect(containsProfanity(text)).toBe(true);
    });
  });

  describe("does not catch", () => {
    it.each([
      ["assessment", "the trainer did a full assessment"],
      ["analysis", "monthly revenue analysis"],
      ["analytics", "the coin analytics page"],
      ["class", "the 6am class was full"],
      ["classes", "we run three classes a day"],
      ["pass", "my gym pass expired"],
      ["password", "reset my password"],
      ["grass", "the turf is artificial grass"],
      ["mass", "lean muscle mass"],
      ["massage", "sports massage on Tuesdays"],
      ["bass", "the bass is too loud"],
      ["glass", "the water glass by the rack"],
      ["brass", "brass plates on the dumbbells"],
      ["compass", "a compass on the treadmill display"],
      ["harass", "do not harass the staff"],
      ["asset", "the gym's biggest asset"],
      ["assets", "fixed assets on the balance sheet"],
      ["assign", "assign this plan to a member"],
      ["assignment", "the coach's assignment"],
      ["assist", "spotter assist on the last rep"],
      ["assistant", "assistant trainer"],
      ["associate", "associate membership"],
      ["association", "the gym owners association"],
      ["assume", "do not assume the weight is loaded"],
      ["assumption", "that assumption was wrong"],
      ["assure", "I assure you it is clean"],
      ["cocktail", "protein cocktail"],
      ["cockpit", "the rowing machine cockpit"],
      ["shiitake", "shiitake mushroom supplement"],
      ["titanium", "titanium water bottle"],
      ["Scunthorpe", "shipping to Scunthorpe"],
      ["Sussex", "our Sussex branch"],
      ["ordinary praise", "great product, fast delivery, will buy again"],
      ["empty text", ""],
    ])("%s", (_label, text) => {
      expect(containsProfanity(text)).toBe(false);
    });

    /**
     * The join that catches `f u c k` must never run on ordinary prose.
     * Stitched together, this sentence contains "bitch"; gating the join on a
     * run of single letters is what keeps it from ever being looked at.
     */
    it("does not invent words by joining an ordinary sentence", () => {
      expect(containsProfanity("I ate a bit chocolate after the workout")).toBe(false);
      expect(containsProfanity("that is a bit chilly")).toBe(false);
    });
  });

  it("handles null and undefined", () => {
    expect(containsProfanity(null)).toBe(false);
    expect(containsProfanity(undefined)).toBe(false);
  });
});

describe("findProfanity", () => {
  it("reports what matched, normalised and deduplicated", () => {
    expect(findProfanity("shit, utter shit")).toEqual(["shit"]);
  });

  it("reports nothing for clean text", () => {
    expect(findProfanity("excellent service")).toEqual([]);
  });
});
