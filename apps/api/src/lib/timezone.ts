/**
 * Documentation: Zone arithmetic.
 *
 * - Turns UTC instants into the local calendar the gym reads them by, and back. Everything in the database is UTC; this is the only place that knows what a gym means by "today" or "6am".
 * - `zoneOffsetMinutes` was written for the RFID readers, which report a wall clock with no offset attached. It lives here rather than in that module because reports need the same arithmetic in the other direction, and two copies of an offset calculation is how a month of numbers ends up quietly an hour out.
 * - Primary exports: zoneOffsetMinutes, zoneToday, zoneDayString, zoneDayStart, daysBetween, toDayString, toDay.
 */

/** Minutes a zone is ahead of UTC at a given instant, or null if unknown. */
export function zoneOffsetMinutes(at: Date, timezone: string): number | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const parts = Object.fromEntries(
      formatter.formatToParts(at).map((part) => [part.type, part.value]),
    );

    const asZone = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? "0" : parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );

    return Math.round((asZone - at.getTime()) / 60_000);
  } catch {
    // An unknown zone is a configuration error, not something to guess around.
    return null;
  }
}

/**
 * The calendar day it is right now where the gym is, as `YYYY-MM-DD`.
 *
 * Not `new Date().toISOString().slice(0, 10)`, which is the day in UTC — for a
 * gym in India that is yesterday for the first five and a half hours of every
 * morning, so a report run before 5:30am would count the wrong day and a
 * "days absent" figure would be one short for everybody in it.
 *
 * Falls back to the UTC day if the zone is not one the runtime knows, which
 * keeps a report answerable rather than failing over a settings typo.
 */
export function zoneDayString(at: Date, timezone: string): string {
  const offset = zoneOffsetMinutes(at, timezone);
  const shifted = new Date(at.getTime() + (offset ?? 0) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Midnight of the gym's today, as the UTC instant that `Attendance.date` holds.
 *
 * `Attendance.date` is a day stamped at midnight UTC — it is a calendar day,
 * not an instant — so anything compared against it has to be built the same
 * way, out of the local Y/M/D rather than by truncating an instant.
 */
export function zoneToday(timezone: string, at: Date = new Date()): Date {
  return new Date(`${zoneDayString(at, timezone)}T00:00:00.000Z`);
}

/** Whole days from `from` to `to`, both being midnight-UTC calendar days. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * The `YYYY-MM-DD` in a value a database driver handed back, whatever shape it
 * chose for it.
 *
 * D1 stores these columns as ISO text, but the Prisma adapter maps them back to
 * `Date` before `$queryRaw` returns — including the result of a `MAX()` over a
 * date column, which is easy to assume stays text and does not. Assuming either
 * one throws at runtime on a path a mocked test will happily agree with, so
 * this takes all three shapes rather than betting on the current adapter.
 *
 * The day is read in UTC because the columns this parses are calendar days
 * already stamped at midnight UTC; re-interpreting them in a zone would shift
 * them off the day they were filed under.
 */
export function toDayString(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return new Date(value).toISOString().slice(0, 10);
  return value.slice(0, 10);
}

/** The same value as the midnight-UTC calendar day it names. */
export function toDay(value: Date | string | number | null | undefined): Date | null {
  const day = toDayString(value);
  return day ? new Date(`${day}T00:00:00.000Z`) : null;
}

/**
 * The instant local midnight fell at, for the local day `at` belongs to.
 *
 * `zoneToday` answers "which day is it there" and stamps that day at midnight
 * UTC, which is the shape `Attendance.date` is stored in. This answers the
 * different question a window over instants needs: at what moment did that day
 * begin. For India the two are five and a half hours apart, so filtering
 * `checkInAt` against the first would slide the window by an evening.
 *
 * The offset is read twice — once near the day, then again at the candidate
 * instant — so a day containing a clock change resolves to the side of the
 * change midnight actually fell on.
 */
export function zoneDayStart(timezone: string, at: Date = new Date()): Date {
  const dayUtc = zoneToday(timezone, at);
  const near = zoneOffsetMinutes(dayUtc, timezone) ?? 0;
  const candidate = new Date(dayUtc.getTime() - near * 60_000);
  const exact = zoneOffsetMinutes(candidate, timezone) ?? near;
  return new Date(dayUtc.getTime() - exact * 60_000);
}
