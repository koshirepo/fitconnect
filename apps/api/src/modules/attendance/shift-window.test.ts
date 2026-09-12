/**
 * Documentation: What a tap means, in wall-clock terms.
 *
 * - `resolvePunchShift` decides two things from one instant: which shift somebody tapped for, and which day that shift belongs to. Both are easy to get subtly wrong and expensive to notice later — a session filed under the wrong day splits one night's work across two, and reports quietly disagree with the people who worked them.
 * - The overnight cases are the reason this file exists. A 01:00 punch on a 22:00–02:00 shift belongs to the evening that started it, not to the date on the clock.
 * - Times are written here as Indian wall clock, the way a gym would say them, and converted once — because a test that reads in UTC cannot be checked against the thing it claims to describe.
 */
import { describe, expect, it } from "vitest";
import { resolvePunchShift, type ShiftWindow } from "./shift-window";

const ZONE = "Asia/Kolkata";

/** An Indian wall clock as the UTC instant it actually was. IST is UTC+5:30. */
function ist(local: string): Date {
  const [date, time] = local.split(" ");
  return new Date(`${date}T${time}:00.000+05:30`);
}

/** The day a session is filed under, as a plain date for comparison. */
function dayOf(value: Date) {
  return value.toISOString().slice(0, 10);
}

const MORNING: ShiftWindow = { id: "s1", name: "Morning", startTime: "05:00", endTime: "10:00" };
const EVENING: ShiftWindow = { id: "s2", name: "Evening", startTime: "17:00", endTime: "22:00" };
const NIGHT: ShiftWindow = { id: "s3", name: "Night", startTime: "22:00", endTime: "02:00" };

describe("resolvePunchShift", () => {
  const twoShifts = [MORNING, EVENING];

  it("files a morning tap under the morning shift", () => {
    const result = resolvePunchShift(ist("2026-09-03 06:00"), ZONE, twoShifts);

    expect(result.shift?.id).toBe("s1");
    expect(result.shiftKey).toBe("s1");
    expect(dayOf(result.day)).toBe("2026-09-03");
  });

  it("files an evening tap under the evening shift, same day", () => {
    const result = resolvePunchShift(ist("2026-09-03 18:00"), ZONE, twoShifts);

    expect(result.shift?.id).toBe("s2");
    expect(dayOf(result.day)).toBe("2026-09-03");
  });

  it("counts an early arrival for the shift it precedes", () => {
    const result = resolvePunchShift(ist("2026-09-03 04:30"), ZONE, twoShifts);

    expect(result.shift?.id).toBe("s1");
    expect(dayOf(result.day)).toBe("2026-09-03");
  });

  it("counts a late departure for the shift it follows", () => {
    const result = resolvePunchShift(ist("2026-09-03 10:45"), ZONE, twoShifts);

    expect(result.shift?.id).toBe("s1");
  });

  it("records a tap outside every window as a visit with no shift", () => {
    const result = resolvePunchShift(ist("2026-09-03 13:00"), ZONE, twoShifts);

    expect(result.shift).toBeNull();
    expect(result.shiftKey).toBe("none");
    expect(dayOf(result.day)).toBe("2026-09-03");
  });

  describe("a shift that crosses midnight", () => {
    const shifts = [NIGHT];

    it("files the evening half under the day it started", () => {
      const result = resolvePunchShift(ist("2026-09-03 23:00"), ZONE, shifts);

      expect(result.shift?.id).toBe("s3");
      expect(dayOf(result.day)).toBe("2026-09-03");
    });

    it("files the small hours under the evening that started them", () => {
      // The whole point: this tap happens on the 4th, and belongs to the 3rd.
      const result = resolvePunchShift(ist("2026-09-04 01:00"), ZONE, shifts);

      expect(result.shift?.id).toBe("s3");
      expect(dayOf(result.day)).toBe("2026-09-03");
    });

    it("still does so for a late departure past the end", () => {
      const result = resolvePunchShift(ist("2026-09-04 02:30"), ZONE, shifts);

      expect(result.shift?.id).toBe("s3");
      expect(dayOf(result.day)).toBe("2026-09-03");
    });

    it("leaves a tap well clear of the window shiftless, on its own date", () => {
      const result = resolvePunchShift(ist("2026-09-04 12:00"), ZONE, shifts);

      expect(result.shift).toBeNull();
      expect(dayOf(result.day)).toBe("2026-09-04");
    });
  });

  describe("when two windows could claim the same tap", () => {
    const early: ShiftWindow = { id: "a", name: "Early", startTime: "05:00", endTime: "10:00" };
    const late: ShiftWindow = { id: "b", name: "Late", startTime: "10:30", endTime: "14:00" };

    it("prefers the window that contains it over one only reaching it on grace", () => {
      // 10:45 is inside Late, and only within Early's trailing grace — so Late
      // wins even when Early is the member's own shift.
      const result = resolvePunchShift(ist("2026-09-03 10:45"), ZONE, [early, late], "a");

      expect(result.shift?.id).toBe("b");
    });

    it("falls back to the nearer window when nothing else separates them", () => {
      // 10:15 is outside both windows and inside both margins: fifteen minutes
      // from Late opening, and five hours since Early opened.
      const result = resolvePunchShift(ist("2026-09-03 10:15"), ZONE, [early, late]);

      expect(result.shift?.id).toBe("b");
    });

    it("lets the member's own shift outrank the nearer window", () => {
      const result = resolvePunchShift(ist("2026-09-03 10:15"), ZONE, [early, late], "a");

      expect(result.shift?.id).toBe("a");
    });
  });

  it("reads the wall clock in the gym's zone, not in UTC", () => {
    // 23:00 UTC on the 3rd is 04:30 on the 4th in India — an early arrival for
    // the morning shift of a day UTC has not reached yet.
    const result = resolvePunchShift(new Date("2026-09-03T23:00:00.000Z"), ZONE, twoShifts);

    expect(result.shift?.id).toBe("s1");
    expect(dayOf(result.day)).toBe("2026-09-04");
  });

  it("ignores a shift whose times are not times", () => {
    const broken: ShiftWindow = { id: "x", name: "Broken", startTime: "", endTime: "nonsense" };
    const result = resolvePunchShift(ist("2026-09-03 06:00"), ZONE, [broken, MORNING]);

    expect(result.shift?.id).toBe("s1");
  });

  it("has no shift to offer when the gym has defined none", () => {
    const result = resolvePunchShift(ist("2026-09-03 06:00"), ZONE, []);

    expect(result.shift).toBeNull();
    expect(result.shiftKey).toBe("none");
  });
});
