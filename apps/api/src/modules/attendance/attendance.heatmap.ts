/**
 * Documentation: Folding check-in instants into the gym's week.
 *
 * - Pure. Takes the UTC buckets the repository counted and places each one in the local day-and-hour it happened in, which is the only form "when is the floor busiest" can be read in.
 * - Kept out of the service and out of SQL on purpose. SQL cannot apply a zone offset that changes partway through the window, and a service method that did this inline would be the one piece of the feature that could only be checked by looking at a chart.
 * - Primary exports: buildHeatmapGrid, HOURS_IN_DAY, DAYS_IN_WEEK.
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
