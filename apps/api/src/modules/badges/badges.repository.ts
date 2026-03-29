/**
 * Documentation: Badges repository.
 *
 * - Encapsulates Prisma queries for badge definitions and member badge assignment, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: badgeRepository.
 */
import { prisma } from "../../lib/prisma";
import type { CreateBadgeInput, UpdateBadgeInput } from "./badges.schema";

export const badgeRepository = {
  /**
   * Run the `find by tenant and name` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findByTenantAndName(tenantId: string, name: string) {
    return prisma.badge.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
  },

  /**
   * Run the `find by id` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findById(id: string, tenantId: string) {
    return prisma.badge.findFirst({
      where: { id, tenantId },
    });
  },

  /**
   * Run the `create` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  create(tenantId: string, data: CreateBadgeInput) {
    return prisma.badge.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        color: data.color ?? "#6366f1",
        icon: data.icon,
      },
    });
  },

  /**
   * Run the `update` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  update(id: string, data: UpdateBadgeInput) {
    return prisma.badge.update({
      where: { id },
      data,
    });
  },

  /**
   * Run the `delete` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  delete(id: string) {
    return prisma.badge.delete({ where: { id } });
  },

  /**
   * Run the `list` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async list(tenantId: string, page: number, limit: number, includeInactive = false) {
    const where = {
      tenantId,
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [badges, total] = await Promise.all([
      prisma.badge.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { users: true } } },
      }),
      prisma.badge.count({ where }),
    ]);

    return { badges, total };
  },

  // ─── Assignments (implicit M2M via Badge.users <-> TenantMembership.badges) ─

  /**
   * Run the `is assigned` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async isAssigned(badgeId: string, membershipId: string) {
    const count = await prisma.badge.count({
      where: { id: badgeId, users: { some: { id: membershipId } } },
    });
    return count > 0;
  },

  /**
   * Run the `assign badge` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  assignBadge(badgeId: string, membershipId: string) {
    return prisma.badge.update({
      where: { id: badgeId },
      data: { users: { connect: { id: membershipId } } },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        users: {
          where: { id: membershipId },
          select: {
            id: true,
            memberId: true,
            user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
          },
        },
      },
    });
  },

  /**
   * Run the `unassign badge` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  unassignBadge(badgeId: string, membershipId: string) {
    return prisma.badge.update({
      where: { id: badgeId },
      data: { users: { disconnect: { id: membershipId } } },
    });
  },

  /**
   * Run the `list badge members` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listBadgeMembers(badgeId: string) {
    return prisma.tenantMembership.findMany({
      where: { badges: { some: { id: badgeId } } },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        memberId: true,
        user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
      },
    });
  },

  /**
   * Run the `list member badges` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listMemberBadges(membershipId: string) {
    return prisma.badge.findMany({
      where: { users: { some: { id: membershipId } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, description: true, color: true, icon: true },
    });
  },

  /**
   * Run the `find membership` persistence operation for the badges module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembership(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
    });
  },
};
