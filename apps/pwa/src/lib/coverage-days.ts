/**
 * Documentation: A membership's paid terms, flattened into the days a calendar asks about.
 *
 * - Two screens draw cover onto a month grid — the attendance calendar on a member's page, and the start-date picker when the desk sells a term — and a grid asks its question one day at a time. Ranges are the wrong shape for that, so they are expanded once into a set.
 * - Shared rather than written twice: the two calendars sit a click apart, and a member seeing one shade on one screen and another on the next would have no way to tell which was lying.
 * - Local days throughout, matching the `YYYY-MM-DD` keys the API returns and the grids are built from. Nothing here goes through UTC, which would shift a term's edge by a day for half the world.
 * - Primary exports: coveredDays.
 */

/** "YYYY-MM-DD" for a local date, without going through UTC. */
export function localDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Every day inside a term, as a set of day keys.
 *
 * Expanded rather than compared as ranges because a month grid asks about one
 * day at a time, and a year of terms is a few hundred entries — cheaper to
 * build once than to scan every range for each of thirty cells.
 */
export function coveredDays(terms: { from: string; to: string }[]) {
  const days = new Set<string>();

  for (const term of terms) {
    const cursor = new Date(`${term.from}T00:00:00`);
    const end = new Date(`${term.to}T00:00:00`);
    while (cursor <= end) {
      days.add(localDayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return days;
}
