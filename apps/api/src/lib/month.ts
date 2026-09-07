/**
 * Documentation: Calendar-month bounds, shared by every module that reports on one.
 *
 * - A month is the `YYYY-MM` key the finance, salary, attendance and analytics screens keep in the URL, and `monthRange` turns it into the half-open window every query against it needs.
 * - Bounds are half-open — `>= first of the month` and `< first of the next`. An inclusive upper bound built from "last day of month" silently drops anything recorded during that final day.
 * - Lives here rather than in one module's repository because the books and the payment analytics have to agree on where October starts. When they each owned a copy, they did not.
 * - Primary exports: monthRange, currentMonth.
 */

/** The half-open [from, to) bounds of a "YYYY-MM" month. */
export function monthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 1)),
  };
}

/** The `YYYY-MM` key for the month a date falls in, defaulting to now. */
export function currentMonth(at: Date = new Date()) {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
}
