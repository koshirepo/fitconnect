/**
 * Documentation: Which shift a punch belongs to, and which day it is filed under.
 *
 * - A gym runs shifts as local wall-clock windows — "05:00"–"10:00", "17:00"–"22:00" — and a punch is just an instant. This turns one into the other: given when somebody tapped, it answers which shift they tapped for and which day that shift belongs to.
 * - Shifts may cross midnight. An `endTime` at or before `startTime` means the window runs into the next day, so "22:00"–"02:00" is a four-hour night shift. A 01:00 punch then belongs to the shift that *started the previous evening*, which is why the day it reports is the date the window opened rather than the date on the clock.
 * - There is grace on both ends. People arrive before a shift opens and leave after it closes, and a punch at 04:50 for a 05:00 start is plainly that shift rather than no shift at all.
 * - Where two windows could claim a punch, one that contains it outright beats one that only reaches it on grace, and the member's own assigned shift breaks any remaining tie. Nothing here refuses a punch: a tap outside every window is still a visit that happened, reported with no shift.
 * - Pure, and deliberately so. Every rule that decides what a tap means is expressible as a function of the instant, the zone, and the shifts — which is what makes the awkward cases testable without a database.
 * - Primary exports: resolvePunchShift, GRACE_BEFORE_MINUTES, GRACE_AFTER_MINUTES.
 */
import { zoneOffsetMinutes } from "../../lib/timezone";

/** The shape a shift needs to have to be matched against. */
export interface ShiftWindow {
  id: string;
  name: string;
  /** 24-hour local time, "HH:MM". */
  startTime: string;
  /** 24-hour local time. At or before `startTime` means it crosses midnight. */
  endTime: string;
}

export interface ResolvedShift {
  /** The shift the punch belongs to, or null when it falls outside every one. */
  shift: ShiftWindow | null;
  /** UTC midnight of the local date the shift window started. */
  day: Date;
  /** The session's non-null discriminator: a shift id, or "none". */
  shiftKey: string;
}

/**
 * How early a tap still counts for the shift it precedes.
 *
 * An hour, because arriving before the doors open is ordinary and the
 * alternative — filing it as a shiftless visit — loses the session the member
 * is about to work through.
 */
export const GRACE_BEFORE_MINUTES = 60;

/** How late a tap still counts for the shift it follows. */
export const GRACE_AFTER_MINUTES = 60;

const MINUTES_PER_DAY = 1440;

/** "05:30" as minutes since local midnight, or null if it is not a time. */
function toMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

type Candidate = {
  shift: ShiftWindow;
  /** 0 when the window opened on the punch's own date, 1 when the day before. */
  daysBack: 0 | 1;
  /** True when the window contains the punch without needing grace. */
  core: boolean;
  /** Distance in minutes from the window's start, for breaking ties. */
  distance: number;
};

export function resolvePunchShift(
  at: Date,
  timezone: string,
  shifts: ShiftWindow[],
  assignedShiftId?: string | null,
): ResolvedShift {
  /**
   * The wall clock the punch happened on.
   *
   * Shifted into local time and then read with the UTC accessors, so every
   * comparison below happens in one flat space of "minutes since local
   * midnight" rather than juggling two calendars.
   */
  const offset = zoneOffsetMinutes(at, timezone) ?? 0;
  const local = new Date(at.getTime() + offset * 60_000);

  const punchMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const localMidnight = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );

  const candidates: Candidate[] = [];

  for (const shift of shifts) {
    const start = toMinutes(shift.startTime);
    const rawEnd = toMinutes(shift.endTime);
    if (start === null || rawEnd === null) continue;

    // An end at or before the start runs past midnight into the next day.
    const end = rawEnd <= start ? rawEnd + MINUTES_PER_DAY : rawEnd;

    // Two anchors: the window may have opened today, or — for one that crosses
    // midnight — yesterday evening, with this punch landing after midnight.
    for (const daysBack of [0, 1] as const) {
      const relative = punchMinutes + daysBack * MINUTES_PER_DAY;

      if (relative < start - GRACE_BEFORE_MINUTES) continue;
      if (relative > end + GRACE_AFTER_MINUTES) continue;

      candidates.push({
        shift,
        daysBack,
        core: relative >= start && relative <= end,
        distance: Math.abs(relative - start),
      });
    }
  }

  if (candidates.length === 0) {
    // Still a visit, just not one the gym has a window for.
    return { shift: null, day: new Date(localMidnight), shiftKey: "none" };
  }

  candidates.sort((a, b) => {
    // A window that actually contains the punch beats one only reaching it on
    // grace — otherwise an early tap for the evening shift could be claimed by
    // the morning one it trails.
    if (a.core !== b.core) return a.core ? -1 : 1;

    // Then the member's own shift, which is the gym's own answer to the tie.
    const aAssigned = a.shift.id === assignedShiftId;
    const bAssigned = b.shift.id === assignedShiftId;
    if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;

    return a.distance - b.distance;
  });

  const best = candidates[0]!;

  return {
    shift: best.shift,
    day: new Date(localMidnight - best.daysBack * MINUTES_PER_DAY * 60_000),
    shiftKey: best.shift.id,
  };
}
