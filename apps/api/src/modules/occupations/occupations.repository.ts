/**
 * Documentation: Occupations repository.
 *
 * - Encapsulates Prisma queries for the platform-wide occupation list, including the member counts the manage screen shows.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: occupationRepository.
 */
import { prisma } from "../../lib/prisma";
import type { CreateOccupationInput, UpdateOccupationInput } from "./occupations.schema";

const occupationSelect = {
  id: true,
  name: true,
  icon: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Order every picker and listing agree on: lowest sortOrder first, then name. */
const occupationOrder = [{ sortOrder: "asc" as const }, { name: "asc" as const }];

export const occupationRepository = {
  findById(id: string) {
    return prisma.occupation.findUnique({ where: { id }, select: occupationSelect });
  },

  findByName(name: string) {
    return prisma.occupation.findUnique({ where: { name }, select: occupationSelect });
  },

  list(includeInactive: boolean) {
    return prisma.occupation.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: occupationOrder,
      select: occupationSelect,
    });
  },

  /**
   * The list with how many accounts hold each row.
   *
   * Only the manage screen asks for this: it is what tells somebody whether
   * retiring "Student" would leave four hundred members pointing at it.
   */
  listWithCounts(includeInactive: boolean) {
    return prisma.occupation.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: occupationOrder,
      select: { ...occupationSelect, _count: { select: { users: true } } },
    });
  },

  countMembers(id: string) {
    return prisma.user.count({ where: { occupationId: id } });
  },

  create(data: CreateOccupationInput) {
    return prisma.occupation.create({
      data: {
        name: data.name,
        icon: data.icon ?? null,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
      select: occupationSelect,
    });
  },

  update(id: string, data: UpdateOccupationInput) {
    return prisma.occupation.update({
      where: { id },
      data,
      select: occupationSelect,
    });
  },

  delete(id: string) {
    return prisma.occupation.delete({ where: { id } });
  },
};
