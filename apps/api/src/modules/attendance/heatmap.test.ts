/**
 * Documentation: Tests for folding check-ins into the gym's week.
 *
 * - Everything here is about one question: does a visit land in the hour the gym would say it happened in. The failure mode is not a crash — it is a chart that looks entirely reasonable and is three hours out, which nobody can catch by looking.
 * - The half-hour offset is the point of the quarter-hour buckets, so it is tested directly. India is +5:30 and every gym on the platform is in it; an implementation that assumed whole hours would pass a UTC test and misfile every visit here.
 */
import { describe, expect, it } from "vitest";
import { buildHeatmapGrid, buildOccupancyGrid, type CheckInBucket } from "./attendance.heatmap";

/** One bucket, spelled out so each test reads as a time rather than a fixture. */
function at(hourKey: string, quarter = 0, visits = 1): CheckInBucket {
  return { hourKey, quarter, visits };
}

describe("buildHeatmapGrid", () => {
  /**
   * 2026-09-03 was a Thursday. 00:34 UTC is 06:04 in India — a morning
   * session, filed on Thursday. Read as UTC it would be midnight, and the gym
   * would appear to have a graveyard shift.
   */
  it("puts a morning session in the morning, not at midnight", () => {
    const { grid, total } = buildHeatmapGrid([at("2026-09-03T00", 2)], "Asia/Kolkata");

    expect(total).toBe(1);
    expect(grid[3]![6]).toBe(1);
    expect(grid[3]![0]).toBe(0);
  });

  /**
   * The reason buckets are quarter-hours. 18:20 UTC is 23:50 IST — still
   * Thursday. 18:40 UTC is 00:10 IST, which is Friday. An hour-wide bucket
   * would have to put both on one day and one of them would be wrong.
   */
  it("splits an hour that a half-hour offset straddles", () => {
    const { grid } = buildHeatmapGrid(
      [at("2026-09-03T18", 1), at("2026-09-03T18", 2)],
      "Asia/Kolkata",
    );

    expect(grid[3]![23]).toBe(1); // Thursday 23:50
    expect(grid[4]![0]).toBe(1); // Friday 00:10
  });

  it("rolls a late-evening UTC instant into the next local day", () => {
    // 20:00 UTC Thursday is 01:30 IST Friday.
    const { grid } = buildHeatmapGrid([at("2026-09-03T20")], "Asia/Kolkata");

    expect(grid[4]![1]).toBe(1);
    expect(grid[3]![1]).toBe(0);
  });

  it("counts Sunday as the last day of the week, not the first", () => {
    // 2026-09-06 is a Sunday; 06:00 UTC is 11:30 IST, same day.
    const { grid } = buildHeatmapGrid([at("2026-09-06T06")], "Asia/Kolkata");

    expect(grid[6]![11]).toBe(1);
    expect(grid[0]![11]).toBe(0);
  });

  /**
   * The offset is read per bucket, so a window spanning a clock change files
   * both halves correctly. Both of these are 08:00 local in London; one is BST
   * and one is GMT, and a single offset applied to the window would put one of
   * them an hour out.
   */
  it("files both sides of a clock change at the hour each one was", () => {
    const { grid } = buildHeatmapGrid(
      [
        at("2026-07-02T07"), // 08:00 BST, a Thursday
        at("2026-01-01T08"), // 08:00 GMT, a Thursday
      ],
      "Europe/London",
    );

    expect(grid[3]![8]).toBe(2);
  });

  it("adds up repeat visits in the same hour", () => {
    const { grid, total } = buildHeatmapGrid(
      [at("2026-09-03T01", 0, 5), at("2026-09-03T01", 3, 4)],
      "Asia/Kolkata",
    );

    // 01:00 and 01:45 UTC are both 06:xx and 07:xx IST respectively.
    expect(grid[3]![6]! + grid[3]![7]!).toBe(9);
    expect(total).toBe(9);
  });

  it("names the busiest hour and day", () => {
    const { busiestHour, busiestDay } = buildHeatmapGrid(
      [
        at("2026-09-03T13", 0, 10), // Thu 18:30 IST
        at("2026-09-03T01", 0, 2), // Thu 06:30 IST
        at("2026-09-04T13", 0, 3), // Fri 18:30 IST
      ],
      "Asia/Kolkata",
    );

    expect(busiestHour).toBe(18);
    expect(busiestDay).toBe(3);
  });

  it("has no busiest anything when nobody came", () => {
    const { grid, total, busiestHour, busiestDay } = buildHeatmapGrid([], "Asia/Kolkata");

    expect(total).toBe(0);
    expect(busiestHour).toBeNull();
    expect(busiestDay).toBeNull();
    expect(grid).toHaveLength(7);
    expect(grid[0]).toHaveLength(24);
  });

  /**
   * A zone the runtime cannot read is a settings mistake. Counting those visits
   * at their UTC hour would be worse than not counting them: the chart would
   * look complete and describe hours nobody trained in.
   */
  it("sets aside visits it cannot place rather than guessing", () => {
    const { total, unplaced, grid } = buildHeatmapGrid([at("2026-09-03T06", 0, 4)], "Mars/Olympus");

    expect(total).toBe(0);
    expect(unplaced).toBe(4);
    expect(grid.flat().every((cell) => cell === 0)).toBe(true);
  });

  it("sets aside a bucket key it cannot parse", () => {
    const { total, unplaced } = buildHeatmapGrid([at("not-a-timestamp", 0, 3)], "Asia/Kolkata");

    expect(total).toBe(0);
    expect(unplaced).toBe(3);
  });
});

describe("buildOccupancyGrid", () => {
  /**
   * 2026-09-03 was a Thursday. 01:10–02:40 UTC is 06:40–08:10 in India, so the
   * visit covers twenty minutes of the 6am hour, all of 7am and ten minutes of
   * 8am. Over one week that is a third of a person, one person, and a sixth.
   */
  it("spreads a visit across the local hours it covered", () => {
    const { grid, peakDay, peakHour, averageStayMinutes, sessions } = buildOccupancyGrid(
      [
        {
          checkInAt: new Date("2026-09-03T01:10:00.000Z"),
          checkOutAt: new Date("2026-09-03T02:40:00.000Z"),
          open: false,
        },
      ],
      "Asia/Kolkata",
      1,
    );

    expect(sessions).toBe(1);
    expect(grid[3]![6]).toBe(0.3);
    expect(grid[3]![7]).toBe(1);
    expect(grid[3]![8]).toBe(0.2);
    expect([peakDay, peakHour]).toEqual([3, 7]);
    expect(averageStayMinutes).toBe(90);
  });

  it("averages over the weeks in the window", () => {
    const visit = {
      checkInAt: new Date("2026-09-03T01:30:00.000Z"), // 07:00 IST
      checkOutAt: new Date("2026-09-03T02:30:00.000Z"), // 08:00 IST
      open: false,
    };
    const { grid } = buildOccupancyGrid([visit, visit], "Asia/Kolkata", 4);

    // Two people for an hour, once in four weeks: half a person on average.
    expect(grid[3]![7]).toBe(0.5);
  });

  it("counts somebody still inside up to now, and leaves out a visit nobody closed", () => {
    const now = new Date("2026-09-03T02:00:00.000Z"); // 07:30 IST
    const { grid, sessions, withoutCheckout, averageStayMinutes } = buildOccupancyGrid(
      [
        { checkInAt: new Date("2026-09-03T01:30:00.000Z"), checkOutAt: null, open: true },
        { checkInAt: new Date("2026-09-02T01:30:00.000Z"), checkOutAt: null, open: false },
      ],
      "Asia/Kolkata",
      1,
      now,
    );

    expect(sessions).toBe(1);
    expect(withoutCheckout).toBe(1);
    expect(grid[3]![7]).toBe(0.5);
    // An open visit has no length yet, so it does not move the average stay.
    expect(averageStayMinutes).toBeNull();
  });

  it("refuses a span too long to be one visit", () => {
    const { sessions, withoutCheckout } = buildOccupancyGrid(
      [
        {
          checkInAt: new Date("2026-09-03T01:30:00.000Z"),
          checkOutAt: new Date("2026-09-03T12:30:00.000Z"),
          open: false,
        },
      ],
      "Asia/Kolkata",
      1,
    );

    expect(sessions).toBe(0);
    expect(withoutCheckout).toBe(1);
  });
});
