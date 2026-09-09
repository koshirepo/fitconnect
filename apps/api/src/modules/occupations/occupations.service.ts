/**
 * Documentation: Occupations service.
 *
 * - Implements the business rules for the platform-wide occupation list: unique names, and the difference between retiring a row and deleting one.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: occupationService.
 */
import { occupationRepository } from "./occupations.repository";
import type { CreateOccupationInput, UpdateOccupationInput } from "./occupations.schema";

const DUPLICATE_NAME = "An occupation with this name already exists.";

export const occupationService = {
  async list(includeInactive: boolean, withCounts: boolean) {
    if (!withCounts) {
      return { data: { occupations: await occupationRepository.list(includeInactive) } };
    }

    const rows = await occupationRepository.listWithCounts(includeInactive);
    return {
      data: {
        occupations: rows.map(({ _count, ...occupation }) => ({
          ...occupation,
          memberCount: _count.users,
        })),
      },
    };
  },

  async create(input: CreateOccupationInput) {
    const existing = await occupationRepository.findByName(input.name);
    if (existing) return { error: DUPLICATE_NAME, status: 409 as const };

    return { data: { occupation: await occupationRepository.create(input) } };
  },

  async update(id: string, input: UpdateOccupationInput) {
    const existing = await occupationRepository.findById(id);
    if (!existing) return { error: "Occupation not found.", status: 404 as const };

    if (input.name && input.name !== existing.name) {
      const duplicate = await occupationRepository.findByName(input.name);
      if (duplicate) return { error: DUPLICATE_NAME, status: 409 as const };
    }

    return { data: { occupation: await occupationRepository.update(id, input) } };
  },

  /**
   * Delete a row nobody holds.
   *
   * Anything in use is refused rather than quietly emptying those members'
   * occupation: the reason to remove an occupation people actually have is
   * that it should stop being offered, and that is what `isActive` is for.
   */
  async delete(id: string) {
    const existing = await occupationRepository.findById(id);
    if (!existing) return { error: "Occupation not found.", status: 404 as const };

    const holders = await occupationRepository.countMembers(id);
    if (holders > 0) {
      return {
        error: `${holders} ${holders === 1 ? "member holds" : "members hold"} this occupation. Turn it off instead of deleting it.`,
        status: 409 as const,
      };
    }

    await occupationRepository.delete(id);
    return { data: true };
  },
};
