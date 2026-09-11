/**
 * Documentation: Tests for the zone arithmetic every report is counted in.
 *
 * - These exist for the same reason `iclock.parsing.test.ts` does: an offset mistake here is silent. Nothing throws, no request fails, and the only symptom is that a month of numbers is quietly a day out — which is exactly the kind of error that gets noticed after somebody has already acted on it.
 * - The half-hour zones are not padding. A whole-hour offset hides a whole class of bug that `Asia/Kolkata` — where every gym on the platform is — surfaces immediately.
 */
import { describe, expect, it } from "vitest";
import { daysBetween, zoneDayString, zoneOffsetMinutes, zoneToday } from "./timezone";

describe("zoneOffsetMinutes", () => {
  it("reads a half-hour zone", () => {
    expect(zoneOffsetMinutes(new Date("2026-09-03T00:00:00.000Z"), "Asia/Kolkata")).toBe(330);
  });

  it("reads a zone behind UTC", () => {
    expect(zoneOffsetMinutes(new Date("2026-09-03T00:00:00.000Z"), "America/New_York")).toBe(-240);
  });

  /**
   * The offset has to be taken at the instant in question, not once and reused:
   * a report spanning a DST boundary is counted in both halves.
   */
  it("uses the offset in force on that date", () => {
    const summer = zoneOffsetMinutes(new Date("2026-07-01T12:00:00.000Z"), "Europe/London");
    const winter = zoneOffsetMinutes(new Date("2026-01-01T12:00:00.000Z"), "Europe/London");
    expect(summer).toBe(60);
    expect(winter).toBe(0);
  });

  it("refuses to guess at a zone it does not know", () => {
    expect(zoneOffsetMinutes(new Date(), "Asia/Kolkatta")).toBeNull();
  });
});

describe("zoneDayString", () => {
  /**
   * The case the whole feature turns on. At 01:00 UTC it is already the 4th in
   * India; counting absence from the UTC day would report every member one day
   * less absent than they are, every morning until 05:30 UTC.
   */
  it("is already tomorrow in India while UTC is still yesterday", () => {
    expect(zoneDayString(new Date("2026-09-03T20:00:00.000Z"), "Asia/Kolkata")).toBe("2026-09-04");
    expect(zoneDayString(new Date("2026-09-03T20:00:00.000Z"), "UTC")).toBe("2026-09-03");
  });

  it("is still yesterday in New York while UTC has moved on", () => {
    expect(zoneDayString(new Date("2026-09-04T02:00:00.000Z"), "America/New_York")).toBe(
      "2026-09-03",
    );
  });

  it("falls back to the UTC day rather than failing on an unknown zone", () => {
    expect(zoneDayString(new Date("2026-09-03T20:00:00.000Z"), "Mars/Olympus")).toBe("2026-09-03");
  });
});

describe("zoneToday", () => {
  /**
   * `Attendance.date` is a calendar day stamped at midnight UTC, so anything
   * compared against it has to be built the same way. A value carrying a time
   * component would make every same-day comparison miss.
   */
  it("returns midnight UTC of the local day", () => {
    expect(zoneToday("Asia/Kolkata", new Date("2026-09-03T20:00:00.000Z")).toISOString()).toBe(
      "2026-09-04T00:00:00.000Z",
    );
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(
      daysBetween(new Date("2026-08-13T00:00:00.000Z"), new Date("2026-09-03T00:00:00.000Z")),
    ).toBe(21);
  });

  it("goes negative for a date still ahead", () => {
    expect(
      daysBetween(new Date("2026-09-03T00:00:00.000Z"), new Date("2026-08-30T00:00:00.000Z")),
    ).toBe(-4);
  });

  /**
   * Across a DST boundary two calendar days are 23 or 25 hours apart, not 24.
   * Both endpoints here are midnight-UTC stamps, which is what keeps the answer
   * a whole number — the rounding is what makes that safe rather than lucky.
   */
  it("survives a span containing a clock change", () => {
    expect(
      daysBetween(new Date("2026-03-01T00:00:00.000Z"), new Date("2026-04-01T00:00:00.000Z")),
    ).toBe(31);
  });
});
