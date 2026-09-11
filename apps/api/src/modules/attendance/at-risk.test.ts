/**
 * Documentation: Tests for the at-risk read.
 *
 * - The exclusions that keep this list trustworthy — freezes, recent joiners, inactive members — are enforced in SQL and are not what these cover. What is covered is everything the service decides after the rows come back: which day absence is counted from, and which of these people the desk should call first.
 * - `dueSoon` is asserted because it is the number that decides whether anybody opens the list at all. If it counts the wrong members it is worse than absent — it sends staff after the people who were going to renew anyway.
 * - The clock is pinned. A test that reads `new Date()` for a feature whose whole subject is which day it is would pass every day but one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./attendance.repository", () => ({
  attendanceRepository: {
    getTenantTimezone: vi.fn(),
    listAtRisk: vi.fn(),
    countActiveFreezes: vi.fn(),
  },
}));

vi.mock("../freezes/freezes.service", () => ({
  freezeService: { endForAttendance: vi.fn() },
}));

import { attendanceService } from "./attendance.service";
import { attendanceRepository } from "./attendance.repository";

const repo = vi.mocked(attendanceRepository);

/**
 * A row shaped the way the raw query really hands it over.
 *
 * Dates arrive as `Date` objects, not the ISO text the column holds: the Prisma
 * D1 adapter maps them back before `$queryRaw` returns, and it does so for the
 * `MAX()` aggregate as well. These fixtures claimed text at first, which is
 * exactly why the suite passed while the endpoint threw on its first real
 * request — a mock agrees with whatever it is told.
 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    membershipId: "mem_1",
    memberId: 42,
    name: "Asha",
    phone: "9876543210",
    avatarUrl: null,
    dueDate: null,
    joinedAt: new Date("2026-01-10T00:00:00.000Z"),
    lastVisitOn: new Date("2026-08-13T00:00:00.000Z"),
    lastNudgedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getTenantTimezone.mockResolvedValue({ timezone: "Asia/Kolkata" });
  repo.countActiveFreezes.mockResolvedValue(0);
  repo.listAtRisk.mockResolvedValue([]);

  // 20:00 UTC on the 3rd is already the 4th in India. Every expectation below
  // is written against the Indian day, which is the one the gym counts in.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-03T20:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("atRisk", () => {
  it("counts absence from the gym's day, not the UTC one", async () => {
    repo.listAtRisk.mockResolvedValue([row({ lastVisitOn: new Date("2026-08-13T00:00:00.000Z") })]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    // 13 Aug → 4 Sep is 22 days. Counted in UTC it would read 21, which is the
    // silent off-by-one this whole path exists to avoid.
    expect(data.members[0]!.absentDays).toBe(22);
    expect(data.members[0]!.lastVisitOn).toBe("2026-08-13");
  });

  it("asks for the window measured back from the gym's today", async () => {
    await attendanceService.atRisk("gym_1", 21);

    const [, absentSince, joinedBefore] = repo.listAtRisk.mock.calls[0]!;
    expect((absentSince as Date).toISOString()).toBe("2026-08-14T00:00:00.000Z");
    // Both bounds are the same instant: somebody who joined inside the window
    // cannot have been absent for it.
    expect((joinedBefore as Date).toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("reports a member who has never once checked in", async () => {
    repo.listAtRisk.mockResolvedValue([row({ lastVisitOn: null })]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.members[0]!.lastVisitOn).toBeNull();
    expect(data.members[0]!.absentDays).toBeNull();
  });

  it("counts the days to a renewal, and past one already missed", async () => {
    repo.listAtRisk.mockResolvedValue([
      row({ membershipId: "mem_1", dueDate: new Date("2026-09-10T00:00:00.000Z") }),
      row({ membershipId: "mem_2", dueDate: new Date("2026-08-30T00:00:00.000Z") }),
    ]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.members[0]!.daysToDue).toBe(6);
    expect(data.members[1]!.daysToDue).toBe(-5);
  });

  it("counts as due-soon only the members whose renewal is inside a fortnight", async () => {
    repo.listAtRisk.mockResolvedValue([
      // Due in six days: the call to make this morning.
      row({ membershipId: "mem_1", dueDate: new Date("2026-09-10T00:00:00.000Z") }),
      // Already overdue, which is still inside the fortnight looking forward.
      row({ membershipId: "mem_2", dueDate: new Date("2026-08-30T00:00:00.000Z") }),
      // Paid up for months. Absent, but not urgent.
      row({ membershipId: "mem_3", dueDate: new Date("2027-04-01T00:00:00.000Z") }),
      // On no term at all.
      row({ membershipId: "mem_4", dueDate: null }),
    ]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.summary.total).toBe(4);
    expect(data.summary.dueSoon).toBe(2);
  });

  it("passes through the freeze count as what was deliberately left out", async () => {
    repo.countActiveFreezes.mockResolvedValue(3);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.summary.frozen).toBe(3);
  });

  it("falls back to the default zone for a gym that has never set one", async () => {
    repo.getTenantTimezone.mockResolvedValue(null);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.summary.timezone).toBe("Asia/Kolkata");
  });

  it("reports when somebody last reached out, so the desk does not do it twice", async () => {
    repo.listAtRisk.mockResolvedValue([row({ lastNudgedAt: new Date("2026-09-01T09:12:00.000Z") })]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.members[0]!.lastNudgedOn).toBe("2026-09-01");
  });

  /**
   * The adapter's date mapping is its own decision, and one it could revise.
   * This pins the tolerance rather than today's behaviour: text has to keep
   * working, because a driver that stops parsing dates should not take the
   * report down with it.
   */
  it("reads a date the driver left as text", async () => {
    repo.listAtRisk.mockResolvedValue([
      row({
        lastVisitOn: "2026-08-13T00:00:00.000Z",
        dueDate: "2026-09-10T00:00:00.000Z",
        joinedAt: "2026-01-10T00:00:00.000Z",
      }),
    ]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.members[0]!.lastVisitOn).toBe("2026-08-13");
    expect(data.members[0]!.absentDays).toBe(22);
    expect(data.members[0]!.daysToDue).toBe(6);
    expect(data.members[0]!.joinedAt).toBe("2026-01-10");
  });

  it("normalises a member number the driver handed back as a bigint", async () => {
    repo.listAtRisk.mockResolvedValue([row({ memberId: 42n as unknown as number })]);

    const { data } = await attendanceService.atRisk("gym_1", 21);

    expect(data.members[0]!.memberId).toBe(42);
  });
});
