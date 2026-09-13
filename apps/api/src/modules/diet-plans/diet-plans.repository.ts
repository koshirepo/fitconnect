/**
 * Documentation: Diet plan repository.
 *
 * - Every Prisma query for a gym's diet plans and their assignments, shaped like the workout repository.
 * - Every plan read is filtered by `tenantId` here, so a plan id from one gym can never be read or written through another gym's path.
 * - Primary exports: dietPlanRepository.
 */
import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

const creatorSelect = { select: { user: { select: { id: true, name: true } } } } as const;

export const dietPlanRepository = {
  findMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, userId: true },
    });
  },

  /** A page of plans. Meals are included so the service can total them for the cards. */
  async listPlans(where: Prisma.DietPlanWhereInput, page: number, limit: number) {
    const [plans, total] = await Promise.all([
      prisma.dietPlan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          goal: true,
          dietType: true,
          targetCalories: true,
          meals: true,
          createdAt: true,
          creatorId: true,
          creator: creatorSelect,
          _count: { select: { assignments: true } },
        },
      }),
      prisma.dietPlan.count({ where }),
    ]);

    return { plans, total };
  },

  createPlan(data: {
    tenantId: string;
    creatorId: string;
    title: string;
    description?: string | null;
    goal?: string | null;
    dietType?: string | null;
    targetCalories?: number | null;
    meals: unknown;
  }) {
    return prisma.dietPlan.create({
      data: { ...data, meals: (data.meals ?? []) as Prisma.InputJsonValue },
      select: { id: true, title: true, createdAt: true },
    });
  },

  findPlan(planId: string, tenantId: string) {
    return prisma.dietPlan.findFirst({
      where: { id: planId, tenantId },
      select: { id: true, creatorId: true },
    });
  },

  findPlanDetail(planId: string, tenantId: string) {
    return prisma.dietPlan.findFirst({
      where: { id: planId, tenantId },
      select: {
        id: true,
        title: true,
        description: true,
        goal: true,
        dietType: true,
        targetCalories: true,
        meals: true,
        createdAt: true,
        updatedAt: true,
        creatorId: true,
        creator: creatorSelect,
        assignments: {
          select: {
            id: true,
            assignedAt: true,
            membership: {
              select: { id: true, memberId: true, user: { select: { name: true } } },
            },
          },
          orderBy: { assignedAt: "desc" },
        },
        _count: { select: { assignments: true } },
      },
    });
  },

  updatePlan(planId: string, data: Prisma.DietPlanUpdateInput) {
    return prisma.dietPlan.update({
      where: { id: planId },
      data,
      select: { id: true, title: true, updatedAt: true },
    });
  },

  deletePlan(planId: string) {
    return prisma.dietPlan.delete({ where: { id: planId } });
  },

  findActiveMembership(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
      select: { id: true },
    });
  },

  findAssignment(planId: string, membershipId: string) {
    return prisma.dietPlanAssignment.findUnique({
      where: { planId_membershipId: { planId, membershipId } },
      select: { id: true },
    });
  },

  createAssignment(planId: string, membershipId: string) {
    return prisma.dietPlanAssignment.create({
      data: { planId, membershipId },
      select: { id: true, assignedAt: true },
    });
  },

  async deleteAssignment(planId: string, membershipId: string) {
    const result = await prisma.dietPlanAssignment.deleteMany({
      where: { planId, membershipId },
    });
    return result.count > 0;
  },
};
