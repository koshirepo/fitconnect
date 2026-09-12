/**
 * Documentation: The exercise library every gym trains from.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was added.
 * - Platform-owned, like the occupation list: the platform writes the library and every gym reads the same rows. A gym never has its own copy of a lift, so none of these carry a tenant id.
 * - One entry holds both clips. Most exercises were filmed twice, once with a man and once with a woman, and they are the same lift — so they share a name, a muscle group, and one comment thread, and the player picks the clip that matches whoever is watching.
 * - Videos reach the browser as playable URLs. The stored value is an R2 object key; the API turns it into a URL, so a bucket move never reaches a screen.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

/** Which model is in the clip. A viewer's own gender picks the default. */
export type ExerciseVideoKind = "MALE" | "FEMALE";

/** The clips for one exercise. Either may be missing; at least one is present. */
export interface ExerciseVideos {
  male: string | null;
  female: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  /** Stable, lowercase, used in URLs: "45-degree-side-bend". */
  slug: string;
  /** What it trains, as the library files it: "Abs", "Back", "Hips". */
  muscleGroup: string;
  /** Other muscles it works, for search and filtering. */
  secondaryMuscles: string[];
  /** "Barbell", "Cable", "Bodyweight" — free text, drawn from the name. */
  equipment?: string | null;
  /** One plain line, shown under the name on a card. */
  description?: string | null;
  /** The long form, rendered as markdown on the exercise's own page. */
  markdown?: string | null;
  videos: ExerciseVideos;
  /** Retired exercises stay readable for plans that already name them. */
  isActive: boolean;
  likeCount: number;
  commentCount: number;
  /** Whether the caller has liked it. Absent on unauthenticated reads. */
  liked?: boolean;
  createdAt: string;
}

/** The muscle-group filter rail, with how many exercises each holds. */
export interface ExerciseMuscleGroup {
  name: string;
  count: number;
}

export interface CreateExercisePayload {
  name: string;
  muscleGroup: string;
  secondaryMuscles?: string[];
  equipment?: string | null;
  description?: string | null;
  markdown?: string | null;
  /** R2 object keys, not URLs: the API owns how a key becomes playable. */
  maleVideoKey?: string | null;
  femaleVideoKey?: string | null;
  isActive?: boolean;
}

export type UpdateExercisePayload = Partial<CreateExercisePayload>;
