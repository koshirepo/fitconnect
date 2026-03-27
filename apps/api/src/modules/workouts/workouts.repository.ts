import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

export const workoutRepository = {
  findMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
  },

  async listPlans(where: Prisma.WorkoutPlanWhereInput, page: number, limit: number) {
    const [plans, total] = await Promise.all([
      prisma.workoutPlan.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          creator: {
            select: { user: { select: { id: true, name: true } } },
          },
          _count: { select: { assignments: true } },
        },
      }),
      prisma.workoutPlan.count({ where }),
    ]);
    return { plans, total };
  },

  createPlan(data: {
    tenantId: string;
    creatorId: string;
    title: string;
    description?: string;
    exercises: unknown;
  }) {
    return prisma.workoutPlan.create({
      data: {
        tenantId: data.tenantId,
        creatorId: data.creatorId,
        title: data.title,
        description: data.description,
        exercises: (data.exercises ?? []) as Prisma.InputJsonValue,
      },
      select: { id: true, title: true, description: true, exercises: true, createdAt: true },
    });
  },

  findPlan(planId: string, tenantId: string) {
    return prisma.workoutPlan.findFirst({
      where: { id: planId, tenantId },
    });
  },

  findPlanDetail(planId: string, tenantId: string) {
    return prisma.workoutPlan.findFirst({
      where: { id: planId, tenantId },
      select: {
        id: true,
        title: true,
        description: true,
        exercises: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: { user: { select: { id: true, name: true } } },
        },
        assignments: {
          select: {
            id: true,
            assignedAt: true,
            membership: {
              select: {
                id: true,
                memberId: true,
                user: { select: { name: true } },
              },
            },
          },
          orderBy: { assignedAt: "desc" },
        },
        _count: { select: { assignments: true } },
      },
    });
  },

  updatePlan(planId: string, data: Record<string, unknown>) {
    return prisma.workoutPlan.update({
      where: { id: planId },
      data,
      select: { id: true, title: true, description: true, exercises: true, updatedAt: true },
    });
  },

  deletePlan(planId: string) {
    return prisma.workoutPlan.delete({ where: { id: planId } });
  },

  findActiveMembership(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
    });
  },

  findAssignment(planId: string, membershipId: string) {
    return prisma.workoutPlanAssignment.findUnique({
      where: { planId_membershipId: { planId, membershipId } },
    });
  },

  createAssignment(planId: string, membershipId: string) {
    return prisma.workoutPlanAssignment.create({
      data: { planId, membershipId },
      select: { id: true, assignedAt: true },
    });
  },
};
