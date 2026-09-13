/**
 * Documentation: Folding check-in instants into the gym's week.
 *
 * - Pure. Takes the UTC buckets the repository counted and places each one in the local day-and-hour it happened in, which is the only form "when is the floor busiest" can be read in.
 * - Kept out of the service and out of SQL on purpose. SQL cannot apply a zone offset that changes partway through the window, and a service method that did this inline would be the one piece of the feature that could only be checked by looking at a chart.
 * - Also spreads whole visits, check-in to check-out, across the hours they covered, which is what "how full is the floor" is actually asking.
 * - Primary exports: buildHeatmapGrid, buildOccupancyGrid, HOURS_IN_DAY, DAYS_IN_WEEK, MAX_SESSION_MINUTES.
 */
import { zoneOffsetMinutes } from "../../lib/timezone";

export const DAYS_IN_WEEK = 7;
export const HOURS_IN_DAY = 24;

/**
 * One quarter-hour of UTC, and how many people walked in during it.
 *
 * Quarter-hours rather than hours because zones are not all whole hours off:
 * India is +5:30 and Nepal is +5:45, so an hour-wide UTC bucket would straddle
 * two local hours and there would be no honest way to split it. Every real
 * offset is a multiple of 15 minutes, so at this width every bucket lands
 * wholly inside one local hour.
 */
export type CheckInBucket = {
  /** `YYYY-MM-DDTHH` in UTC. */
  hourKey: string;
  /** 0–3: which quarter of that hour. */
  quarter: number;
  visits: number;
};

export type HeatmapGrid = {
  /** `[day][hour]`, day 0 = Monday, hour 0 = local midnight. */
  grid: number[][];
  total: number;
  /** The local hour with the most visits across the window, or null if none. */
  busiestHour: number | null;
  /** Day 0–6 with the most visits, or null if none. */
  busiestDay: number | null;
  /** Visits that could not be placed because the zone was unreadable. */
  unplaced: number;
};

function emptyGrid(): number[][] {
  return Array.from({ length: DAYS_IN_WEEK }, () => new Array<number>(HOURS_IN_DAY).fill(0));
}

/**
 * Place each bucket in the local weekday and hour it fell in.
 *
 * The offset is read per bucket rather than once for the window. A single
 * offset would be right for India, where there is no clock change, and would
 * silently misfile an hour of every day for the four weeks after one anywhere
 * that has them — which is exactly the sort of error that shows up as a chart
 * that looks plausible and is wrong.
 *
 * Day 0 is Monday, matching the register's own week rather than JavaScript's
 * Sunday-first `getUTCDay`.
 */
export function buildHeatmapGrid(buckets: CheckInBucket[], timezone: string): HeatmapGrid {
  const grid = emptyGrid();
  let total = 0;
  let unplaced = 0;

  for (const bucket of buckets) {
    const at = new Date(`${bucket.hourKey}:${String(bucket.quarter * 15).padStart(2, "0")}:00.000Z`);
    if (Number.isNaN(at.getTime())) {
      unplaced += bucket.visits;
      continue;
    }

    const offset = zoneOffsetMinutes(at, timezone);
    if (offset === null) {
      // Better to say how many visits went unplaced than to pile them onto
      // UTC's idea of the hour and let the gym read it as fact.
      unplaced += bucket.visits;
      continue;
    }

    const local = new Date(at.getTime() + offset * 60_000);
    const day = (local.getUTCDay() + 6) % 7;
    grid[day]![local.getUTCHours()]! += bucket.visits;
    total += bucket.visits;
  }

  let busiestHour: number | null = null;
  let busiestDay: number | null = null;

  if (total > 0) {
    const byHour = new Array<number>(HOURS_IN_DAY).fill(0);
    const byDay = new Array<number>(DAYS_IN_WEEK).fill(0);
    for (let day = 0; day < DAYS_IN_WEEK; day += 1) {
      for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
        const visits = grid[day]![hour]!;
        byHour[hour]! += visits;
        byDay[day]! += visits;
      }
    }
    busiestHour = byHour.indexOf(Math.max(...byHour));
    busiestDay = byDay.indexOf(Math.max(...byDay));
  }

  return { grid, total, busiestHour, busiestDay, unplaced };
}

// ─── How full the floor is ────────────────────────────────────────────────────

/** One visit as a span of time, for working out who was inside when. */
export type SessionSpan = {
  checkInAt: Date;
  /** The last tap. Null for a session still open, or one nobody closed. */
  checkOutAt: Date | null;
  /** True while the member is still inside: no tap out yet, and not swept. */
  open: boolean;
};

export type OccupancyGrid = {
  /**
   * `[day][hour]`: how many people were inside during that hour, on average
   * over the window. 6.5 means that on a typical Thursday at 7am six or seven
   * people were on the floor.
   */
  grid: number[][];
  /** The hour and day of the fullest cell, or null when nobody was counted. */
  peakDay: number | null;
  peakHour: number | null;
  /** The fullest cell's value. */
  peak: number;
  /** Mean length of a completed visit, in minutes, or null with none. */
  averageStayMinutes: number | null;
  /** Visits that went into the grid. */
  sessions: number;
  /**
   * Visits left out because nobody tapped out. Their length is unknown, and a
   * guessed one would put people on the floor who had gone home.
   */
  withoutCheckout: number;
};

/**
 * Longer than any real visit. A span beyond this is a tap out that belongs to
 * a later visit the reader treated as the same session, and letting it count
 * would paint a member across a whole afternoon.
 */
export const MAX_SESSION_MINUTES = 360;

/**
 * Spread each visit across the local hours it covered.
 *
 * A visit from 06:40 to 08:10 adds twenty minutes to the 6am cell, a full hour
 * to 7am and ten minutes to 8am; each cell is then divided by sixty minutes and
 * by the number of weeks. The result is the average headcount in that hour,
 * which is the number a gym plans staff against — arrivals alone say when
 * people come in, not how long the floor stays full after they do.
 *
 * The zone offset is read at the start of each visit. A visit is a couple of
 * hours long; one straddling a clock change is off by that hour at worst.
 */
export function buildOccupancyGrid(
  spans: SessionSpan[],
  timezone: string,
  weeks: number,
  now: Date = new Date(),
): OccupancyGrid {
  const minutes = emptyGrid();
  let sessions = 0;
  let withoutCheckout = 0;
  let stayTotal = 0;
  let stayCount = 0;

  for (const span of spans) {
    const end = span.checkOutAt ?? (span.open ? now : null);
    if (!end) {
      withoutCheckout += 1;
      continue;
    }

    const lengthMinutes = (end.getTime() - span.checkInAt.getTime()) / 60_000;
    if (lengthMinutes <= 0 || lengthMinutes > MAX_SESSION_MINUTES) {
      withoutCheckout += 1;
      continue;
    }

    const offset = zoneOffsetMinutes(span.checkInAt, timezone);
    if (offset === null) continue;

    if (span.checkOutAt) {
      stayTotal += lengthMinutes;
      stayCount += 1;
    }
    sessions += 1;

    let cursor = span.checkInAt.getTime() + offset * 60_000;
    const localEnd = end.getTime() + offset * 60_000;

    while (cursor < localEnd) {
      const local = new Date(cursor);
      const hourEnd = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        local.getUTCHours() + 1,
      );
      const slice = Math.min(hourEnd, localEnd) - cursor;
      const day = (local.getUTCDay() + 6) % 7;
      minutes[day]![local.getUTCHours()]! += slice / 60_000;
      cursor = hourEnd;
    }
  }

  const divisor = 60 * Math.max(weeks, 1);
  const grid = minutes.map((row) => row.map((value) => Math.round((value / divisor) * 10) / 10));

  let peak = 0;
  let peakDay: number | null = null;
  let peakHour: number | null = null;
  grid.forEach((row, day) =>
    row.forEach((value, hour) => {
      if (value > peak) {
        peak = value;
        peakDay = day;
        peakHour = hour;
      }
    }),
  );

  return {
    grid,
    peakDay,
    peakHour,
    peak,
    averageStayMinutes: stayCount > 0 ? Math.round(stayTotal / stayCount) : null,
    sessions,
    withoutCheckout,
  };
}
