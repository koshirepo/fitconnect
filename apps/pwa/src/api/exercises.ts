/**
 * Documentation: Exercise library API client.
 *
 * - Wraps the platform's exercise library: the catalogue every gym browses, the muscle-group rail it filters by, and the writes behind the app-level manage screen.
 * - Not gym-scoped, so these paths carry no gym id. One library, the same rows in every gym.
 * - Videos arrive as playable URLs the API built from its stored object keys; nothing here constructs a media address.
 * - Likes and comments are not here. They go through `reactionsApi` under the subject type `EXERCISE`, the same calls a gym page or a store product uses.
 * - Primary exports: exercisesApi.
 */
import { api } from "./client";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type {
  CreateExercisePayload,
  Exercise,
  ExerciseMuscleGroup,
  UpdateExercisePayload,
} from "@fitconnect/shared/types/models";

export type ExerciseFilters = {
  search?: string;
  muscleGroup?: string;
  /** Retired entries. Honoured only for whoever manages the library. */
  includeInactive?: boolean;
  /**
   * Specific exercises, by id.
   *
   * What a plan builder asks for: its lines already carry the ids they were
   * written from, and this draws all their clips in one request.
   */
  ids?: string[];
};

export const exercisesApi = {
  list: (filters: ExerciseFilters = {}, page = 1, limit = 24) =>
    api.get<PaginatedResponse<{ exercises: Exercise[] }>>("/exercises", {
      params: {
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.muscleGroup ? { muscleGroup: filters.muscleGroup } : {}),
        ...(filters.includeInactive ? { includeInactive: true } : {}),
        ...(filters.ids?.length ? { ids: filters.ids.join(",") } : {}),
        page,
        limit,
      },
    }),

  muscleGroups: (includeInactive = false) =>
    api.get<ApiResponse<{ muscleGroups: ExerciseMuscleGroup[] }>>("/exercises/muscle-groups", {
      params: includeInactive ? { includeInactive: true } : {},
    }),

  /** By id or by slug — a URL carries the slug, everything internal the id. */
  get: (idOrSlug: string) =>
    api.get<ApiResponse<{ exercise: Exercise }>>(`/exercises/${idOrSlug}`),

  create: (data: CreateExercisePayload) =>
    api.post<ApiResponse<{ exercise: Exercise }>>("/exercises", data),

  update: (exerciseId: string, data: UpdateExercisePayload) =>
    api.patch<ApiResponse<{ exercise: Exercise }>>(`/exercises/${exerciseId}`, data),

  /** Deletes, or retires where somebody has already commented. */
  remove: (exerciseId: string) =>
    api.delete<ApiResponse<{ deleted: boolean; retained: boolean }>>(`/exercises/${exerciseId}`),
};
