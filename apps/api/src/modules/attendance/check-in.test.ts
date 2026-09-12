/**
 * Documentation: Tests for the five ways attendance gets marked.
 *
 * - Every entry point — self check-in, the QR poster, a scanned ID card, a staff mark (single and bulk), and the wall-mounted RFID machine — funnels through `attendanceService.commitCheckIn`. These tests exist to keep it that way: they assert the behaviour that must hold regardless of which door a visit came through, because three of these paths had already drifted apart once.
 * - The repository and the freeze service are mocked. What is under test is the decisions the service layer makes, not Prisma's query shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./attendance.repository", () => ({
  attendanceRepository: {
    findTenantByLookup: vi.fn(),
    findMembershipForCheckIn: vi.fn(),
    findMembershipForCheckInByUserId: vi.fn(),
    findMembershipsForCheckIn: vi.fn(),
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

import { attendanceService } from "./attendance.service";
import { attendanceRepository } from "./attendance.repository";
import { freezeService } from "../freezes/freezes.service";
import { iclockService } from "./iclock.service";

const repo = vi.mocked(attendanceRepository);
const freezes = vi.mocked(freezeService);

/** A gym whose platform access is in good standing. */
function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "gym_1",
    name: "Iron House",
    slug: "iron-house",
    logoUrl: null,
    platformExpiresAt: null,
    timezone: "Asia/Kolkata",
    ...overrides,
  };
}

/** A member, with the boring fields filled in. */
function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_1",
    memberId: 42,
    status: "ACTIVE",
    userId: "user_1",
    user: { id: "user_1", name: "Asha", avatarUrl: null },
    ...overrides,
  };
}

/** The session the repository hands back after recording a punch. */
function attendanceRow() {
  return {
    id: "att_1",
    date: new Date("2026-09-03T00:00:00.000Z"),
    checkInAt: new Date("2026-09-03T09:15:00.000Z"),
    checkOutAt: null,
    shiftId: null,
    shiftKey: "none",
    note: null,
  };
}

const DEVICE = { id: "dev_1", tenantId: "gym_1", timezone: "Asia/Kolkata" };

function punch(overrides: Record<string, unknown> = {}) {
  return {
    pin: "7",
    timestamp: "2026-09-03 09:15:00",
    status: "0",
    verifyMode: "4",
    ...overrides,
  };
}

/** Arm every lookup with the same member, so each path can find them its own way. */
function armLookups() {
  repo.findTenantByLookup.mockResolvedValue(tenant() as never);
  repo.findMembershipForCheckIn.mockResolvedValue(membership() as never);
  repo.findMembershipForCheckInByUserId.mockResolvedValue(membership() as never);
  repo.findMembershipsForCheckIn.mockResolvedValue([membership()] as never);
  repo.findMembershipsByDevicePins.mockResolvedValue([
    { ...membership(), deviceUserPin: 7 },
  ] as never);
  // No shifts defined: every punch resolves to a shiftless visit, which is what
  // these tests are about — the doors, not the windows.
  repo.findActiveShifts.mockResolvedValue([] as never);
  repo.recordPunch.mockResolvedValue({
    session: attendanceRow(),
    direction: "CHECKED_IN",
  } as never);
  freezes.endForAttendance.mockResolvedValue(null as never);
}

/**
 * The four doors, each invoked the way its route invokes it.
 *
 * A path's entry here says only how that path finds somebody — which is the
 * only thing that is allowed to differ between them.
 */
const PATHS = [
  {
    name: "self check-in",
    run: () => attendanceService.markAttendance("gym_1", "user_1", null, {}, true),
  },
  {
    name: "the QR poster",
    run: () =>
      attendanceService.markQrAttendance("iron-house", "user_1", { membershipId: "mem_1" }),
  },
  {
    name: "a staff mark",
    run: () =>
      attendanceService.markAttendance(
        "gym_1",
        "staff_user",
        "staff_1",
        { membershipId: "mem_1" },
        false,
      ),
  },
  {
    name: "a bulk staff mark",
    run: () => attendanceService.markAll("gym_1", "staff_1", { membershipIds: ["mem_1"] }),
  },
  {
    name: "the RFID machine",
    run: () => iclockService.recordPunches(DEVICE, [punch() as never]),
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  armLookups();
});

describe("every path records the visit", () => {
  it.each(PATHS)("$name writes exactly one attendance row", async ({ run }) => {
    await run();
    expect(repo.recordPunch).toHaveBeenCalledTimes(1);
  });

  /**
   * The bug this refactor existed to fix. Three of these paths wrote straight
   * to the repository and never ended the freeze, so a member on a paused plan
   * could train and keep accruing frozen days.
   */
  it.each(PATHS)("$name ends a freeze covering that day", async ({ run }) => {
    await run();
    expect(freezes.endForAttendance).toHaveBeenCalledWith("gym_1", "mem_1", expect.any(Date));
  });
});

describe("a gym past its platform expiry", () => {
  beforeEach(() => {
    repo.findTenantByLookup.mockResolvedValue(
      tenant({ platformExpiresAt: new Date("2020-01-01T00:00:00.000Z") }) as never,
    );
  });

  /** It used to guard the QR route alone, which made it trivially bypassable. */
  it.each(PATHS)("$name records nothing", async ({ run }) => {
    await run();
    expect(repo.recordPunch).not.toHaveBeenCalled();
  });

  it.each(PATHS.filter((path) => path.name !== "the RFID machine"))(
    "$name refuses with 403",
    async ({ run }) => {
      const result = (await run()) as { status?: number; error?: string };
      expect(result.status).toBe(403);
      expect(result.error).toMatch(/expired/i);
    },
  );

  /**
   * The device is the exception, deliberately: a machine on a wall that is told
   * "no" asks again forever. It is answered normally and told nothing.
   */
  it("does not refuse the RFID machine, it just drops the punches", async () => {
    const result = await iclockService.recordPunches(DEVICE, [punch() as never]);
    expect(result).toMatchObject({ marked: 0, received: 1 });
  });
});

describe("a membership that is not active", () => {
  beforeEach(() => {
    const lapsed = membership({ status: "EXPIRED" });
    repo.findMembershipForCheckIn.mockResolvedValue(lapsed as never);
    repo.findMembershipForCheckInByUserId.mockResolvedValue(lapsed as never);
    repo.findMembershipsForCheckIn.mockResolvedValue([lapsed] as never);
    repo.findMembershipsByDevicePins.mockResolvedValue([
      { ...lapsed, deviceUserPin: 7 },
    ] as never);
  });

  /**
   * The member is standing in the building. The visit is a fact about that, not
   * a statement about whether their plan is paid up.
   */
  it.each(PATHS)("$name still records the visit", async ({ run }) => {
    await run();
    expect(repo.recordPunch).toHaveBeenCalledTimes(1);
  });

  it.each(
    PATHS.filter((path) => !path.name.includes("bulk") && path.name !== "the RFID machine"),
  )("$name reports the status back so the desk can see it", async ({ run }) => {
    const result = (await run()) as { data: { member: { status: string } } };
    expect(result.data.member.status).toBe("EXPIRED");
  });
});

describe("marking a whole room", () => {
  it("reports the ids it could not mark instead of failing silently", async () => {
    repo.findMembershipsForCheckIn.mockResolvedValue([membership()] as never);

    const result = (await attendanceService.markAll("gym_1", "staff_1", {
      membershipIds: ["mem_1", "mem_from_another_gym"],
    })) as { data: { marked: number; total: number; failed: string[] } };

    expect(result.data).toEqual({
      marked: 1,
      total: 2,
      failed: ["mem_from_another_gym"],
    });
  });

  /** A member who does not belong to this gym must not get a row. */
  it("writes nothing for an id outside the gym", async () => {
    repo.findMembershipsForCheckIn.mockResolvedValue([] as never);

    await attendanceService.markAll("gym_1", "staff_1", {
      membershipIds: ["mem_from_another_gym"],
    });

    expect(repo.recordPunch).not.toHaveBeenCalled();
  });

  it("resolves the gym once, not once per member", async () => {
    repo.findMembershipsForCheckIn.mockResolvedValue([
      membership({ id: "mem_1" }),
      membership({ id: "mem_2" }),
      membership({ id: "mem_3" }),
    ] as never);

    await attendanceService.markAll("gym_1", "staff_1", {
      membershipIds: ["mem_1", "mem_2", "mem_3"],
    });

    expect(repo.findTenantByLookup).toHaveBeenCalledTimes(1);
    expect(repo.recordPunch).toHaveBeenCalledTimes(3);
  });
});

describe("who is recorded as having marked it", () => {
  /**
   * The one thing that is supposed to differ between paths. A member acting on
   * their own behalf, and a machine reading a card, leave it null.
   */
  it("is nobody for a self check-in", async () => {
    await attendanceService.markAttendance("gym_1", "user_1", null, {}, true);
    expect(repo.recordPunch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "gym_1",
        membershipId: "mem_1",
        markedById: null,
        note: undefined,
      }),
    );
  });

  it("is nobody for the QR poster", async () => {
    await attendanceService.markQrAttendance("iron-house", "user_1", { membershipId: "mem_1" });
    expect(repo.recordPunch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "gym_1",
        membershipId: "mem_1",
        markedById: null,
        note: undefined,
      }),
    );
  });

  it("is the staff member for a hand-marked visit", async () => {
    await attendanceService.markAttendance(
      "gym_1",
      "staff_user",
      "staff_1",
      { membershipId: "mem_1" },
      false,
    );
    expect(repo.recordPunch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "gym_1",
        membershipId: "mem_1",
        markedById: "staff_1",
        note: undefined,
      }),
    );
  });

  it("is nobody for a punch on the wall device", async () => {
    await iclockService.recordPunches(DEVICE, [punch() as never]);
    expect(repo.recordPunch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "gym_1",
        membershipId: "mem_1",
        markedById: null,
        note: expect.stringContaining("RFID"),
      }),
    );
  });
});

describe("the same member on the same day", () => {
  /**
   * Only one row can exist, but that is the upsert's unique constraint doing
   * the work and a mocked repository cannot show it. What the service controls
   * is the key — so this asserts every path asks for the same one, which is the
   * part that would actually break.
   */
  it("is addressed by the same key whichever path marks them", async () => {
    for (const path of PATHS) {
      vi.clearAllMocks();
      armLookups();

      await path.run();

      const [call] = repo.recordPunch.mock.calls[0]!;
      expect(
        [call.tenantId, call.membershipId],
        `${path.name} addressed a different row`,
      ).toEqual(["gym_1", "mem_1"]);
    }
  });
});

describe("refusals", () => {
  it("tells somebody who is not a member of this gym that they are not", async () => {
    repo.findMembershipForCheckInByUserId.mockResolvedValue(null as never);
    const result = (await attendanceService.markAttendance("gym_1", "stranger", null, {}, true)) as {
      status: number;
    };
    expect(result.status).toBe(403);
  });

  it("asks the QR page who is checking in when nobody was picked", async () => {
    const result = (await attendanceService.markQrAttendance("iron-house", "user_1", {})) as {
      status: number;
    };
    expect(result.status).toBe(400);
    expect(repo.recordPunch).not.toHaveBeenCalled();
  });

  it("reports a gym that does not exist as not found", async () => {
    repo.findTenantByLookup.mockResolvedValue(null as never);
    const result = (await attendanceService.markAttendance("nope", "user_1", null, {}, true)) as {
      status: number;
    };
    expect(result.status).toBe(404);
  });
});

describe("a card the gym has not enrolled", () => {
  it("is counted rather than recorded, so the desk can see the gap", async () => {
    repo.findMembershipsByDevicePins.mockResolvedValue([] as never);
    const result = await iclockService.recordPunches(DEVICE, [punch() as never]);
    expect(result).toMatchObject({ marked: 0, unmapped: 1 });
    expect(repo.recordPunch).not.toHaveBeenCalled();
  });

  it("does not stop the rest of the batch from being recorded", async () => {
    repo.findMembershipsByDevicePins.mockResolvedValue([
      { ...membership(), deviceUserPin: 7 },
    ] as never);

    const result = await iclockService.recordPunches(DEVICE, [
      punch({ pin: "7" }) as never,
      punch({ pin: "999" }) as never,
    ]);

    expect(result).toMatchObject({ marked: 1, unmapped: 1, received: 2 });
  });

  it("counts a punch whose timestamp cannot be read rather than guessing at it", async () => {
    const result = await iclockService.recordPunches(DEVICE, [
      punch({ timestamp: "not-a-date" }) as never,
    ]);
    expect(result).toMatchObject({ marked: 0, unreadable: 1 });
    expect(repo.recordPunch).not.toHaveBeenCalled();
  });
});
