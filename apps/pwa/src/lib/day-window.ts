/**
 * Documentation: Day windows shared by the screens that link to each other.
 *
 * - A window is a half-open pair of `YYYY-MM-DD` days, `[from, to)`, either end optional. That is the shape the analytics screen hands to the roster and the ledger when one of its figures is clicked: "new members in March", "payments this week".
 * - Local time on purpose, and cut at local midnight. The server buckets "today", "this week" and a calendar month against its own clock, so a window that cut the day anywhere else would list a different set of people than the number that was clicked — which is the one thing these links must never do.
 * - `to` is exclusive, so a month runs to the first of the next one and no row can fall into two adjacent windows. `describeWindow` is the exception: it names the last day the window actually covers, because "up to 1 Oct" reads as including it.
 * - Primary exports: dayKey, parseDay, withinDays, describeWindow.
 */
import { formatDate } from "@/lib/utils";

/** The `YYYY-MM-DD` key for a date, in local time. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Local midnight on a `YYYY-MM-DD` day, or null if that is not what it is. */
export function parseDay(day: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!parts) return null;
  return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

/**
 * Whether a timestamp falls inside the half-open window `[from, to)`.
 *
 * With neither end set every row is in, which is what "all time" means. With
 * either end set a row that carries no readable date is out — it cannot be
 * shown to belong to the period being asked about.
 */
export function withinDays(value: string | null | undefined, from: string, to: string) {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start && !end) return true;
  if (!value) return false;

  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return false;
  if (start && at < start) return false;
  if (end && at >= end) return false;
  return true;
}

/**
 * The window in words, e.g. "Joined 1 Sep 2026 – 30 Sep 2026".
 *
 * For the line a screen shows when a window arrived on its URL rather than
 * from one of its own controls, which is otherwise a list that looks
 * mysteriously short.
 */
export function describeWindow(prefix: string, from: string, to: string) {
  const start = parseDay(from);
  const end = parseDay(to);
  // `to` is exclusive, so the label names the last day the window covers rather
  // than the first day it does not.
  const last = end ? new Date(end.getTime() - 1) : null;

  if (start && last) {
    return start.toDateString() === last.toDateString()
      ? `${prefix} on ${formatDate(start)}`
      : `${prefix} ${formatDate(start)} – ${formatDate(last)}`;
  }
  if (start) return `${prefix} since ${formatDate(start)}`;
  if (last) return `${prefix} up to ${formatDate(last)}`;
  return "";
}
