/**
 * Documentation: Which session a punch lands in, driven through the wall device.
 *
 * - `shift-window.test.ts` proves the window arithmetic in isolation. This proves the thing that actually matters to a gym: that a real punch, arriving from a real reader, is filed against the right shift on the right day.
 * - The case that prompted all of this is the last one here. Somebody checks in for the morning shift and never checks out; that evening they tap again. The evening tap must open the evening shift's session, not close the morning's twelve hours late — which is exactly what a single row per day could not express.
 * - The repository is mocked, so what is asserted is the *key* the service asks for. Whether two keys become two rows is the unique constraint's job, and a mocked repository cannot show it; whether the service asks for two different keys is the part that would actually break.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./attendance.repository", () => ({
  attendanceRepository: {
    findTenantByLookup: vi.fn(),
    findMembershipsByDevicePins: vi.fn(),
    findActiveShifts: vi.fn(),
    recordPunch: vi.fn(),
  },
}));

vi.mock("../freezes/freezes.service", () => ({
  freezeService: { endForAttendance: vi.fn() },
}));

vi.mock("../../lib/prisma", () => ({
  prisma: { attendanceDevice: { update: vi.fn() } },
}));

import { attendanceRepository } from "./attendance.repository";
import { freezeService } from "../freezes/freezes.service";
import { iclockService } from "./iclock.service";

const repo = vi.mocked(attendanceRepository);
const freezes = vi.mocked(freezeService);

const DEVICE = { id: "dev_1", tenantId: "gym_1", timezone: "Asia/Kolkata" };

const MORNING = { id: "shift_am", name: "Morning", startTime: "05:00", endTime: "10:00" };
const EVENING = { id: "shift_pm", name: "Evening", startTime: "17:00", endTime: "22:00" };
const NIGHT = { id: "shift_night", name: "Night", startTime: "22:00", endTime: "02:00" };

function punch(timestamp: string) {
  return { pin: "7", timestamp, status: "0", verifyMode: "4" };
}

/** Every punch in a test is the same member on the same reader. */
function arm(shifts: typeof MORNING[]) {
  repo.findTenantByLookup.mockResolvedValue({
    id: "gym_1",
    name: "Iron House",
    slug: "iron-house",
    logoUrl: null,
    platformExpiresAt: null,
    timezone: "Asia/Kolkata",
  } as never);

  repo.findMembershipsByDevicePins.mockResolvedValue([
    {
      id: "mem_1",
      memberId: 42,
      status: "ACTIVE",
      userId: "user_1",
      shiftId: null,
      deviceUserPin: 7,
      user: { id: "user_1", name: "Asha", avatarUrl: null },
    },
  ] as never);

  repo.findActiveShifts.mockResolvedValue(shifts as never);

  repo.recordPunch.mockResolvedValue({
    session: {
      id: "att_1",
      date: new Date("2026-09-03T00:00:00.000Z"),
      checkInAt: new Date("2026-09-03T00:30:00.000Z"),
      checkOutAt: null,
      shiftId: null,
      shiftKey: "none",
      note: null,
    },
    direction: "CHECKED_IN",
  } as never);

  freezes.endForAttendance.mockResolvedValue(null as never);
}

/** The arguments of the nth call to `recordPunch`. */
function callArgs(index: number) {
  return repo.recordPunch.mock.calls[index]![0];
}

/** A session's day, as a plain date. */
function dayOf(value: Date) {
  return value.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("a punch is filed against the shift it falls in", () => {
  it("files a morning tap under the morning shift", async () => {
    arm([MORNING, EVENING]);

    await iclockService.recordPunches(DEVICE, [punch("2026-09-03 06:00:00") as never]);

    expect(callArgs(0).shiftKey).toBe("shift_am");
    expect(callArgs(0).shiftId).toBe("shift_am");
    expect(dayOf(callArgs(0).day)).toBe("2026-09-03");
  });

  it("files an evening tap under the evening shift", async () => {
    arm([MORNING, EVENING]);

    await iclockService.recordPunches(DEVICE, [punch("2026-09-03 18:00:00") as never]);

    expect(callArgs(0).shiftKey).toBe("shift_pm");
  });

  it("records a tap outside every shift as a visit with no shift", async () => {
    arm([MORNING, EVENING]);

    await iclockService.recordPunches(DEVICE, [punch("2026-09-03 13:00:00") as never]);

    expect(callArgs(0).shiftKey).toBe("none");
    expect(callArgs(0).shiftId).toBeNull();
  });

  it("files the small hours of a night shift under the evening it began", async () => {
    arm([NIGHT]);

    await iclockService.recordPunches(DEVICE, [punch("2026-09-04 01:00:00") as never]);

    expect(callArgs(0).shiftKey).toBe("shift_night");
    // The tap happened on the 4th and belongs to the shift that opened on the 3rd.
    expect(dayOf(callArgs(0).day)).toBe("2026-09-03");
  });
});

describe("somebody who forgot to check out", () => {
  /**
   * The whole reason this exists.
   *
   * In at 06:00 for the morning shift, no check-out, and back at 18:00 for the
   * evening. The evening tap has to open the evening shift's session — closing
   * the morning one instead would record a twelve-hour visit that never
   * happened, and leave the evening unrecorded.
   */
  it("starts the next shift rather than closing the last one", async () => {
    arm([MORNING, EVENING]);

    await iclockService.recordPunches(DEVICE, [
      punch("2026-09-03 06:00:00") as never,
      punch("2026-09-03 18:00:00") as never,
    ]);

    expect(repo.recordPunch).toHaveBeenCalledTimes(2);

    const morning = callArgs(0);
    const evening = callArgs(1);

    expect(morning.shiftKey).toBe("shift_am");
    expect(evening.shiftKey).toBe("shift_pm");

    // Same member, same day, different session — which is what the old
    // one-row-per-day key made impossible.
    expect(evening.membershipId).toBe(morning.membershipId);
    expect(dayOf(evening.day)).toBe(dayOf(morning.day));
    expect(evening.shiftKey).not.toBe(morning.shiftKey);
  });

  it("keeps a second tap within the same shift on the same session", async () => {
    arm([MORNING, EVENING]);

    await iclockService.recordPunches(DEVICE, [
      punch("2026-09-03 06:00:00") as never,
      punch("2026-09-03 09:30:00") as never,
    ]);

    const first = callArgs(0);
    const second = callArgs(1);

    // The same key both times: the repository turns the later tap into this
    // session's check-out rather than opening another one.
    expect(second.shiftKey).toBe(first.shiftKey);
    expect(dayOf(second.day)).toBe(dayOf(first.day));
    expect(second.at.getTime()).toBeGreaterThan(first.at.getTime());
  });
});
