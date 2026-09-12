/**
 * Documentation: Exercise library repository.
 *
 * - Every Prisma query for the platform's exercise library: the catalogue, the muscle-group rail, and the entries themselves.
 * - Nothing here is scoped by tenant, and that is the point: one library, read the same way by every gym. The only visibility rule is `isActive`, which the service decides from the caller's permission.
 * - Likes and comments are deliberately absent. They live in the shared `Reaction` and `Comment` tables with every other reaction in the app, so this file knows nothing about them and the service asks `reactionRepository` for counts.
 * - Primary exports: exerciseRepository.
 */
import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

/** What every read of an exercise returns. */
const exerciseSelect = {
  id: true,
  name: true,
  slug: true,
  muscleGroup: true,
  secondaryMuscles: true,
  equipment: true,
  description: true,
  markdown: true,
  maleVideoKey: true,
  femaleVideoKey: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.ExerciseSelect;

export const exerciseRepository = {
  /**
   * The catalogue, filtered the way the library page filters it.
   *
   * Search covers the name, the muscle group and the equipment, because those
   * are the three things somebody types: "row", "back", "barbell".
   */
  async list(
    filters: {
      search?: string;
      muscleGroup?: string;
      includeInactive?: boolean;
      ids?: string[];
    },
    page: number,
    limit: number,
  ) {
    const where: Prisma.ExerciseWhereInput = {
      ...(filters.includeInactive ? {} : { isActive: true }),
      ...(filters.muscleGroup ? { muscleGroup: filters.muscleGroup } : {}),
      // Named ids win over everything else a filter could say: a plan builder
      // asking for its own lines wants those lines, retired or not.
      ...(filters.ids?.length ? { id: { in: filters.ids } } : {}),
      // No `mode: "insensitive"`: D1 is SQLite, where `contains` already
      // compiles to a LIKE that ignores case for ASCII, and Prisma's SQLite
      // client rejects the option outright.
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { muscleGroup: { contains: filters.search } },
              { equipment: { contains: filters.search } },
            ],
          }
        : {}),
    };

    const [exercises, total] = await Promise.all([
      prisma.exercise.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ muscleGroup: "asc" }, { name: "asc" }],
        select: exerciseSelect,
      }),
      prisma.exercise.count({ where }),
    ]);

    return { exercises, total };
  },

  /** The filter rail: every muscle group that has something in it. */
  async muscleGroups(includeInactive: boolean) {
    const rows = await prisma.exercise.groupBy({
      by: ["muscleGroup"],
      where: includeInactive ? {} : { isActive: true },
      _count: { _all: true },
      orderBy: { muscleGroup: "asc" },
    });

    return rows.map((row) => ({ name: row.muscleGroup, count: row._count._all }));
  },

  /**
   * One exercise, by id or by slug.
   *
   * Both, because a URL carries the slug — `/exercises/barbell-curl` reads as
   * something and survives being pasted into a chat — while everything internal
   * holds the id.
   */
  findByIdOrSlug(idOrSlug: string) {
    return prisma.exercise.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: exerciseSelect,
    });
  },

  findBySlug(slug: string) {
    return prisma.exercise.findUnique({ where: { slug }, select: { id: true } });
  },

  create(data: {
    name: string;
    slug: string;
    muscleGroup: string;
    secondaryMuscles: string[];
    equipment?: string | null;
    description?: string | null;
    markdown?: string | null;
    maleVideoKey?: string | null;
    femaleVideoKey?: string | null;
    isActive: boolean;
  }) {
    return prisma.exercise.create({
      data: { ...data, secondaryMuscles: data.secondaryMuscles as Prisma.InputJsonValue },
      select: exerciseSelect,
    });
  },

  async update(exerciseId: string, data: Record<string, unknown>) {
    const result = await prisma.exercise.updateMany({
      where: { id: exerciseId },
      data: data as never,
    });
    if (result.count === 0) return null;

    return prisma.exercise.findUnique({ where: { id: exerciseId }, select: exerciseSelect });
  },

  async delete(exerciseId: string) {
    const result = await prisma.exercise.deleteMany({ where: { id: exerciseId } });
    return result.count > 0;
  },
};
