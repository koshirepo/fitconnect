/**
 * Documentation: Training plans and the exercises in them.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

export interface Exercise {
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
  exercises?: Exercise[];
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
  exercises?: Exercise[];
}

export interface UpdateWorkoutPlanPayload {
  title?: string;
  description?: string;
  exercises?: Exercise[];
}
