/**
 * Documentation: Members repository.
 *
 * - Encapsulates Prisma queries for tenant membership lifecycle, profile updates, reporting, and status management, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: memberRepository.
 */
import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";
import type { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";

function isMemberIdConflict(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    (error as { constructor?: { name?: string } }).constructor?.name ===
      "PrismaClientKnownRequestError" &&
    (error as { code?: string }).code === "P2002"
  ) {
    const target = (error as { meta?: { target?: unknown } }).meta?.target;
    const fields = Array.isArray(target)
      ? target.map(String)
      : target != null
        ? [String(target)]
        : [];
    return fields.includes("tenantId") && fields.includes("memberId");
  }
  return false;
}

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

const referralMemberSelect = {
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
    },
  },
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
   * A live membership in this gym whose user already holds this email or phone.
   *
   * Uniqueness is per gym, not global: the same person may legitimately belong
   * to two gyms, and two gyms may independently hold the same contact detail.
   * That is why this is a scoped query rather than a unique index — email and
   * phone live on `User` while the gym scope lives on `TenantMembership`, so
   * the constraint cannot be expressed as a column uniqueness rule.
   *
   * `excludeMembershipId` lets an update ignore the record being edited.
   */
  findMembershipByContact(
    tenantId: string,
    contact: { email?: string | null; phone?: string | null },
    excludeMembershipId?: string,
  ) {
    const contactFilters: { user: { email?: string } | { phone?: string } }[] = [];
    if (contact.email) contactFilters.push({ user: { email: contact.email } });
    if (contact.phone) contactFilters.push({ user: { phone: contact.phone } });
    if (contactFilters.length === 0) return null;

    return prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        status: { not: "DELETED" },
        ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
        OR: contactFilters,
      },
      select: {
        id: true,
        memberId: true,
        user: { select: { name: true, email: true, phone: true } },
      },
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
      select: {
        id: true,
        userId: true,
        user: {
          select: {
            avatarUrl: true,
          },
        },
      },
    });
  },

  /**
   * Run the `find membership for user` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembershipForUser(userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { userId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        tenant: { select: { name: true } },
      },
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
        user: {
          select: {
            avatarUrl: true,
          },
        },
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
   * Run the `find referral candidate` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findReferralCandidate(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: { not: "DELETED" } },
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
    referredByMembershipId?: string,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latestMember = await prisma.tenantMembership.findFirst({
        where: { tenantId },
        orderBy: { memberId: "desc" },
        select: { memberId: true },
      });

      try {
        return await prisma.tenantMembership.create({
          data: {
            tenantId,
            userId,
            role,
            memberId: (latestMember?.memberId ?? 0) + 1,
            ...(shiftId ? { shiftId } : {}),
            ...(referredByMembershipId ? { referredByMembershipId } : {}),
          },
          select: {
            id: true,
            memberId: true,
            role: true,
            shift: { select: shiftSelect },
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        });
      } catch (error) {
        if (isMemberIdConflict(error) && attempt < 2) {
          continue;
        }
        throw error;
      }
    }

    throw new Error("Failed to allocate a member ID.");
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
   * Run the `delete member with dependencies` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async deleteMemberCascade(membershipId: string) {
    const createdPlans = await prisma.workoutPlan.findMany({
      where: { creatorId: membershipId },
      select: { id: true },
    });
    const createdPlanIds = createdPlans.map((plan) => plan.id);

    // D1 is more reliable with batched Prisma transactions than interactive tx callbacks.
    const [
      collectorRefsCleared,
      attendanceMarkersCleared,
      planAssignmentsDeleted,
      createdPlanAssignmentsDeleted,
      createdPlansDeleted,
      paymentsDeleted,
      _deletedMembership,
    ] = await prisma.$transaction([
      prisma.payment.updateMany({
        where: { collectorId: membershipId },
        data: { collectorId: null },
      }),
      prisma.attendance.updateMany({
        where: { markedById: membershipId },
        data: { markedById: null },
      }),
      prisma.workoutPlanAssignment.deleteMany({
        where: { membershipId },
      }),
      prisma.workoutPlanAssignment.deleteMany({
        where: { planId: { in: createdPlanIds } },
      }),
      prisma.workoutPlan.deleteMany({
        where: { id: { in: createdPlanIds } },
      }),
      prisma.payment.deleteMany({
        where: { membershipId },
      }),
      prisma.tenantMembership.delete({
        where: { id: membershipId },
      }),
    ]);

    return {
      collectorRefsCleared: collectorRefsCleared.count,
      attendanceMarkersCleared: attendanceMarkersCleared.count,
      planAssignmentsDeleted: planAssignmentsDeleted.count,
      createdPlanAssignmentsDeleted: createdPlanAssignmentsDeleted.count,
      createdPlansDeleted: createdPlansDeleted.count,
      paymentsDeleted: paymentsDeleted.count,
    };
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
        referredBy: {
          select: referralMemberSelect,
        },
        referrals: {
          orderBy: [{ joinedAt: "desc" }, { memberId: "desc" }],
          select: referralMemberSelect,
        },
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
        _count: {
          select: {
            referrals: true,
          },
        },
      },
    });
  },

  /**
   * Run the `list referral leaders` persistence operation for the members module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listReferralLeaders(tenantId: string, search?: string) {
    const trimmedSearch = search?.trim();
    const memberIdSearch = trimmedSearch && /^\d+$/.test(trimmedSearch) ? Number(trimmedSearch) : null;

    const where: Prisma.TenantMembershipWhereInput = {
      tenantId,
      referrals: { some: {} },
      ...(trimmedSearch
        ? {
            OR: [
              { user: { name: { contains: trimmedSearch } } },
              { user: { email: { contains: trimmedSearch } } },
              { user: { phone: { contains: trimmedSearch } } },
              ...(memberIdSearch !== null ? [{ memberId: memberIdSearch }] : []),
              { referrals: { some: { user: { name: { contains: trimmedSearch } } } } },
              { referrals: { some: { user: { email: { contains: trimmedSearch } } } } },
              { referrals: { some: { user: { phone: { contains: trimmedSearch } } } } },
              ...(memberIdSearch !== null
                ? [{ referrals: { some: { memberId: memberIdSearch } } }]
                : []),
            ],
          }
        : {}),
    };

    return prisma.tenantMembership.findMany({
      where,
      select: {
        ...referralMemberSelect,
        referrals: {
          orderBy: [{ joinedAt: "desc" }, { memberId: "desc" }],
          select: referralMemberSelect,
        },
        _count: {
          select: {
            referrals: true,
          },
        },
      },
    });
  },
};
