/**
 * Documentation: Members repository.
 *
 * - Encapsulates Prisma queries for tenant membership lifecycle, profile updates, reporting, and status management, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: memberRepository.
 */
import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { PlatformRole, TenantRole } from "../../shared/types/enums";

const shiftSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  startTime: true,
  endTime: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const memberRepository = {
  /**
   * Run the `find user by email` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
  },

  /**
   * Run the `create user` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createUser(data: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    platformRole: PlatformRole;
    avatarUrl?: string;
  }) {
    return prisma.user.create({
      data,
      select: { id: true },
    });
  },

  /**
   * Run the `find membership` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, userId: true },
    });
  },

  /**
   * Run the `find membership by id` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembershipById(id: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        role: true,
        userId: true,
        status: true,
        dueDate: true,
      },
    });
  },

  /**
   * Run the `find membership by user id` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembershipByUserId(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    });
  },

  /**
   * Run the `create membership` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async createMembership(
    tenantId: string,
    userId: string,
    role: TenantRole,
    shiftId?: string,
  ) {
    // D1 doesn't support interactive transactions.
    // Count first, then create. The @@unique([tenantId, memberId]) constraint
    // guards against duplicates if a concurrent insert races.
    const count = await prisma.tenantMembership.count({ where: { tenantId } });
    return prisma.tenantMembership.create({
      data: {
        tenantId,
        userId,
        role,
        memberId: count + 1,
        ...(shiftId ? { shiftId } : {}),
      },
      select: {
        id: true,
        memberId: true,
        role: true,
        shift: { select: shiftSelect },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  },

  /**
   * Run the `list members` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listMembers(
    tenantId: string,
    page: number,
    limit: number,
    roleFilter?: string,
    search?: string,
    statusFilter?: string,
    badgeId?: string,
  ) {
    const where: Prisma.TenantMembershipWhereInput = { tenantId };

    if (statusFilter === "DUE") {
      const now = new Date();
      where.status = "ACTIVE";
      where.dueDate = { not: null, lte: now };
    } else if (statusFilter === "INACTIVE") {
      where.status = "SUSPENDED";
    } else if (statusFilter === "ACTIVE") {
      where.status = "ACTIVE";
    } else {
      // "ALL" or empty — no status filter
    }

    if (roleFilter && ["MEMBER", "COACH", "ADMIN"].includes(roleFilter)) {
      where.role = roleFilter as TenantRole;
    }
    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const memberIdSearch = /^\d+$/.test(trimmedSearch) ? Number(trimmedSearch) : null;
      where.OR = [
        { user: { name: { contains: trimmedSearch } } },
        { user: { email: { contains: trimmedSearch } } },
        { user: { phone: { contains: trimmedSearch } } },
        ...(memberIdSearch !== null ? [{ memberId: memberIdSearch }] : []),
      ];
    }
    if (badgeId) {
      where.badges = { some: { id: badgeId } };
    }

    const [members, total] = await Promise.all([
      prisma.tenantMembership.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { memberId: "desc" },
        select: {
          id: true,
          memberId: true,
          role: true,
          status: true,
          dueDate: true,
          joinedAt: true,
          shift: { select: shiftSelect },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatarUrl: true,
            },
          },
        },
      }),
      prisma.tenantMembership.count({ where }),
    ]);

    return { members, total };
  },

  /**
   * Run the `get profile` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  getProfile(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        id: true,
        memberId: true,
        role: true,
        status: true,
        dueDate: true,
        joinedAt: true,
        shift: { select: shiftSelect },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        payments: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            amount: true,
            status: true,
            paidAt: true,
            validFrom: true,
            validUntil: true,
            subscription: { select: { id: true, title: true } },
          },
        },
      },
    });
  },

  /**
   * Run the `find user password hash` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findUserPasswordHash(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
  },

  /**
   * Run the `update user` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateUser(userId: string, data: Record<string, unknown>) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });
  },

  /**
   * Run the `count active admins` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  countActiveAdmins(tenantId: string) {
    return prisma.tenantMembership.count({
      where: { tenantId, role: "ADMIN", status: "ACTIVE" },
    });
  },

  /**
   * Run the `update member role` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateMemberRole(membershipId: string, role: TenantRole) {
    return prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { role },
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  },

  /**
   * Run the `update membership status` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateMembershipStatus(membershipId: string, status: "ACTIVE" | "SUSPENDED") {
    return prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { status },
      select: { id: true, status: true },
    });
  },

  /**
   * Run the `soft delete member` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  softDeleteMember(membershipId: string) {
    return prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { status: "DELETED" },
    });
  },

  /**
   * Run the `get dashboard stats` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async getDashboardStats(tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(
      startOfWeek.getDate() -
        startOfWeek.getDay() +
        (startOfWeek.getDay() === 0 ? -6 : 1),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [total, active, suspended, joinedToday, joinedWeek, joinedMonth] =
      await Promise.all([
        prisma.tenantMembership.count({
          where: { tenantId, status: { not: "DELETED" } },
        }),
        prisma.tenantMembership.count({
          where: { tenantId, status: "ACTIVE" },
        }),
        prisma.tenantMembership.count({
          where: { tenantId, status: "SUSPENDED" },
        }),
        prisma.tenantMembership.count({
          where: {
            tenantId,
            status: { not: "DELETED" },
            joinedAt: { gte: startOfToday },
          },
        }),
        prisma.tenantMembership.count({
          where: {
            tenantId,
            status: { not: "DELETED" },
            joinedAt: { gte: startOfWeek },
          },
        }),
        prisma.tenantMembership.count({
          where: {
            tenantId,
            status: { not: "DELETED" },
            joinedAt: { gte: startOfMonth },
          },
        }),
      ]);

    return { total, active, suspended, joinedToday, joinedWeek, joinedMonth };
  },

  /**
   * Run the `get finance stats` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async getFinanceStats(tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [revenueMonth, revenueToday, paymentsMonth, paymentsToday] =
      await Promise.all([
        prisma.payment.aggregate({
          where: {
            tenantId,
            status: "COMPLETED",
            createdAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.payment.aggregate({
          where: {
            tenantId,
            status: "COMPLETED",
            createdAt: { gte: startOfToday },
          },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.payment.count({
          where: {
            tenantId,
            status: "PENDING",
            createdAt: { gte: startOfMonth },
          },
        }),
        prisma.payment.count({
          where: {
            tenantId,
            status: "PENDING",
            createdAt: { gte: startOfToday },
          },
        }),
      ]);

    return {
      revenueMonth: revenueMonth._sum.amount ?? 0,
      revenueToday: revenueToday._sum.amount ?? 0,
      completedMonth: revenueMonth._count,
      completedToday: revenueToday._count,
      pendingMonth: paymentsMonth,
      pendingToday: paymentsToday,
    };
  },

  /**
   * Run the `get overdue members` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async getOverdueMembers(tenantId: string, overdueDays: number) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - overdueDays);
    return prisma.tenantMembership.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        dueDate: { not: null, lte: cutoff },
      },
      select: {
        id: true,
        memberId: true,
        dueDate: true,
        user: { select: { name: true, email: true } },
      },
    });
  },

  /**
   * Run the `suspend many` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async suspendMany(ids: string[]) {
    return prisma.tenantMembership.updateMany({
      where: { id: { in: ids } },
      data: { status: "SUSPENDED" },
    });
  },

  /**
   * Run the `get member detail` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  getMemberDetail(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: {
        id: true,
        memberId: true,
        role: true,
        status: true,
        dueDate: true,
        joinedAt: true,
        shift: { select: shiftSelect },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            amount: true,
            description: true,
            status: true,
            paidAt: true,
            validFrom: true,
            validUntil: true,
            createdAt: true,
            subscription: { select: { id: true, title: true } },
          },
        },
        badges: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            icon: true,
          },
        },
        planAssignments: {
          orderBy: { assignedAt: "desc" },
          select: {
            id: true,
            assignedAt: true,
            plan: {
              select: {
                id: true,
                title: true,
                description: true,
              },
            },
          },
        },
      },
    });
  },
};
