/**
 * Documentation: What counts as a gap in somebody's membership, and what does not.
 *
 * - The cases that matter are the boundaries. Renewing the day after a term ends is continuous cover; renewing two days after is a one-day gap. Getting that off by one turns every diligent member into a lapsed one, or hides a real lapse in every record.
 * - Overlapping terms are ordinary, not an error: a member who renews a week early holds two live windows at once, and counting those days twice would report more covered days than the year has.
 * - Dates are written as plain days because that is what a membership term is. The helper below keeps them in UTC so a test cannot pass or fail on the machine's own timezone.
 */
import { describe, expect, it } from "vitest";
import { buildCoverage } from "./coverage";

/** A plain UTC day, the way a term is actually sold. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const term = (from: string, to: string) => ({ from: d(from), to: d(to) });

/** Well after every date in this file, so nothing is accidentally "open". */
const LATER = d("2026-12-31");

describe("buildCoverage", () => {
  it("reports a single term with no gaps", () => {
    const coverage = buildCoverage([term("2026-01-01", "2026-01-31")], { asOf: d("2026-01-15") });

    expect(coverage.terms).toEqual([{ from: "2026-01-01", to: "2026-01-31", days: 31 }]);
    expect(coverage.gaps).toEqual([]);
    expect(coverage.totals.coveredDays).toBe(31);
    expect(coverage.totals.currentlyUncovered).toBe(false);
  });

  // The boundary the whole feature turns on.
  it("treats renewing the day after expiry as continuous cover", () => {
    const coverage = buildCoverage(
      [term("2026-01-01", "2026-01-31"), term("2026-02-01", "2026-02-28")],
      { asOf: LATER },
    );

    expect(coverage.terms).toHaveLength(1);
    expect(coverage.terms[0]).toEqual({ from: "2026-01-01", to: "2026-02-28", days: 59 });
    expect(coverage.gaps.filter((g) => !g.open)).toEqual([]);
  });

  it("counts a one-day hole as a one-day gap", () => {
    const coverage = buildCoverage(
      [term("2026-01-01", "2026-01-31"), term("2026-02-02", "2026-02-28")],
      { asOf: LATER },
    );

    const gap = coverage.gaps.find((g) => !g.open);
    expect(gap).toMatchObject({ from: "2026-02-01", to: "2026-02-01", days: 1 });
  });

  // The behaviour the gym actually asked for: somebody who deliberately waits.
  it("finds the deliberate five-day break between two terms", () => {
    const coverage = buildCoverage(
      [term("2026-01-01", "2026-01-31"), term("2026-02-06", "2026-03-05")],
      { asOf: LATER },
    );

    const gap = coverage.gaps.find((g) => !g.open);
    expect(gap).toMatchObject({ from: "2026-02-01", to: "2026-02-05", days: 5 });
    expect(coverage.totals.gapDays).toBeGreaterThanOrEqual(5);
  });

  it("merges overlapping terms rather than counting the shared days twice", () => {
    const coverage = buildCoverage(
      [term("2026-01-01", "2026-01-31"), term("2026-01-20", "2026-02-19")],
      { asOf: LATER },
    );

    expect(coverage.terms).toHaveLength(1);
    // 1 Jan to 19 Feb is 50 days, not the 62 the two windows add up to.
    expect(coverage.terms[0]!.days).toBe(50);
  });

  it("handles terms recorded out of order", () => {
    const coverage = buildCoverage(
      [term("2026-03-01", "2026-03-31"), term("2026-01-01", "2026-01-31")],
      { asOf: LATER },
    );

    expect(coverage.terms.map((t) => t.from)).toEqual(["2026-01-01", "2026-03-01"]);
    expect(coverage.gaps.find((g) => !g.open)).toMatchObject({ days: 28 });
  });

  it("leaves the current lapse open and counts it up to today", () => {
    const coverage = buildCoverage([term("2026-01-01", "2026-01-31")], { asOf: d("2026-02-10") });

    const open = coverage.gaps.find((g) => g.open);
    expect(open).toMatchObject({ from: "2026-02-01", to: "2026-02-10", days: 10 });
    expect(coverage.totals.currentlyUncovered).toBe(true);
  });

  it("does not open a gap while the term is still running", () => {
    const coverage = buildCoverage([term("2026-01-01", "2026-03-31")], { asOf: d("2026-02-10") });

    expect(coverage.gaps).toEqual([]);
    expect(coverage.totals.currentlyUncovered).toBe(false);
  });

  it("names the wait between joining and the first payment apart from a lapse", () => {
    const coverage = buildCoverage([term("2026-01-10", "2026-02-09")], {
      asOf: LATER,
      joinedAt: d("2026-01-01"),
    });

    const first = coverage.gaps[0];
    expect(first).toMatchObject({ from: "2026-01-02", to: "2026-01-09", days: 8 });
    expect(first?.beforeFirstTerm).toBe(true);
  });

  // Joining and paying the same day, or the next, is not a wait worth reporting.
  it("reports no joining gap when the first term starts straight away", () => {
    const coverage = buildCoverage([term("2026-01-02", "2026-02-01")], {
      asOf: LATER,
      joinedAt: d("2026-01-01"),
    });

    expect(coverage.gaps.filter((g) => g.beforeFirstTerm)).toEqual([]);
  });

  it("shows a member who joined and never paid as uncovered since joining", () => {
    const coverage = buildCoverage([], { asOf: d("2026-01-20"), joinedAt: d("2026-01-01") });

    expect(coverage.terms).toEqual([]);
    expect(coverage.gaps).toHaveLength(1);
    expect(coverage.gaps[0]).toMatchObject({ days: 19, open: true, beforeFirstTerm: true });
  });

  /**
   * The average is about renewing, not about joining.
   *
   * Folding the joining wait in would report a member who took a month to pay
   * and has renewed on time ever since as an habitual lapser.
   */
  it("averages the lapses between terms and leaves the joining wait out", () => {
    const coverage = buildCoverage(
      [
        term("2026-02-01", "2026-02-28"),
        term("2026-03-05", "2026-04-04"),
        term("2026-04-08", "2026-05-07"),
      ],
      { asOf: d("2026-05-01"), joinedAt: d("2026-01-01") },
    );

    // 4 days (1–4 Mar) and 3 days (5–7 Apr).
    expect(coverage.totals.averageGapDays).toBe(3.5);
    // The joining wait, 2–31 Jan, is the longest stretch — and is still the
    // longest even though it is excluded from the average above.
    expect(coverage.totals.longestGapDays).toBe(30);
    expect(coverage.gaps.some((g) => g.beforeFirstTerm)).toBe(true);
  });

  it("has nothing to report for a membership with no terms and no join date", () => {
    const coverage = buildCoverage([], { asOf: LATER });

    expect(coverage.terms).toEqual([]);
    expect(coverage.gaps).toEqual([]);
    expect(coverage.totals.averageGapDays).toBeNull();
    expect(coverage.totals.currentlyUncovered).toBe(false);
  });

  /**
   * Imported terms carry an end date and no start.
   *
   * The first cut of this required both ends and dropped them, which put a
   * member covered to next month into a 223-day gap — on the same screen as the
   * payment list saying otherwise. The start is reconstructed by the caller;
   * what is checked here is that a reconstructed term counts as cover and is
   * reported as reconstructed.
   */
  it("counts a term whose start was inferred, and says how many were", () => {
    const coverage = buildCoverage(
      [
        term("2026-01-08", "2026-02-01"),
        { from: d("2026-04-06"), to: d("2026-05-06"), inferredStart: true },
        { from: d("2026-05-06"), to: d("2026-06-01"), inferredStart: true },
      ],
      { asOf: d("2026-05-20") },
    );

    expect(coverage.totals.inferredStarts).toBe(2);
    expect(coverage.totals.currentlyUncovered).toBe(false);
    // 2 Feb to 5 Apr is a real gap; the terms after it are real cover.
    expect(coverage.gaps).toHaveLength(1);
    expect(coverage.gaps[0]).toMatchObject({ from: "2026-02-02", to: "2026-04-05" });
    expect(coverage.terms).toEqual([
      { from: "2026-01-08", to: "2026-02-01", days: 25 },
      { from: "2026-04-06", to: "2026-06-01", days: 57 },
    ]);
  });

  it("reports nothing inferred when every term recorded its own start", () => {
    const coverage = buildCoverage([term("2026-01-01", "2026-01-31")], { asOf: LATER });

    expect(coverage.totals.inferredStarts).toBe(0);
  });

  it("ignores a window that ends before it starts rather than inventing cover", () => {
    const coverage = buildCoverage(
      [{ from: d("2026-03-01"), to: d("2026-02-01") }, term("2026-01-01", "2026-01-31")],
      { asOf: LATER },
    );

    expect(coverage.terms).toEqual([{ from: "2026-01-01", to: "2026-01-31", days: 31 }]);
  });
});
