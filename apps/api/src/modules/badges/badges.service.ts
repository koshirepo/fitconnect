import { badgeRepository } from "./badges.repository";
import { flattenNestedMember } from "../../lib/flatten";
import type { CreateBadgeInput, UpdateBadgeInput, AssignBadgeInput } from "./badges.schema";

type ServiceError = { error: string; status?: number };
type ServiceResult<T> = { data: T } | ServiceError;
type BadgeRecord = Awaited<ReturnType<typeof badgeRepository.update>>;
type UpdateBadgeResult = ServiceResult<{ badge: BadgeRecord }>;

export const badgeService = {
  async create(tenantId: string, data: CreateBadgeInput) {
    const existing = await badgeRepository.findByTenantAndName(tenantId, data.name);
    if (existing) {
      return { error: "A badge with this name already exists in this gym." };
    }
    const badge = await badgeRepository.create(tenantId, data);
    return { data: { badge } };
  },

  async list(tenantId: string, page: number, limit: number, includeInactive: boolean) {
    const { badges, total } = await badgeRepository.list(tenantId, page, limit, includeInactive);
    return { data: badges, total };
  },

  async getById(tenantId: string, badgeId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };
    return { data: { badge } };
  },

  async update(
    tenantId: string,
    badgeId: string,
    data: UpdateBadgeInput,
  ): Promise<UpdateBadgeResult> {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    // If renaming, check uniqueness
    if (data.name && data.name !== badge.name) {
      const existing = await badgeRepository.findByTenantAndName(tenantId, data.name);
      if (existing) return { error: "A badge with this name already exists." };
    }

    const updated = await badgeRepository.update(badgeId, data);
    return { data: { badge: updated } };
  },

  async delete(tenantId: string, badgeId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    await badgeRepository.delete(badgeId);
    return { data: null };
  },

  async assign(tenantId: string, badgeId: string, input: AssignBadgeInput) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };
    if (!badge.isActive) return { error: "Cannot assign an inactive badge.", status: 400 as const };

    const membership = await badgeRepository.findMembership(tenantId, input.membershipId);
    if (!membership) return { error: "Member not found in this gym.", status: 404 as const };

    const alreadyAssigned = await badgeRepository.isAssigned(badgeId, input.membershipId);
    if (alreadyAssigned)
      return { error: "This member already has this badge.", status: 409 as const };

    const result = await badgeRepository.assignBadge(badgeId, input.membershipId);
    const member = result.users[0];
    return {
      data: {
        assignment: {
          badge: { id: result.id, name: result.name, color: result.color, icon: result.icon },
          membership: member ? flattenNestedMember(member) : undefined,
        },
      },
    };
  },

  async unassign(tenantId: string, badgeId: string, membershipId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    const alreadyAssigned = await badgeRepository.isAssigned(badgeId, membershipId);
    if (!alreadyAssigned) return { error: "Assignment not found.", status: 404 as const };

    await badgeRepository.unassignBadge(badgeId, membershipId);
    return { data: null };
  },

  async listAssignments(tenantId: string, badgeId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    const members = await badgeRepository.listBadgeMembers(badgeId);
    const flat = members.map((m) => ({
      membership: flattenNestedMember(m),
    }));
    return { data: { assignments: flat } };
  },

  async listMemberBadges(membershipId: string) {
    const badges = await badgeRepository.listMemberBadges(membershipId);
    return { data: { badges } };
  },
};
