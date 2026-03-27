import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { PlatformRole, TenantRole } from "../../shared/types/enums";

export const memberRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email },
      select: { id: true },
    });
  },

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

  findMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, userId: true },
    });
  },

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

  findMembershipByUserId(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    });
  },

  async createMembership(
    tenantId: string,
    userId: string,
    role: TenantRole,
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
      },
      select: {
        id: true,
        memberId: true,
        role: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
  },

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
    if (search && search.trim()) {
      where.OR = [
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
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

  getProfile(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: {
        id: true,
        memberId: true,
        role: true,
        status: true,
        joinedAt: true,
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

  findUserPasswordHash(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
  },

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

  countActiveAdmins(tenantId: string) {
    return prisma.tenantMembership.count({
      where: { tenantId, role: "ADMIN", status: "ACTIVE" },
    });
  },

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

  updateMembershipStatus(membershipId: string, status: "ACTIVE" | "SUSPENDED") {
    return prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { status },
      select: { id: true, status: true },
    });
  },

  softDeleteMember(membershipId: string) {
    return prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { status: "DELETED" },
    });
  },

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

  async suspendMany(ids: string[]) {
    return prisma.tenantMembership.updateMany({
      where: { id: { in: ids } },
      data: { status: "SUSPENDED" },
    });
  },

  getMemberDetail(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: {
        id: true,
        memberId: true,
        role: true,
        status: true,
        joinedAt: true,
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
