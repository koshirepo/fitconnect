/**
 * Documentation: Training plans and the exercises in them.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

/**
 * One line of a plan.
 *
 * Named `PlanExercise` rather than `Exercise`, which is now the library entry a
 * line usually points at. The two are different things: the library owns the
 * name and the video, while this owns the sets and reps somebody was asked for.
 *
 * `name` stays on the line even when `exerciseId` is set, so a plan written
 * today still reads correctly if the library entry is later renamed or retired —
 * the same reason an order line keeps the name it sold under.
 */
export interface PlanExercise {
  /** The library exercise this line came from, when it came from the library. */
  exerciseId?: string;
  name: string;
  sets?: number;
  reps?: number;
  durationMinutes?: number;
  notes?: string;
}

export interface WorkoutPlan {
  id: string;
  title: string;
  description?: string | null;
  exercises?: PlanExercise[];
  createdAt: string;
  updatedAt?: string;
  creator?: {
    id: string;
    name: string;
  };
  _count?: { assignments: number };
  assignments?: {
    id: string;
    assignedAt: string;
    membershipId: string;
    memberId: number;
    memberName: string;
  }[];
}

export interface CreateWorkoutPlanPayload {
  title: string;
  description?: string;
  exercises?: PlanExercise[];
}

export interface UpdateWorkoutPlanPayload {
  title?: string;
  description?: string;
  exercises?: PlanExercise[];
}
