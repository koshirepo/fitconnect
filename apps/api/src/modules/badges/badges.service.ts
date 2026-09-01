/**
 * Documentation: Badges service.
 *
 * - Implements the business rules for badge definitions and member badge assignment by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: badgeService.
 */
import { Permission } from "@fitconnect/shared/types/permissions";
import { badgeRepository } from "./badges.repository";
import { flattenNestedMember } from "../../lib/flatten";
import type { CreateBadgeInput, UpdateBadgeInput, AssignBadgeInput } from "./badges.schema";

/**
 * Refuse a restricted badge to a caller who only holds the ordinary assign right.
 *
 * `badges:assign` gets somebody through the route; this is the second gate,
 * and it has to live here rather than in middleware because whether it applies
 * depends on the badge being acted on, which the route does not know yet.
 *
 * Returns null when the badge is ordinary or the caller is entitled.
 */
function restrictionError(
  badge: { restricted: boolean },
  granted: ReadonlySet<Permission>,
) {
  if (!badge.restricted) return null;
  if (granted.has(Permission.BADGES_ASSIGN_RESTRICTED)) return null;
  return {
    error: "This badge is restricted. Only an admin can assign or remove it.",
    status: 403 as const,
  };
}

type ServiceError = { error: string; status?: number };
type ServiceResult<T> = { data: T } | ServiceError;
type BadgeRecord = Awaited<ReturnType<typeof badgeRepository.update>>;
type UpdateBadgeResult = ServiceResult<{ badge: BadgeRecord }>;

export const badgeService = {
  /**
   * Execute the `create` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async create(tenantId: string, data: CreateBadgeInput) {
    const existing = await badgeRepository.findByTenantAndName(tenantId, data.name);
    if (existing) {
      return { error: "A badge with this name already exists in this gym." };
    }
    const badge = await badgeRepository.create(tenantId, data);
    return { data: { badge } };
  },

  /**
   * Execute the `list` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async list(tenantId: string, page: number, limit: number, includeInactive: boolean) {
    const { badges, total } = await badgeRepository.list(tenantId, page, limit, includeInactive);
    return { data: badges, total };
  },

  /**
   * Execute the `get by id` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getById(tenantId: string, badgeId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };
    return { data: { badge } };
  },

  /**
   * Execute the `update` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
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

  /**
   * Execute the `delete` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async delete(tenantId: string, badgeId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    await badgeRepository.delete(badgeId);
    return { data: null };
  },

  /**
   * Execute the `assign` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async assign(
    tenantId: string,
    badgeId: string,
    input: AssignBadgeInput,
    granted: ReadonlySet<Permission>,
  ) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };
    if (!badge.isActive) return { error: "Cannot assign an inactive badge.", status: 400 as const };

    const gate = restrictionError(badge, granted);
    if (gate) return gate;

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

  /**
   * Execute the `unassign` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async unassign(
    tenantId: string,
    badgeId: string,
    membershipId: string,
    granted: ReadonlySet<Permission>,
  ) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    // Taking a restricted badge away is as consequential as granting it — a
    // coach who could strip a staff credential has the same power in reverse.
    const gate = restrictionError(badge, granted);
    if (gate) return gate;

    const alreadyAssigned = await badgeRepository.isAssigned(badgeId, membershipId);
    if (!alreadyAssigned) return { error: "Assignment not found.", status: 404 as const };

    await badgeRepository.unassignBadge(badgeId, membershipId);
    return { data: null };
  },

  /**
   * Execute the `list assignments` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listAssignments(tenantId: string, badgeId: string) {
    const badge = await badgeRepository.findById(badgeId, tenantId);
    if (!badge) return { error: "Badge not found.", status: 404 as const };

    const members = await badgeRepository.listBadgeMembers(badgeId);
    const flat = members.map((m) => ({
      membership: flattenNestedMember(m),
    }));
    return { data: { assignments: flat } };
  },

  /**
   * Execute the `list member badges` workflow for the badges module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listMemberBadges(tenantId: string, membershipId: string) {
    const badges = await badgeRepository.listMemberBadges(tenantId, membershipId);
    return { data: { badges } };
  },
};
