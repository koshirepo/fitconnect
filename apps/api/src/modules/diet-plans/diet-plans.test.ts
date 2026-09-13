/**
 * Documentation: Tests for diet plan totals and who may touch which plan.
 *
 * - Totals are arithmetic a member reads as fact — "2,300 kcal a day" — so a line's quantity being ignored, or one nutrient being summed into another, is worth catching here rather than on somebody's plate.
 * - Ownership is the other half: a member keeps their own plan, a coach tidies up only their own, and an admin reaches every plan in the gym. The repository is mocked; what is under test is the decisions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./diet-plans.repository", () => ({
  dietPlanRepository: {
    findMembership: vi.fn(),
    findPlan: vi.fn(),
    createPlan: vi.fn(),
    createAssignment: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    findActiveMembership: vi.fn(),
    findAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
  },
}));

import { dietPlanService, totalMeals, type DietPlanAccess } from "./diet-plans.service";
import { dietPlanRepository } from "./diet-plans.repository";

const repo = vi.mocked(dietPlanRepository);

const food = (overrides: Record<string, number> = {}) => ({
  name: "Oats",
  servingSize: 40,
  servingUnit: "g",
  quantity: 1,
  calories: 150,
  proteinGrams: 5,
  carbsGrams: 27,
  fatGrams: 2.5,
  fibreGrams: 4,
  ...overrides,
});

const member: DietPlanAccess = {
  userId: "user-member",
  role: "MEMBER",
  canCreateForOthers: false,
  canUpdateAny: false,
  canDeleteAny: false,
};
const coach: DietPlanAccess = {
  userId: "user-coach",
  role: "COACH",
  canCreateForOthers: true,
  canUpdateAny: true,
  canDeleteAny: false,
};
const admin: DietPlanAccess = {
  userId: "user-admin",
  role: "ADMIN",
  canCreateForOthers: true,
  canUpdateAny: true,
  canDeleteAny: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  // Every caller is a member of the gym, with a membership id derived from
  // their user id so a plan's `creatorId` reads plainly in each test.
  repo.findMembership.mockImplementation(((_tenantId: string, userId: string) =>
    Promise.resolve({ id: `m-${userId}`, userId })) as never);
});

describe("totalMeals", () => {
  it("multiplies each line by its quantity and sums every meal", () => {
    const totals = totalMeals([
      { name: "Breakfast", foods: [food({ quantity: 2 })] },
      { name: "Lunch", foods: [food({ calories: 400, proteinGrams: 30.25, quantity: 0.5 })] },
    ]);

    expect(totals).toEqual({
      calories: 500,
      proteinGrams: 25.1,
      carbsGrams: 67.5,
      fatGrams: 6.3,
      fibreGrams: 10,
    });
  });

  it("reads anything that is not a list of meals as an empty day", () => {
    expect(totalMeals(null)).toEqual({
      calories: 0,
      proteinGrams: 0,
      carbsGrams: 0,
      fatGrams: 0,
      fibreGrams: 0,
    });
  });
});

describe("createPlan", () => {
  it("assigns a member's own plan to them as it is saved", async () => {
    repo.createPlan.mockResolvedValue({ id: "plan-1", title: "Mine", createdAt: new Date() });

    await dietPlanService.createPlan("t1", member, { title: "Mine" });

    expect(repo.createAssignment).toHaveBeenCalledWith("plan-1", "m-user-member");
  });

  it("assigns a coach's plan to nobody", async () => {
    repo.createPlan.mockResolvedValue({ id: "plan-2", title: "Gym", createdAt: new Date() });

    await dietPlanService.createPlan("t1", coach, { title: "Gym" });

    expect(repo.createAssignment).not.toHaveBeenCalled();
  });
});

describe("updatePlan and deletePlan", () => {
  it("lets a member edit and delete a plan they wrote", async () => {
    repo.findPlan.mockResolvedValue({ id: "p", creatorId: "m-user-member" });

    expect("data" in (await dietPlanService.updatePlan("t1", "p", member, { title: "New" }))).toBe(
      true,
    );
    expect("data" in (await dietPlanService.deletePlan("t1", "p", member))).toBe(true);
  });

  it("refuses a member somebody else's plan", async () => {
    repo.findPlan.mockResolvedValue({ id: "p", creatorId: "m-user-coach" });

    expect(await dietPlanService.updatePlan("t1", "p", member, { title: "x" })).toMatchObject({
      status: 403,
    });
    expect(await dietPlanService.deletePlan("t1", "p", member)).toMatchObject({ status: 403 });
    expect(repo.updatePlan).not.toHaveBeenCalled();
    expect(repo.deletePlan).not.toHaveBeenCalled();
  });

  it("holds a coach to their own plans even with the edit grant", async () => {
    repo.findPlan.mockResolvedValue({ id: "p", creatorId: "m-user-admin" });

    expect(await dietPlanService.updatePlan("t1", "p", coach, { title: "x" })).toMatchObject({
      status: 403,
    });
    expect(await dietPlanService.deletePlan("t1", "p", coach)).toMatchObject({ status: 403 });
  });

  it("lets an admin change and delete any plan in the gym", async () => {
    repo.findPlan.mockResolvedValue({ id: "p", creatorId: "m-user-coach" });

    expect("data" in (await dietPlanService.updatePlan("t1", "p", admin, { title: "x" }))).toBe(
      true,
    );
    expect("data" in (await dietPlanService.deletePlan("t1", "p", admin))).toBe(true);
  });
});

describe("assignPlan", () => {
  it("refuses a second assignment of the same plan to the same member", async () => {
    repo.findPlan.mockResolvedValue({ id: "p", creatorId: "m-user-admin" });
    repo.findActiveMembership.mockResolvedValue({ id: "m-x" });
    repo.findAssignment.mockResolvedValue({ id: "a" });

    expect(await dietPlanService.assignPlan("t1", "p", "m-x", admin)).toMatchObject({
      status: 409,
    });
  });

  it("does not let a coach assign a plan they did not write", async () => {
    repo.findPlan.mockResolvedValue({ id: "p", creatorId: "m-user-admin" });

    expect(await dietPlanService.assignPlan("t1", "p", "m-x", coach)).toMatchObject({
      status: 403,
    });
    expect(repo.createAssignment).not.toHaveBeenCalled();
  });
});
