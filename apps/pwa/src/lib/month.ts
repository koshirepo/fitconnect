/**
 * Documentation: Month-key helpers for the calendar screens.
 *
 * - The `YYYY-MM` string the attendance, reminder, and member calendars keep in the URL, and the two conversions every one of them needs: into a Date for arithmetic, and into a label for the heading.
 * - Local time on purpose. A month key is a wall-calendar month, not an instant — parsing `2026-08` as UTC puts a browser west of Greenwich into July, which is how a calendar ends up opening on the wrong month for some users and not others.
 * - `withMonth` puts the key back onto a link, which is how the finance screens hand the month they are showing to the next screen instead of resetting it.
 * - Primary exports: getMonthStr, parseMonth, formatMonthLabel, shiftMonth, withMonth.
 */

/** The `YYYY-MM` key for a date, e.g. `2026-08`. */
export function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The first of the month a key names, in local time. */
export function parseMonth(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** The heading form, e.g. `August 2026`. */
export function formatMonthLabel(s: string) {
  return parseMonth(s).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/**
 * The key `delta` months away, for the previous/next arrows.
 *
 * `setMonth` handles the year rollover, which hand-rolled month arithmetic
 * tends to get wrong at December.
 */
export function shiftMonth(s: string, delta: number) {
  const d = parseMonth(s);
  d.setMonth(d.getMonth() + delta);
  return getMonthStr(d);
}

/**
 * A path with `?month=` on it, so a link keeps the month the reader is on.
 *
 * The finance screens are read as a set — the books, payroll and the analytics
 * behind them are three questions about one month. Linking between them without
 * this dropped everybody back onto the current month mid-thought.
 */
export function withMonth(path: string, month: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ month, ...params });
  const [base, existing] = path.split("?");
  if (existing) {
    for (const [key, value] of new URLSearchParams(existing)) {
      if (!query.has(key)) query.set(key, value);
    }
  }
  return `${base}?${query.toString()}`;
}
