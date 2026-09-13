/**
 * Documentation: Diet plan query hooks.
 *
 * - A gym's diet plans, scoped to the current gym the way workout plans are.
 * - Every write invalidates the gym's diet plan prefix. Assigning also clears members, because a member's record lists the plans assigned to them.
 * - Primary exports: useDietPlan, useDietPlansInfinite, useCreateDietPlan, useUpdateDietPlan, useDeleteDietPlan, useAssignDietPlan, useUnassignDietPlan.
 */
import { dietPlansApi } from "@/api/diet-plans";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreateDietPlanPayload,
  UpdateDietPlanPayload,
} from "@fitconnect/shared/types/models";
import {
  unwrap,
  unwrapPaginated,
  useCurrentTenantId,
  useTenantInfiniteQuery,
  useTenantMutation,
  useTenantQuery,
} from "./shared";

function scope(prefix: string, tenantId: string | null) {
  return [prefix, tenantId ?? "none"];
}

export function useDietPlan(planId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.dietPlans.detail(tenantId, planId ?? "none"),
    async (tenantId) => unwrap(await dietPlansApi.getById(tenantId, planId!)).plan,
    { enabled: Boolean(planId) },
  );
}

/** Diet plans paged for the infinite-scroll list. */
export function useDietPlansInfinite(limit = 20, options: { enabled?: boolean } = {}) {
  return useTenantInfiniteQuery(
    (tenantId) => [...queryKeys.dietPlans.list(tenantId), "infinite", limit],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(await dietPlansApi.list(tenantId, page, limit));
      return { data: data.plans, meta };
    },
    options,
  );
}

export function useCreateDietPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateDietPlanPayload) =>
      unwrap(await dietPlansApi.create(id, payload)).plan,
    { invalidates: [scope("diet-plans", tenantId), scope("members", tenantId)] },
  );
}

export function useUpdateDietPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { planId: string; data: UpdateDietPlanPayload }) =>
      unwrap(await dietPlansApi.update(id, vars.planId, vars.data)).plan,
    { invalidates: [scope("diet-plans", tenantId), scope("members", tenantId)] },
  );
}

export function useDeleteDietPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, planId: string) => {
      await dietPlansApi.delete(id, planId);
    },
    { invalidates: [scope("diet-plans", tenantId), scope("members", tenantId)] },
  );
}

export function useAssignDietPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { planId: string; membershipId: string }) => {
      await dietPlansApi.assign(id, vars.planId, vars.membershipId);
    },
    { invalidates: [scope("diet-plans", tenantId), scope("members", tenantId)] },
  );
}

export function useUnassignDietPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { planId: string; membershipId: string }) => {
      await dietPlansApi.unassign(id, vars.planId, vars.membershipId);
    },
    { invalidates: [scope("diet-plans", tenantId), scope("members", tenantId)] },
  );
}
