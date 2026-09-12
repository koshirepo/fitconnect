/**
 * Documentation: Exercise library service.
 *
 * - The rules over the platform's exercise library: what a caller may see, what a slug is, and what happens when an entry is removed.
 * - Videos leave here as playable URLs, built from the stored R2 key by whatever `assetUrl` the caller passes in — which is the request's own origin. Keys stay in the database, so the same row plays under a gym's subdomain, the app host, or localhost without any of them being configured.
 * - Likes and comments are not this module's business. They live in the shared reaction tables under the subject type `EXERCISE`, so the counts on a card come from `reactionRepository` in one query for the whole page, and the thread is served by the reactions module like any other.
 * - Retired exercises are hidden from everybody except the platform staff who manage them. A plan that already names one still reads correctly, because a plan line keeps its own copy of the name.
 * - Deleting is refused where somebody has already spoken: an entry with comments is retired instead, the way a product that has sold is. An entry nobody has commented on is deleted outright, and its likes go with it — nothing points at it any more.
 * - Primary exports: exerciseService.
 */
import { exerciseRepository } from "./exercises.repository";
import { reactionRepository } from "../reactions/reactions.repository";
import type {
  CreateExerciseInput,
  ListExercisesInput,
  UpdateExerciseInput,
} from "./exercises.schema";

/** Turns a stored object key into the address a browser can play. */
type AssetUrl = (key: string) => string;

type ExerciseRow = NonNullable<Awaited<ReturnType<typeof exerciseRepository.findByIdOrSlug>>>;

/**
 * Lowercase, hyphenated, and stable: "45 Degree Side Bend" becomes
 * "45-degree-side-bend".
 *
 * The slug is what a URL carries, so it is derived once at creation and left
 * alone afterwards — renaming an exercise must not break a link somebody saved.
 */
export function slugifyExercise(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** The shape every screen reads, with keys resolved and reactions attached. */
function toExercise(
  row: ExerciseRow,
  assetUrl: AssetUrl,
  counts?: { likeCount: number; commentCount: number },
  liked?: boolean,
) {
  const { maleVideoKey, femaleVideoKey, ...exercise } = row;

  return {
    ...exercise,
    secondaryMuscles: Array.isArray(row.secondaryMuscles)
      ? (row.secondaryMuscles as string[])
      : [],
    videos: {
      male: maleVideoKey ? assetUrl(maleVideoKey) : null,
      female: femaleVideoKey ? assetUrl(femaleVideoKey) : null,
    },
    likeCount: counts?.likeCount ?? 0,
    commentCount: counts?.commentCount ?? 0,
    ...(liked === undefined ? {} : { liked }),
  };
}

export const exerciseService = {
  /**
   * The catalogue.
   *
   * `canManage` is what decides whether retired entries are included, not the
   * query string: a member asking for them must not receive them.
   *
   * Counts and the caller's own likes are fetched for the whole page in two
   * queries rather than two per card.
   */
  async list(
    filters: ListExercisesInput,
    userId: string | null,
    canManage: boolean,
    page: number,
    limit: number,
    assetUrl: AssetUrl,
  ) {
    const { exercises, total } = await exerciseRepository.list(
      {
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.muscleGroup ? { muscleGroup: filters.muscleGroup } : {}),
        ...(filters.ids?.length ? { ids: filters.ids } : {}),
        // A plan naming its own lines sees them even where one was retired
        // since: the alternative is a line in a saved plan that silently
        // loses its clip.
        includeInactive: (canManage && Boolean(filters.includeInactive)) || Boolean(filters.ids?.length),
      },
      page,
      limit,
    );

    const ids = exercises.map((exercise) => exercise.id);
    const [counts, liked] = await Promise.all([
      reactionRepository.countsFor("EXERCISE", ids),
      userId
        ? reactionRepository.likedSubjectIds("EXERCISE", ids, userId)
        : Promise.resolve(new Set<string>()),
    ]);

    return {
      data: {
        exercises: exercises.map((exercise) =>
          toExercise(
            exercise,
            assetUrl,
            counts.get(exercise.id),
            userId ? liked.has(exercise.id) : undefined,
          ),
        ),
      },
      total,
    };
  },

  async muscleGroups(canManage: boolean, includeInactive: boolean) {
    return {
      data: { muscleGroups: await exerciseRepository.muscleGroups(canManage && includeInactive) },
    };
  },

  async get(idOrSlug: string, userId: string | null, canManage: boolean, assetUrl: AssetUrl) {
    const row = await exerciseRepository.findByIdOrSlug(idOrSlug);
    if (!row || (!row.isActive && !canManage)) {
      return { error: "Exercise not found.", status: 404 as const };
    }

    const subject = { subjectType: "EXERCISE" as const, subjectId: row.id };
    const [counts, liked] = await Promise.all([
      reactionRepository.countsFor("EXERCISE", [row.id]),
      userId ? reactionRepository.hasLiked(subject, userId) : Promise.resolve(undefined),
    ]);

    return { data: { exercise: toExercise(row, assetUrl, counts.get(row.id), liked) } };
  },

  /**
   * Add an exercise.
   *
   * The slug is derived from the name and made unique by a counter, so two
   * "Barbell Curl" entries — one per grip, say — both get a usable URL rather
   * than one of them failing on the unique key.
   */
  async create(input: CreateExerciseInput, assetUrl: AssetUrl) {
    if (!input.maleVideoKey && !input.femaleVideoKey) {
      return { error: "An exercise needs at least one video.", status: 400 as const };
    }

    const base = slugifyExercise(input.name);
    if (!base) return { error: "That name cannot be turned into a link.", status: 400 as const };

    let slug = base;
    for (let suffix = 2; await exerciseRepository.findBySlug(slug); suffix++) {
      slug = `${base}-${suffix}`;
    }

    const row = await exerciseRepository.create({
      name: input.name,
      slug,
      muscleGroup: input.muscleGroup,
      secondaryMuscles: input.secondaryMuscles,
      equipment: input.equipment ?? null,
      description: input.description ?? null,
      markdown: input.markdown ?? null,
      maleVideoKey: input.maleVideoKey ?? null,
      femaleVideoKey: input.femaleVideoKey ?? null,
      isActive: input.isActive,
    });

    return { data: { exercise: toExercise(row, assetUrl) } };
  },

  /** Edit one. The slug is left alone, so saved links keep working. */
  async update(exerciseId: string, input: UpdateExerciseInput, assetUrl: AssetUrl) {
    const row = await exerciseRepository.update(exerciseId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.muscleGroup !== undefined ? { muscleGroup: input.muscleGroup } : {}),
      ...(input.secondaryMuscles !== undefined
        ? { secondaryMuscles: input.secondaryMuscles }
        : {}),
      ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.markdown !== undefined ? { markdown: input.markdown } : {}),
      ...(input.maleVideoKey !== undefined ? { maleVideoKey: input.maleVideoKey } : {}),
      ...(input.femaleVideoKey !== undefined ? { femaleVideoKey: input.femaleVideoKey } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    });

    if (!row) return { error: "Exercise not found.", status: 404 as const };

    const counts = await reactionRepository.countsFor("EXERCISE", [row.id]);
    return { data: { exercise: toExercise(row, assetUrl, counts.get(row.id)) } };
  },

  /**
   * Remove an exercise, or retire it where somebody has already commented.
   *
   * A comment is a person's own words about a lift; deleting the row would take
   * them with it. Retiring hides the exercise from every library and picker and
   * leaves the thread intact.
   */
  async remove(exerciseId: string) {
    const row = await exerciseRepository.findByIdOrSlug(exerciseId);
    if (!row) return { error: "Exercise not found.", status: 404 as const };

    const counts = await reactionRepository.countsFor("EXERCISE", [row.id]);
    if ((counts.get(row.id)?.commentCount ?? 0) > 0) {
      await exerciseRepository.update(row.id, { isActive: false });
      return { data: { deleted: false, retained: true } };
    }

    const deleted = await exerciseRepository.delete(row.id);
    if (!deleted) return { error: "Exercise not found.", status: 404 as const };

    // Nothing points at these two tables from the schema, so the rows a deleted
    // subject leaves behind have to be cleared here or they are unreachable.
    await reactionRepository.deleteForSubject({ subjectType: "EXERCISE", subjectId: row.id });

    return { data: { deleted: true, retained: false } };
  },
};
