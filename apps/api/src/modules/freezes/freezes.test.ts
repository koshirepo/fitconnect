/**
 * Documentation: Tests for the freeze rules F1–F9.
 *
 * - The arithmetic is the point. A freeze is counted in whole days across a half-open term window, booked optimistically and corrected downward when it ends early — three places where an off-by-one silently gives a member a free day or takes a paid one away, and none of it was covered.
 * - Prisma and the payment repository are mocked. What is under test is the decisions the service makes and the dates it computes, not Prisma's query shape.
 * - The clock is fixed, because every rule here is relative to "today" and a test that passes in June and fails in December is worse than no test.
 */
import { beforeEach, afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    tenantMembership: { findFirst: vi.fn() },
    payment: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    membershipFreeze: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../payments/payments.repository", () => ({
  paymentRepository: { refreshDueDate: vi.fn() },
}));

import { freezeService } from "./freezes.service";
import { prisma } from "../../lib/prisma";
import { paymentRepository } from "../payments/payments.repository";

const db = vi.mocked(prisma, { deep: true });
const payments = vi.mocked(paymentRepository);

/** Midday, so nothing depends on a time-of-day rounding either way. */
const NOW = new Date("2026-06-15T10:30:00.000Z");

/** A UTC midnight date, the granularity every freeze is measured in. */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** The term a freeze extends: a 3-month plan allowing 20 days across 2 freezes. */
function termPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay_1",
    validUntil: day("2026-07-31"),
    subscription: {
      id: "sub_1",
      title: "3 Month",
      freezeDays: 20,
      freezeCount: 2,
    },
    ...overrides,
  };
}

function activeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_1",
    status: "ACTIVE",
    dueDate: day("2026-07-31"),
    ...overrides,
  };
}

/** Wire the reads `create` makes, in the order it makes them. */
function arrange({
  membership = activeMembership(),
  payment = termPayment(),
  existing = [] as unknown[],
}: {
  membership?: unknown;
  payment?: unknown;
  existing?: unknown[];
} = {}) {
  db.tenantMembership.findFirst.mockResolvedValue(membership as never);
  db.payment.findFirst.mockResolvedValue(payment as never);
  db.membershipFreeze.findMany.mockResolvedValue(existing as never);
  db.membershipFreeze.create.mockResolvedValue({ id: "frz_new" } as never);
  db.payment.update.mockResolvedValue({} as never);
  payments.refreshDueDate.mockResolvedValue(undefined as never);
}

const create = (input: Partial<Parameters<typeof freezeService.create>[2]> = {}) =>
  freezeService.create(
    "gym_1",
    "mem_1",
    { startsOn: day("2026-06-15"), days: 3, ...input },
    "user_staff",
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("booking a freeze", () => {
  it("counts days inclusively and extends the term by exactly that many", async () => {
    arrange();

    const result = await create({ startsOn: day("2026-06-15"), days: 3 });

    expect("data" in result).toBe(true);
    if (!("data" in result)) return;

    // The 15th to the 17th is three days, not two.
    expect(db.membershipFreeze.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startsOn: day("2026-06-15"),
          plannedEndsOn: day("2026-06-17"),
          daysUsed: 3,
        }),
      }),
    );

    // F6: onto the payment's own window, and by the booked count.
    expect(result.data.newTermEndsOn).toEqual(day("2026-08-03"));
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { validUntil: day("2026-08-03") },
    });
    expect(payments.refreshDueDate).toHaveBeenCalledWith("mem_1");
  });

  it("F3: refuses anything shorter than three days", async () => {
    arrange();

    const result = await create({ days: 2 });

    expect(result).toMatchObject({ status: 400 });
    expect(db.membershipFreeze.create).not.toHaveBeenCalled();
  });

  it("F5: refuses a start date in the past", async () => {
    arrange();

    const result = await create({ startsOn: day("2026-06-01") });

    expect(result).toMatchObject({ status: 400 });
    expect(db.membershipFreeze.create).not.toHaveBeenCalled();
  });

  it("F5: allows backdating when the caller overrides", async () => {
    arrange();

    const result = await create({ startsOn: day("2026-06-01"), allowBackdate: true });

    expect("data" in result).toBe(true);
    expect(db.membershipFreeze.create).toHaveBeenCalled();
  });

  it.each([
    ["suspended", activeMembership({ status: "SUSPENDED" })],
    ["lapsed", activeMembership({ dueDate: day("2026-06-01") })],
  ])("F4: refuses a %s membership", async (_label, membership) => {
    arrange({ membership });

    expect(await create()).toMatchObject({ status: 400 });
    expect(db.membershipFreeze.create).not.toHaveBeenCalled();
  });

  it("F4: refuses a second freeze overlapping one already booked", async () => {
    arrange({
      existing: [
        { id: "frz_1", daysUsed: 5, endedOn: null, plannedEndsOn: day("2026-06-20") },
      ],
    });

    const result = await create({ startsOn: day("2026-06-18"), days: 3 });

    expect(result).toMatchObject({ status: 409 });
    expect(db.membershipFreeze.create).not.toHaveBeenCalled();
  });

  it("F1: refuses more days than the term has left", async () => {
    arrange({
      existing: [
        { id: "frz_1", daysUsed: 18, endedOn: day("2026-06-01"), plannedEndsOn: day("2026-06-01") },
      ],
    });

    // 18 of 20 used, so 2 remain and even the 3-day minimum will not fit.
    const result = await create({ days: 5 });

    expect(result).toMatchObject({ status: 400 });
    expect(db.membershipFreeze.create).not.toHaveBeenCalled();
  });

  it("F1: refuses once the plan's freeze count is used up", async () => {
    arrange({
      existing: [
        { id: "frz_1", daysUsed: 3, endedOn: day("2026-05-05"), plannedEndsOn: day("2026-05-05") },
        { id: "frz_2", daysUsed: 3, endedOn: day("2026-06-05"), plannedEndsOn: day("2026-06-05") },
      ],
    });

    const result = await create({ days: 3 });

    expect(result).toMatchObject({ status: 400 });
    expect(db.membershipFreeze.create).not.toHaveBeenCalled();
  });

  it("refuses a plan carrying no freeze budget", async () => {
    arrange({
      payment: termPayment({
        subscription: { id: "sub_1", title: "Monthly", freezeDays: 0, freezeCount: 0 },
      }),
    });

    expect(await create()).toMatchObject({ status: 400 });
  });
});

describe("ending a freeze", () => {
  /** A freeze running from the 10th to the 19th: ten days, booked in full. */
  function running(overrides: Record<string, unknown> = {}) {
    return {
      id: "frz_1",
      membershipId: "mem_1",
      paymentId: "pay_1",
      startsOn: day("2026-06-10"),
      plannedEndsOn: day("2026-06-19"),
      endedOn: null,
      daysUsed: 10,
      ...overrides,
    };
  }

  function arrangeEnd(freeze: unknown, validUntil = day("2026-08-10")) {
    db.membershipFreeze.findFirst.mockResolvedValue(freeze as never);
    db.membershipFreeze.update.mockResolvedValue({} as never);
    db.payment.findUnique.mockResolvedValue({ validUntil } as never);
    db.payment.update.mockResolvedValue({} as never);
    payments.refreshDueDate.mockResolvedValue(undefined as never);
  }

  it("F7: returns the unused days and shortens the term to match", async () => {
    arrangeEnd(running());

    // Booked 10 from the 10th, back on the 15th: the 10th–15th is six days.
    const result = await freezeService.end("gym_1", "frz_1", day("2026-06-15"), "ENDED_EARLY");

    expect(result).toMatchObject({ data: { daysUsed: 6, daysReturned: 4 } });
    expect(db.membershipFreeze.update).toHaveBeenCalledWith({
      where: { id: "frz_1" },
      data: { endedOn: day("2026-06-15"), endedBy: "ENDED_EARLY", daysUsed: 6 },
    });
    // The four days never taken come back off the extension.
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { validUntil: day("2026-08-06") },
    });
  });

  it("cancels a freeze that never started and returns every day", async () => {
    arrangeEnd(
      running({ startsOn: day("2026-07-01"), plannedEndsOn: day("2026-07-10") }),
    );

    const result = await freezeService.end("gym_1", "frz_1", day("2026-06-15"), "ENDED_EARLY");

    expect(result).toMatchObject({ data: { daysUsed: 0, daysReturned: 10 } });
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { validUntil: day("2026-07-31") },
    });
  });

  it("returns nothing when it ran its full course", async () => {
    arrangeEnd(running());

    const result = await freezeService.end("gym_1", "frz_1", day("2026-06-19"), "ENDED_EARLY");

    expect(result).toMatchObject({ data: { daysUsed: 10, daysReturned: 0 } });
    expect(db.payment.update).not.toHaveBeenCalled();
  });

  it("refuses to end a freeze twice", async () => {
    arrangeEnd(running({ endedOn: day("2026-06-14") }));

    expect(
      await freezeService.end("gym_1", "frz_1", day("2026-06-15"), "ENDED_EARLY"),
    ).toMatchObject({ status: 409 });
  });

  it("F8: attending ends the freeze the day before, so the training day is not frozen", async () => {
    // Two reads: `endForAttendance` finds the covering freeze, then `end`
    // loads it in full.
    db.membershipFreeze.findFirst
      .mockResolvedValueOnce({ id: "frz_1" } as never)
      .mockResolvedValueOnce(running() as never);
    db.membershipFreeze.update.mockResolvedValue({} as never);
    db.payment.findUnique.mockResolvedValue({ validUntil: day("2026-08-10") } as never);
    db.payment.update.mockResolvedValue({} as never);

    await freezeService.endForAttendance("gym_1", "mem_1", day("2026-06-15"));

    // Ended on the 14th: the 10th–14th is five frozen days, and the 15th —
    // the day they walked in — is a training day, not a frozen one.
    expect(db.membershipFreeze.update).toHaveBeenCalledWith({
      where: { id: "frz_1" },
      data: { endedOn: day("2026-06-14"), endedBy: "ATTENDED", daysUsed: 5 },
    });
    // Five of the ten booked days go back, and the term shortens to match.
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: "pay_1" },
      data: { validUntil: day("2026-08-05") },
    });
  });

  it("F8: does nothing when the member is not frozen", async () => {
    db.membershipFreeze.findFirst.mockResolvedValue(null as never);

    expect(await freezeService.endForAttendance("gym_1", "mem_1", day("2026-06-15"))).toBeNull();
    expect(db.membershipFreeze.update).not.toHaveBeenCalled();
  });
});

describe("reporting status", () => {
  function arrangeStatus(freezes: unknown[]) {
    db.payment.findFirst.mockResolvedValue(termPayment() as never);
    db.membershipFreeze.findMany.mockResolvedValue(freezes as never);
  }

  it("counts a freeze running today as current", async () => {
    arrangeStatus([
      {
        id: "frz_1",
        startsOn: day("2026-06-10"),
        plannedEndsOn: day("2026-06-20"),
        endedOn: null,
        daysUsed: 11,
      },
    ]);

    const { data } = await freezeService.getStatus("gym_1", "mem_1");

    expect(data.currentFreeze?.id).toBe("frz_1");
    expect(data.scheduledFreeze).toBeNull();
  });

  /**
   * The bug this pair exists for: a freeze booked for next month was reported
   * as the current one, so the card said "Frozen" while `isFrozen` — which
   * always checked the start date — let the member buy a new term.
   */
  it("reports a freeze booked for later as scheduled, not current", async () => {
    arrangeStatus([
      {
        id: "frz_future",
        startsOn: day("2026-07-01"),
        plannedEndsOn: day("2026-07-10"),
        endedOn: null,
        daysUsed: 10,
      },
    ]);

    const { data } = await freezeService.getStatus("gym_1", "mem_1");

    expect(data.currentFreeze).toBeNull();
    expect(data.scheduledFreeze?.id).toBe("frz_future");
  });

  it("agrees with isFrozen about a freeze that has not started", async () => {
    db.membershipFreeze.findFirst.mockResolvedValue(null as never);

    expect(await freezeService.isFrozen("gym_1", "mem_1")).toBe(false);
  });

  it("spends the budget across every freeze on the term", async () => {
    arrangeStatus([
      { id: "a", startsOn: day("2026-05-01"), plannedEndsOn: day("2026-05-05"), endedOn: day("2026-05-05"), daysUsed: 5 },
      { id: "b", startsOn: day("2026-06-01"), plannedEndsOn: day("2026-06-04"), endedOn: day("2026-06-04"), daysUsed: 4 },
    ]);

    const { data } = await freezeService.getStatus("gym_1", "mem_1");

    expect(data.usedDays).toBe(9);
    expect(data.remainingDays).toBe(11);
    expect(data.usedFreezes).toBe(2);
  });

  it("offers nothing when the member has no term", async () => {
    db.payment.findFirst.mockResolvedValue(null as never);

    const { data } = await freezeService.getStatus("gym_1", "mem_1");

    expect(data).toMatchObject({ canFreeze: false, allowanceDays: 0, currentFreeze: null });
  });
});
