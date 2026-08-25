/**
 * Documentation: Gym catalog query hooks — workouts, badges, todos, shifts, settings, charges.
 *
 * - These domains share one shape: a tenant-scoped list plus straightforward CRUD, so they live together rather than in six near-identical files.
 * - Each write invalidates only its own domain prefix, except badge assignment, which also clears members because a member's badge list is embedded in their record.
 * - Primary exports: the use* query and mutation hooks for each domain.
 */
import { workoutsApi } from "@/api/workouts";
import { badgesApi } from "@/api/badges";
import { todosApi } from "@/api/todos";
import { shiftsApi } from "@/api/shifts";
import { settingsApi } from "@/api/settings";
import { queryKeys } from "@/lib/query-keys";
import type {
  AssignBadgePayload,
  CreateBadgePayload,
  CreateShiftPayload,
  CreateTenantChargePayload,
  CreateTodoPayload,
  CreateWorkoutPlanPayload,
  UpdateBadgePayload,
  UpdateShiftPayload,
  UpdateTenantChargePayload,
  UpdateTenantSettingsPayload,
  UpdateTodoPayload,
  UpdateWorkoutPlanPayload,
} from "@/types/api";
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

// ─── Workout plans ────────────────────────────────────────────────────────────

export function useWorkoutPlans(page = 1, limit = 20) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.workouts.list(tenantId), page, limit],
    async (tenantId) => unwrapPaginated(await workoutsApi.list(tenantId, page, limit)),
  );
}

export function useWorkoutPlan(planId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.workouts.detail(tenantId, planId ?? "none"),
    async (tenantId) => unwrap(await workoutsApi.getById(tenantId, planId!)).plan,
    { enabled: Boolean(planId) },
  );
}

/** Workout plans paged for the infinite-scroll list. */
export function useWorkoutPlansInfinite(limit = 20, options: { enabled?: boolean } = {}) {
  return useTenantInfiniteQuery(
    (tenantId) => [...queryKeys.workouts.list(tenantId), "infinite", limit],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(await workoutsApi.list(tenantId, page, limit));
      return { data: data.plans, meta };
    },
    options,
  );
}

export function useCreateWorkoutPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateWorkoutPlanPayload) => unwrap(await workoutsApi.create(id, payload)),
    { invalidates: [scope("workouts", tenantId)] },
  );
}

export function useUpdateWorkoutPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { planId: string; data: UpdateWorkoutPlanPayload }) =>
      unwrap(await workoutsApi.update(id, vars.planId, vars.data)),
    { invalidates: [scope("workouts", tenantId)] },
  );
}

export function useDeleteWorkoutPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, planId: string) => {
      await workoutsApi.delete(id, planId);
    },
    { invalidates: [scope("workouts", tenantId)] },
  );
}

export function useAssignWorkoutPlan() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { planId: string; membershipId: string }) =>
      unwrap(await workoutsApi.assign(id, vars.planId, vars.membershipId)),
    { invalidates: [scope("workouts", tenantId), scope("members", tenantId)] },
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export function useBadges(
  options: { page?: number; limit?: number; includeInactive?: boolean; enabled?: boolean } = {},
) {
  const { page = 1, limit = 100, includeInactive = false, enabled } = options;
  return useTenantQuery(
    (tenantId) => [...queryKeys.badges.list(tenantId), page, limit, includeInactive],
    async (tenantId) => unwrap(await badgesApi.list(tenantId, page, limit, includeInactive)),
    { enabled },
  );
}

/** Badges paged for the infinite-scroll list. */
export function useBadgesInfinite(
  options: { includeInactive?: boolean; enabled?: boolean; limit?: number } = {},
) {
  const { includeInactive = false, limit = 20 } = options;
  return useTenantInfiniteQuery(
    (tenantId) => [...queryKeys.badges.list(tenantId), "infinite", includeInactive, limit],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(
        await badgesApi.list(tenantId, page, limit, includeInactive),
      );
      return { data, meta };
    },
    options,
  );
}

/** Members currently holding a badge, loaded on demand by the assignments dialog. */
export function useBadgeAssignments(badgeId: string | null | undefined) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.badges.list(tenantId), "assignments", badgeId ?? "none"],
    async (tenantId) => unwrap(await badgesApi.listAssignments(tenantId, badgeId!)),
    { enabled: Boolean(badgeId) },
  );
}

export function useMemberBadges(membershipId: string | undefined) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.badges.list(tenantId), "member", membershipId ?? "none"],
    async (tenantId) => unwrap(await badgesApi.memberBadges(tenantId, membershipId!)),
    { enabled: Boolean(membershipId) },
  );
}

export function useCreateBadge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateBadgePayload) => unwrap(await badgesApi.create(id, payload)),
    { invalidates: [scope("badges", tenantId)] },
  );
}

export function useUpdateBadge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { badgeId: string; data: UpdateBadgePayload }) =>
      unwrap(await badgesApi.update(id, vars.badgeId, vars.data)),
    { invalidates: [scope("badges", tenantId)] },
  );
}

export function useDeleteBadge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, badgeId: string) => {
      await badgesApi.delete(id, badgeId);
    },
    { invalidates: [scope("badges", tenantId)] },
  );
}

export function useAssignBadge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { badgeId: string; data: AssignBadgePayload }) =>
      unwrap(await badgesApi.assign(id, vars.badgeId, vars.data)),
    // A member's badges are embedded in their record, so the member list is stale too.
    { invalidates: [scope("badges", tenantId), scope("members", tenantId)] },
  );
}

export function useUnassignBadge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { badgeId: string; membershipId: string }) => {
      await badgesApi.unassign(id, vars.badgeId, vars.membershipId);
    },
    { invalidates: [scope("badges", tenantId), scope("members", tenantId)] },
  );
}

// ─── Todos ────────────────────────────────────────────────────────────────────

export function useTodos(
  filters: { page?: number; limit?: number; status?: "ALL" | "OPEN" | "COMPLETED"; search?: string } = {},
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => [...queryKeys.todos.list(tenantId), filters],
    async (tenantId) =>
      unwrapPaginated(
        await todosApi.list(tenantId, filters.page ?? 1, filters.limit ?? 20, filters.status, filters.search),
      ),
    options,
  );
}

/** Todos paged for the infinite-scroll list, re-keyed when the filters change. */
export function useTodosInfinite(
  filters: { status?: "ALL" | "OPEN" | "COMPLETED"; search?: string } = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 20 } = options;
  return useTenantInfiniteQuery(
    (tenantId) => [...queryKeys.todos.list(tenantId), "infinite", filters, limit],
    async (tenantId, page) => {
      const { data, meta } = unwrapPaginated(
        await todosApi.list(tenantId, page, limit, filters.status, filters.search),
      );
      return { data: data.todos, meta };
    },
    options,
  );
}

export function useCreateTodo() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateTodoPayload) => unwrap(await todosApi.create(id, payload)),
    { invalidates: [scope("todos", tenantId)] },
  );
}

export function useUpdateTodo() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { todoId: string; data: UpdateTodoPayload }) =>
      unwrap(await todosApi.update(id, vars.todoId, vars.data)),
    { invalidates: [scope("todos", tenantId)] },
  );
}

export function useDeleteTodo() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, todoId: string) => {
      await todosApi.delete(id, todoId);
    },
    { invalidates: [scope("todos", tenantId)] },
  );
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export function useShifts(includeInactive = false, options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.shifts.list(tenantId, includeInactive),
    async (tenantId) => unwrap(await shiftsApi.list(tenantId, 1, 100, includeInactive)).shifts,
    options,
  );
}

export function useCreateShift() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateShiftPayload) => unwrap(await shiftsApi.create(id, payload)),
    { invalidates: [scope("shifts", tenantId)] },
  );
}

export function useUpdateShift() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { shiftId: string; data: UpdateShiftPayload }) =>
      unwrap(await shiftsApi.update(id, vars.shiftId, vars.data)),
    { invalidates: [scope("shifts", tenantId)] },
  );
}

export function useDeleteShift() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, shiftId: string) => {
      await shiftsApi.remove(id, shiftId);
    },
    { invalidates: [scope("shifts", tenantId)] },
  );
}

// ─── Settings and charges ─────────────────────────────────────────────────────

export function useTenantSettings(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.settings.detail(tenantId),
    async (tenantId) => unwrap(await settingsApi.getSettings(tenantId)).settings,
    options,
  );
}

export function useUpdateTenantSettings() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: UpdateTenantSettingsPayload) =>
      unwrap(await settingsApi.updateSettings(id, payload)).settings,
    { invalidates: [scope("settings", tenantId)] },
  );
}

export function useCharges(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.settings.charges(tenantId),
    async (tenantId) => unwrap(await settingsApi.listCharges(tenantId)).charges,
    options,
  );
}

export function useCreateCharge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: CreateTenantChargePayload) =>
      unwrap(await settingsApi.createCharge(id, payload)).charge,
    { invalidates: [scope("settings", tenantId)] },
  );
}

export function useUpdateCharge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, vars: { chargeId: string; data: UpdateTenantChargePayload }) =>
      unwrap(await settingsApi.updateCharge(id, vars.chargeId, vars.data)).charge,
    { invalidates: [scope("settings", tenantId)] },
  );
}

export function useDeleteCharge() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, chargeId: string) => {
      await settingsApi.deleteCharge(id, chargeId);
    },
    { invalidates: [scope("settings", tenantId)] },
  );
}
