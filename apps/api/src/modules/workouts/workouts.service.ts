/**
 * Documentation: Workouts service.
 *
 * - Implements the business rules for workout plan creation, assignment, and member program visibility by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: workoutService.
 */
import type { Prisma } from "../../generated/prisma/client";
import { workoutRepository } from "./workouts.repository";
import { flattenCreator } from "../../lib/flatten";
import type { CreatePlanInput, UpdatePlanInput } from "./workouts.schema";

export const workoutService = {
  /**
   * Execute the `list plans` workflow for the workouts module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listPlans(
    tenantId: string,
    userId: string,
    role: string | undefined,
    page: number,
    limit: number,
  ) {
    const where: Prisma.WorkoutPlanWhereInput = { tenantId };

    // Members only see plans assigned to them
    if (role === "MEMBER") {
      const membership = await workoutRepository.findMembership(tenantId, userId);
      if (membership) {
        where.assignments = { some: { membershipId: membership.id } };
      }
    }

    // Coaches see only their created plans
    if (role === "COACH") {
      const membership = await workoutRepository.findMembership(tenantId, userId);
      if (membership) {
        where.creatorId = membership.id;
      }
    }

    const { plans, total } = await workoutRepository.listPlans(where, page, limit);
    const flat = plans.map((p) => ({
      ...p,
      creator: p.creator ? flattenCreator(p.creator) : undefined,
    }));
    return { data: { plans: flat }, total };
  },

  /**
   * Execute the `get plan` workflow for the workouts module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getPlan(tenantId: string, planId: string, userId: string, role: string | undefined) {
    const plan = await workoutRepository.findPlanDetail(planId, tenantId);
    if (!plan) {
      return { error: "Workout plan not found.", status: 404 as const };
    }

    // Members can only view plans assigned to them
    if (role === "MEMBER") {
      const membership = await workoutRepository.findMembership(tenantId, userId);
      const isAssigned = plan.assignments.some((a) => a.membership.id === membership?.id);
      if (!isAssigned) {
        return { error: "Plan not assigned to you.", status: 403 as const };
      }
    }

    // Coaches can only view their own plans
    if (role === "COACH") {
      const membership = await workoutRepository.findMembership(tenantId, userId);
      if (plan.creator && flattenCreator(plan.creator).id !== membership?.userId) {
        return { error: "You can only view your own plans.", status: 403 as const };
      }
    }

    return {
      data: {
        plan: {
          ...plan,
          exercises: (plan.exercises ?? []) as unknown as Array<Record<string, unknown>>,
          creator: plan.creator ? flattenCreator(plan.creator) : undefined,
          assignments: plan.assignments.map((a: any) => ({
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

  /**
   * Execute the `create plan` workflow for the workouts module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createPlan(tenantId: string, userId: string, input: CreatePlanInput) {
    const membership = await workoutRepository.findMembership(tenantId, userId);
    if (!membership) {
      return { error: "Not a member of this tenant.", status: 403 as const };
    }

    const plan = await workoutRepository.createPlan({
      tenantId,
      creatorId: membership.id,
      title: input.title,
      description: input.description,
      exercises: input.exercises,
    });

    return { data: { plan } };
  },

  /**
   * Execute the `update plan` workflow for the workouts module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async updatePlan(
    tenantId: string,
    planId: string,
    userId: string,
    role: string | undefined,
    input: UpdatePlanInput,
  ) {
    const existing = await workoutRepository.findPlan(planId, tenantId);
    if (!existing) {
      return { error: "Workout plan not found.", status: 404 as const };
    }

    // Coaches can only update their own plans
    if (role === "COACH") {
      const membership = await workoutRepository.findMembership(tenantId, userId);
      if (existing.creatorId !== membership?.id) {
        return { error: "You can only update your own plans.", status: 403 as const };
      }
    }

    const plan = await workoutRepository.updatePlan(planId, input);
    return { data: { plan } };
  },

  /**
   * Execute the `delete plan` workflow for the workouts module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async deletePlan(tenantId: string, planId: string) {
    const existing = await workoutRepository.findPlan(planId, tenantId);
    if (!existing) {
      return { error: "Workout plan not found.", status: 404 as const };
    }

    await workoutRepository.deletePlan(planId);
    return { data: true };
  },

  /**
   * Execute the `assign plan` workflow for the workouts module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async assignPlan(tenantId: string, planId: string, membershipId: string) {
    const plan = await workoutRepository.findPlan(planId, tenantId);
    if (!plan) {
      return { error: "Workout plan not found.", status: 404 as const };
    }

    const target = await workoutRepository.findActiveMembership(membershipId, tenantId);
    if (!target) {
      return { error: "Target member not found in this tenant.", status: 404 as const };
    }

    const existingAssignment = await workoutRepository.findAssignment(planId, membershipId);
    if (existingAssignment) {
      return { error: "Plan already assigned to this member.", status: 409 as const };
    }

    const assignment = await workoutRepository.createAssignment(planId, membershipId);
    return { data: { assignment } };
  },
};
