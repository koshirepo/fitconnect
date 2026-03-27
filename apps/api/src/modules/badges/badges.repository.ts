import { prisma } from "../../lib/prisma";
import type { CreateBadgeInput, UpdateBadgeInput } from "./badges.schema";

export const badgeRepository = {
  findByTenantAndName(tenantId: string, name: string) {
    return prisma.badge.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
  },

  findById(id: string, tenantId: string) {
    return prisma.badge.findFirst({
      where: { id, tenantId },
    });
  },

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

  update(id: string, data: UpdateBadgeInput) {
    return prisma.badge.update({
      where: { id },
      data,
    });
  },

  delete(id: string) {
    return prisma.badge.delete({ where: { id } });
  },

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

  async isAssigned(badgeId: string, membershipId: string) {
    const count = await prisma.badge.count({
      where: { id: badgeId, users: { some: { id: membershipId } } },
    });
    return count > 0;
  },

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
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });
  },

  unassignBadge(badgeId: string, membershipId: string) {
    return prisma.badge.update({
      where: { id: badgeId },
      data: { users: { disconnect: { id: membershipId } } },
    });
  },

  listBadgeMembers(badgeId: string) {
    return prisma.tenantMembership.findMany({
      where: { badges: { some: { id: badgeId } } },
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
      },
    });
  },

  listMemberBadges(membershipId: string) {
    return prisma.badge.findMany({
      where: { users: { some: { id: membershipId } } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, description: true, color: true, icon: true },
    });
  },

  findMembership(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
    });
  },
};
