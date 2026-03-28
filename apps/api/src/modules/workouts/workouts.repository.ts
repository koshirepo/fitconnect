/**
 * Documentation: Workouts repository.
 *
 * - Encapsulates Prisma queries for workout plan creation, assignment, and member program visibility, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: workoutRepository.
 */
import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

export const workoutRepository = {
  /**
   * Run the `find membership` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
  },

  /**
   * Run the `list plans` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `create plan` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `find plan` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findPlan(planId: string, tenantId: string) {
    return prisma.workoutPlan.findFirst({
      where: { id: planId, tenantId },
    });
  },

  /**
   * Run the `find plan detail` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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

  /**
   * Run the `update plan` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updatePlan(planId: string, data: Record<string, unknown>) {
    return prisma.workoutPlan.update({
      where: { id: planId },
      data,
      select: { id: true, title: true, description: true, exercises: true, updatedAt: true },
    });
  },

  /**
   * Run the `delete plan` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deletePlan(planId: string) {
    return prisma.workoutPlan.delete({ where: { id: planId } });
  },

  /**
   * Run the `find active membership` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findActiveMembership(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
    });
  },

  /**
   * Run the `find assignment` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findAssignment(planId: string, membershipId: string) {
    return prisma.workoutPlanAssignment.findUnique({
      where: { planId_membershipId: { planId, membershipId } },
    });
  },

  /**
   * Run the `create assignment` persistence operation for the workouts module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createAssignment(planId: string, membershipId: string) {
    return prisma.workoutPlanAssignment.create({
      data: { planId, membershipId },
      select: { id: true, assignedAt: true },
    });
  },
};
