/**
 * Documentation: Diet plan service.
 *
 * - The rules behind a gym's diet plans: who sees which plans, who may change them, and what assigning means. Arranged like the workout service, so the two behave the same way.
 * - Visibility: a member sees the plans assigned to them — including the ones they wrote, which are assigned to them as they are saved. A coach sees the plans they wrote. Everybody else with the read grant sees the gym's plans.
 * - Ownership is decided from what the caller holds, not from their role alone. Somebody without the gym-wide edit or delete grant may only touch plans they wrote themselves, which is what lets a member keep their own plan and a coach tidy up their own without either reaching anybody else's.
 * - Totals are computed here from the meals, never stored: a line's nutrients times its quantity, summed.
 * - Primary exports: dietPlanService, totalMeals, type DietPlanAccess.
 */
import type { Prisma } from "../../generated/prisma/client";
import { dietPlanRepository } from "./diet-plans.repository";
import { flattenCreator } from "../../lib/flatten";
import type {
  CreateDietPlanInput,
  DietPlanMealInput,
  UpdateDietPlanInput,
} from "./diet-plans.schema";

/** What the caller holds, reduced to the questions this service asks. */
export type DietPlanAccess = {
  userId: string;
  role: string | undefined;
  /** `diet-plans:create` — writes plans for the gym rather than only for themselves. */
  canCreateForOthers: boolean;
  /** `diet-plans:update` — may edit plans written by somebody else. */
  canUpdateAny: boolean;
  /** `diet-plans:delete` — may delete plans written by somebody else. */
  canDeleteAny: boolean;
};

type ServiceError = { error: string; status: 403 | 404 | 409 };

const round1 = (value: number) => Math.round(value * 10) / 10;

/** What a plan's meals add up to over a day. */
export function totalMeals(meals: unknown) {
  const totals = { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fibreGrams: 0 };
  if (!Array.isArray(meals)) return totals;

  for (const meal of meals as DietPlanMealInput[]) {
    for (const food of meal?.foods ?? []) {
      const quantity = Number(food.quantity) || 0;
      totals.calories += (Number(food.calories) || 0) * quantity;
      totals.proteinGrams += (Number(food.proteinGrams) || 0) * quantity;
      totals.carbsGrams += (Number(food.carbsGrams) || 0) * quantity;
      totals.fatGrams += (Number(food.fatGrams) || 0) * quantity;
      totals.fibreGrams += (Number(food.fibreGrams) || 0) * quantity;
    }
  }

  return {
    calories: Math.round(totals.calories),
    proteinGrams: round1(totals.proteinGrams),
    carbsGrams: round1(totals.carbsGrams),
    fatGrams: round1(totals.fatGrams),
    fibreGrams: round1(totals.fibreGrams),
  };
}

export const dietPlanService = {
  async listPlans(tenantId: string, access: DietPlanAccess, page: number, limit: number) {
    const where: Prisma.DietPlanWhereInput = { tenantId };

    if (access.role === "MEMBER" || access.role === "COACH") {
      const membership = await dietPlanRepository.findMembership(tenantId, access.userId);
      if (!membership) return { data: { plans: [] }, total: 0 };

      if (access.role === "MEMBER") {
        where.assignments = { some: { membershipId: membership.id } };
      } else {
        where.creatorId = membership.id;
      }
    }

    const { plans, total } = await dietPlanRepository.listPlans(where, page, limit);

    return {
      data: {
        plans: plans.map(({ meals, creator, creatorId: _creatorId, ...plan }) => ({
          ...plan,
          creator: creator ? flattenCreator(creator) : undefined,
          mealCount: Array.isArray(meals) ? meals.length : 0,
          totals: totalMeals(meals),
        })),
      },
      total,
    };
  },

  async getPlan(tenantId: string, planId: string, access: DietPlanAccess) {
    const plan = await dietPlanRepository.findPlanDetail(planId, tenantId);
    if (!plan) return { error: "Diet plan not found.", status: 404 } satisfies ServiceError;

    if (access.role === "MEMBER" || access.role === "COACH") {
      const membership = await dietPlanRepository.findMembership(tenantId, access.userId);

      if (access.role === "MEMBER") {
        const isAssigned = plan.assignments.some((a) => a.membership.id === membership?.id);
        if (!isAssigned) {
          return { error: "Plan not assigned to you.", status: 403 } satisfies ServiceError;
        }
      } else if (plan.creatorId !== membership?.id) {
        return { error: "You can only view your own plans.", status: 403 } satisfies ServiceError;
      }
    }

    const { creatorId: _creatorId, creator, assignments, meals, ...rest } = plan;

    return {
      data: {
        plan: {
          ...rest,
          meals: (Array.isArray(meals) ? meals : []) as unknown as DietPlanMealInput[],
          totals: totalMeals(meals),
          creator: creator ? flattenCreator(creator) : undefined,
          assignments: assignments.map((a) => ({
            id: a.id,
            assignedAt: a.assignedAt,
            membershipId: a.membership.id,
            memberId: a.membership.memberId,
            memberName: a.membership.user.name,
          })),
        },
      },
    };
  },

  async createPlan(tenantId: string, access: DietPlanAccess, input: CreateDietPlanInput) {
    const membership = await dietPlanRepository.findMembership(tenantId, access.userId);
    if (!membership) {
      return { error: "Not a member of this gym.", status: 403 } satisfies ServiceError;
    }

    const plan = await dietPlanRepository.createPlan({
      tenantId,
      creatorId: membership.id,
      title: input.title,
      description: input.description ?? null,
      goal: input.goal ?? null,
      dietType: input.dietType ?? null,
      targetCalories: input.targetCalories ?? null,
      meals: input.meals ?? [],
    });

    /**
     * A member's own plan is assigned to them as it is written.
     *
     * A member's list is the plans assigned to them, so without this their own
     * plan would vanish the moment they saved it. A coach's plan is assigned to
     * nobody here: who it is for is a separate decision.
     */
    if (!access.canCreateForOthers) {
      await dietPlanRepository.createAssignment(plan.id, membership.id);
    }

    return { data: { plan } };
  },

  async updatePlan(
    tenantId: string,
    planId: string,
    access: DietPlanAccess,
    input: UpdateDietPlanInput,
  ) {
    const existing = await dietPlanRepository.findPlan(planId, tenantId);
    if (!existing) return { error: "Diet plan not found.", status: 404 } satisfies ServiceError;

    // Coaches edit their own plans, as with workouts; so does anybody without
    // the gym-wide edit grant.
    if (!access.canUpdateAny || access.role === "COACH") {
      const membership = await dietPlanRepository.findMembership(tenantId, access.userId);
      if (existing.creatorId !== membership?.id) {
        return { error: "You can only update your own plans.", status: 403 } satisfies ServiceError;
      }
    }

    const plan = await dietPlanRepository.updatePlan(planId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      ...(input.dietType !== undefined ? { dietType: input.dietType } : {}),
      ...(input.targetCalories !== undefined ? { targetCalories: input.targetCalories } : {}),
      ...(input.meals !== undefined ? { meals: input.meals as Prisma.InputJsonValue } : {}),
    });

    return { data: { plan } };
  },

  async deletePlan(tenantId: string, planId: string, access: DietPlanAccess) {
    const existing = await dietPlanRepository.findPlan(planId, tenantId);
    if (!existing) return { error: "Diet plan not found.", status: 404 } satisfies ServiceError;

    if (!access.canDeleteAny) {
      const membership = await dietPlanRepository.findMembership(tenantId, access.userId);
      if (existing.creatorId !== membership?.id) {
        return { error: "You can only delete your own plans.", status: 403 } satisfies ServiceError;
      }
    }

    await dietPlanRepository.deletePlan(planId);
    return { data: true };
  },

  async assignPlan(tenantId: string, planId: string, membershipId: string, access: DietPlanAccess) {
    const plan = await dietPlanRepository.findPlan(planId, tenantId);
    if (!plan) return { error: "Diet plan not found.", status: 404 } satisfies ServiceError;

    // A coach only ever sees their own plans, so they only assign those.
    if (access.role === "COACH") {
      const membership = await dietPlanRepository.findMembership(tenantId, access.userId);
      if (plan.creatorId !== membership?.id) {
        return { error: "You can only assign your own plans.", status: 403 } satisfies ServiceError;
      }
    }

    const target = await dietPlanRepository.findActiveMembership(membershipId, tenantId);
    if (!target) {
      return { error: "Member not found in this gym.", status: 404 } satisfies ServiceError;
    }

    if (await dietPlanRepository.findAssignment(planId, membershipId)) {
      return { error: "Plan already assigned to this member.", status: 409 } satisfies ServiceError;
    }

    const assignment = await dietPlanRepository.createAssignment(planId, membershipId);
    return { data: { assignment } };
  },

  async unassignPlan(
    tenantId: string,
    planId: string,
    membershipId: string,
    access: DietPlanAccess,
  ) {
    const plan = await dietPlanRepository.findPlan(planId, tenantId);
    if (!plan) return { error: "Diet plan not found.", status: 404 } satisfies ServiceError;

    if (access.role === "COACH") {
      const membership = await dietPlanRepository.findMembership(tenantId, access.userId);
      if (plan.creatorId !== membership?.id) {
        return { error: "You can only change your own plans.", status: 403 } satisfies ServiceError;
      }
    }

    const removed = await dietPlanRepository.deleteAssignment(planId, membershipId);
    if (!removed) {
      return { error: "That member does not have this plan.", status: 404 } satisfies ServiceError;
    }

    return { data: true };
  },
};
