/**
 * Documentation: The days a membership was actually paid for, and the days it was not.
 *
 * - A member's terms are not a tidy sequence. They overlap when somebody renews early, they butt up against each other when somebody renews on the day, and they leave holes when somebody takes a fortnight off on purpose. This turns a pile of validity windows into one honest timeline of both.
 * - Gaps are the point. A gym can see who has lapsed from the due date alone; what it cannot see is the member who has quietly been taking five days off between every term for a year, which is a different conversation and a different kind of customer.
 * - Freezes need no special handling. Freezing a term pushes that payment's `validUntil` forward, so paused time is already inside the window rather than beside it — a frozen fortnight is covered, not a gap, which is exactly what the member paid for.
 * - Whole days throughout, counted in UTC. A term is a day-level promise — nobody sells a membership that ends at 14:32 — and counting in days sidesteps the hour that daylight saving would otherwise add or drop from a gap.
 * - Primary exports: buildCoverage, type CoverageWindow, type Coverage.
 */

/** One paid term, as the payment recorded it. */
export type CoverageWindow = { from: Date; to: Date };

export type CoverageTerm = { from: string; to: string; days: number };

export type CoverageGap = {
  from: string;
  to: string;
  days: number;
  /**
   * A gap that has not ended: the member is uncovered right now.
   *
   * Worth its own flag rather than being inferred from the end date, because
   * "no cover for 9 days and counting" is a member to call today, and "no cover
   * for 9 days in March" is a pattern to notice.
   */
  open: boolean;
  /**
   * The stretch between joining and paying for the first time.
   *
   * Not a lapse — nobody let anything expire — so it is named apart from the
   * gaps that come from a member letting a term run out.
   */
  beforeFirstTerm: boolean;
};

export type Coverage = {
  terms: CoverageTerm[];
  gaps: CoverageGap[];
  totals: {
    coveredDays: number;
    gapDays: number;
    gapCount: number;
    longestGapDays: number;
    /** Mean days between one term ending and the next beginning. */
    averageGapDays: number | null;
    /** True while the member is in a gap right now. */
    currentlyUncovered: boolean;
  };
};

/** Whole days since the epoch, in UTC. */
function dayNumber(date: Date) {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000,
  );
}

function dayKey(day: number) {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Turn a member's validity windows into covered terms and the gaps between.
 *
 * `asOf` is normally today: it is what decides whether the last gap is closed
 * history or a member standing in the gym without a live membership.
 *
 * `joinedAt` produces the one gap that is not a lapse — the wait between
 * signing up and paying — and is optional because a membership recorded before
 * that date was tracked has nothing honest to measure from.
 */
export function buildCoverage(
  windows: CoverageWindow[],
  { asOf, joinedAt }: { asOf: Date; joinedAt?: Date | null },
): Coverage {
  const today = dayNumber(asOf);

  // A window whose end precedes its start buys nothing; it is a data error, not
  // a negative term, and letting it through would make a gap look like cover.
  const sorted = windows
    .map((w) => ({ from: dayNumber(w.from), to: dayNumber(w.to) }))
    .filter((w) => w.to >= w.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);

  // Merge what overlaps, and what merely touches. Renewing the day after a term
  // ends is continuous cover, not a zero-day gap, so `+ 1` is the join.
  const merged: { from: number; to: number }[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.from <= last.to + 1) {
      last.to = Math.max(last.to, window.to);
      continue;
    }
    merged.push({ ...window });
  }

  const gaps: CoverageGap[] = [];

  // Joined, then waited before paying for anything.
  const joined = joinedAt ? dayNumber(joinedAt) : null;
  const firstTerm = merged[0];
  if (joined !== null && firstTerm && firstTerm.from > joined + 1) {
    gaps.push({
      from: dayKey(joined + 1),
      to: dayKey(firstTerm.from - 1),
      days: firstTerm.from - joined - 1,
      open: false,
      beforeFirstTerm: true,
    });
  }

  for (let i = 0; i < merged.length - 1; i += 1) {
    const from = merged[i]!.to + 1;
    const to = merged[i + 1]!.from - 1;
    gaps.push({
      from: dayKey(from),
      to: dayKey(to),
      days: to - from + 1,
      open: false,
      beforeFirstTerm: false,
    });
  }

  // The gap the member is standing in. Counted to today rather than left open
  // ended, so "how long have they been lapsed" has an answer.
  const lastTerm = merged[merged.length - 1];
  if (lastTerm && lastTerm.to < today) {
    gaps.push({
      from: dayKey(lastTerm.to + 1),
      to: dayKey(today),
      days: today - lastTerm.to,
      open: true,
      beforeFirstTerm: false,
    });
  }

  // A member who joined and has never paid at all: one open gap since joining,
  // rather than a timeline with nothing on it.
  if (!lastTerm && joined !== null && today > joined) {
    gaps.push({
      from: dayKey(joined + 1),
      to: dayKey(today),
      days: today - joined,
      open: true,
      beforeFirstTerm: true,
    });
  }

  const terms = merged.map((term) => ({
    from: dayKey(term.from),
    to: dayKey(term.to),
    days: term.to - term.from + 1,
  }));

  // The averages describe lapses between terms. The wait before the first
  // payment is left out: it says something about joining, not about renewing,
  // and folding it in would flatter or damn a member for the wrong reason.
  const lapses = gaps.filter((gap) => !gap.beforeFirstTerm);
  const gapDays = gaps.reduce((sum, gap) => sum + gap.days, 0);

  return {
    terms,
    gaps,
    totals: {
      coveredDays: terms.reduce((sum, term) => sum + term.days, 0),
      gapDays,
      gapCount: gaps.length,
      longestGapDays: gaps.reduce((longest, gap) => Math.max(longest, gap.days), 0),
      averageGapDays: lapses.length
        ? Math.round((lapses.reduce((sum, gap) => sum + gap.days, 0) / lapses.length) * 10) / 10
        : null,
      currentlyUncovered: gaps.some((gap) => gap.open),
    },
  };
}
