/**
 * Documentation: Exercise library query hooks.
 *
 * - The platform's exercise library: the catalogue a member scrolls, one entry's page, the muscle-group rail, and the writes behind the app-level manage screen.
 * - Not gym-scoped, so these use the plain app-level helpers rather than the tenant-aware ones. The library is the same in every gym.
 * - The list is paged for infinite scroll, because a library of six hundred clips is scrolled rather than paginated. Its key carries the filters, so changing the muscle group starts a fresh list instead of appending to the last one.
 * - Muscle groups barely change, so that query is cached for a long while rather than refetched every time the page opens.
 * - Primary exports: useExercisesInfinite, useExercise, useExerciseMuscleGroups, useCreateExercise, useUpdateExercise, useDeleteExercise.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { exercisesApi, type ExerciseFilters } from "@/api/exercises";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreateExercisePayload,
  Exercise,
  UpdateExercisePayload,
} from "@fitconnect/shared/types/models";
import { unwrap, unwrapPaginated, useAppInfiniteQuery, useAppMutation } from "./shared";

/** The rail is edited by hand, a few times a year. */
const MUSCLE_GROUP_STALE_TIME = 60 * 60 * 1000;

/** The catalogue, paged for the grid's infinite scroll. */
export function useExercisesInfinite(
  filters: ExerciseFilters = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 24 } = options;

  return useAppInfiniteQuery(
    queryKeys.exercises.list({ ...filters, limit }),
    async (page) => {
      const { data, meta } = unwrapPaginated(await exercisesApi.list(filters, page, limit));
      return { data: data.exercises, meta };
    },
    options,
  );
}

/** One exercise, for its page. Takes an id or a slug. */
export function useExercise(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.exercises.detail(idOrSlug ?? "none"),
    enabled: Boolean(idOrSlug),
    queryFn: async () => unwrap(await exercisesApi.get(idOrSlug!)).exercise,
  });
}

/**
 * Several exercises at once, by id, as a lookup keyed by id.
 *
 * A saved plan carries an id per line, and a plan of eight lines should cost
 * one request rather than eight. The ids are deduplicated and sorted before
 * they become the key, so reordering a plan does not refetch the same set.
 *
 * Retired entries come back too — the API includes them when a caller names
 * ids — because a line in a plan written last year should still show its clip.
 */
export function useExercisesByIds(ids: string[]) {
  const wanted = React.useMemo(
    () => [...new Set(ids.filter(Boolean))].sort(),
    [ids],
  );

  return useQuery({
    queryKey: queryKeys.exercises.byIds(wanted),
    enabled: wanted.length > 0,
    queryFn: async () => {
      const { data } = unwrapPaginated(
        await exercisesApi.list({ ids: wanted }, 1, Math.min(wanted.length, 100)),
      );

      return new Map<string, Exercise>(
        data.exercises.map((exercise) => [exercise.id, exercise]),
      );
    },
  });
}

export function useExerciseMuscleGroups(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.exercises.muscleGroups(includeInactive),
    staleTime: MUSCLE_GROUP_STALE_TIME,
    queryFn: async () => unwrap(await exercisesApi.muscleGroups(includeInactive)).muscleGroups,
  });
}

export function useCreateExercise() {
  return useAppMutation(
    async (payload: CreateExercisePayload) => unwrap(await exercisesApi.create(payload)).exercise,
    { invalidates: [queryKeys.exercises.all()] },
  );
}

export function useUpdateExercise() {
  return useAppMutation(
    async (variables: { exerciseId: string; data: UpdateExercisePayload }) =>
      unwrap(await exercisesApi.update(variables.exerciseId, variables.data)).exercise,
    { invalidates: [queryKeys.exercises.all()] },
  );
}

export function useDeleteExercise() {
  return useAppMutation(
    async (exerciseId: string) => unwrap(await exercisesApi.remove(exerciseId)),
    { invalidates: [queryKeys.exercises.all()] },
  );
}
