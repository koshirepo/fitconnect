/**
 * Documentation: Members repository.
 *
 * - Encapsulates Prisma queries for tenant membership lifecycle, profile updates, reporting, and status management, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: memberRepository.
 */
import { prisma } from "../../lib/prisma";
import { idCardService } from "../public/id-card.service";
// A value import, not a type-only one: `Prisma.join` builds the IN list the
// birthday query needs.
import { Prisma } from "../../generated/prisma/client";
import type { PlatformRole } from "@fitconnect/shared/types/enums";

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

/**
 * What counts as overdue: an active membership whose due date passed more than
 * `overdueDays` ago.
 *
 * Shared by the read and the suspend so the two can never disagree about who is
 * in the set, and so neither has to name its members one id at a time.
 */
function overdueWhere(tenantId: string, overdueDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - overdueDays);

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  return {
    tenantId,
    status: "ACTIVE",
    dueDate: { not: null, lte: cutoff },
    // A frozen membership has its clock deliberately stopped, so the sweep
    // leaves it alone rather than suspending someone mid-break.
    freezes: {
      none: {
        endedOn: null,
        startsOn: { lte: todayUtc },
        plannedEndsOn: { gte: todayUtc },
      },
    },
  } satisfies Prisma.TenantMembershipWhereInput;
}

/** Enough of an occupation to name and draw it on a member record. */
const occupationSummarySelect = {
  id: true,
  name: true,
  icon: true,
} as const;

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
      gender: true,
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
  /**
   * What each member of this gym still owes, keyed by membership id.
   *
   * Scoped to the whole gym rather than to the ids on the current page: D1
   * allows about a hundred bind parameters per statement, and a page of 200
   * members would blow straight through that as an `IN` list. Grouping by
   * tenant instead is two parameters, and the result is bounded by how many
   * members actually owe something — far fewer than the roster.
   */
  async findPendingPaymentTotals(tenantId: string) {
    const rows = await prisma.payment.groupBy({
      by: ["membershipId"],
      where: { tenantId, status: "PENDING" },
      _sum: { amount: true },
    });

    return new Map(rows.map((row) => [row.membershipId, row._sum.amount ?? 0]));
  },

  createUser(data: {
    name: string;
    email: string;
    phone: string;
    passwordHash: string;
    platformRole: PlatformRole;
    avatarUrl?: string;
    gender?: string;
    dateOfBirth?: Date;
    occupationId?: string;
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
    role: string,
    shiftId?: string,
    referredByMembershipId?: string,
    /**
     * Defaults to ACTIVE, which is right for a member an admin adds in person.
     * Self-signup passes SUSPENDED — the app's "Inactive" — so the membership
     * only comes alive once the money actually lands.
     */
    status?: "ACTIVE" | "SUSPENDED",
    /**
     * What this member agreed to, and who recorded it.
     *
     * Passed as one object rather than three more positional arguments, and
     * written here rather than by each caller, because both ways of joining a
     * gym come through this function — the public form and the front desk —
     * and a consent record that exists on only one of those paths is worse
     * than none: it looks complete and covers half the roster.
     *
     * `recordedById` is null when the member accepted it themselves and the
     * staff membership when somebody confirmed it for them.
     */
    consent?: { text: string; recordedById: string | null },
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
            ...(status ? { status } : {}),
            ...(consent
              ? {
                  consentAcceptedAt: new Date(),
                  // The wording is copied, not referenced: the gym may revise
                  // it tomorrow and this has to keep saying what was agreed.
                  consentText: consent.text,
                  consentRecordedById: consent.recordedById,
                }
              : {}),
            // Minted here so the welcome email and WhatsApp message can
            // carry the card link without a follow-up write.
            idCardToken: idCardService.mintToken(),
          },
          select: {
            id: true,
            memberId: true,
            role: true,
            status: true,
            idCardToken: true,
            shift: { select: shiftSelect },
            user: { select: { id: true, name: true, email: true, phone: true, gender: true } },
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
  /**
   * Whose birthday falls inside the next few days.
   *
   * Raw SQL because the question is about a month and a day rather than a
   * date: Prisma can compare whole timestamps, and a birthday is the one date
   * in the app whose year is the part that does not matter. `strftime` on the
   * stored UTC midnight gives "MM-DD", and the window is built as a set of
   * those keys so it wraps across new year without arithmetic.
   *
   * Active memberships only — a lapsed member is not somebody the gym should
   * be sending greetings to before they have been asked to come back.
   */
  listBirthdays(tenantId: string, dayKeys: string[]) {
    if (dayKeys.length === 0) return Promise.resolve([]);

    return prisma.$queryRaw<
      {
        id: string;
        memberId: number;
        userId: string;
        name: string;
        phone: string | null;
        email: string;
        avatarUrl: string | null;
        gender: string | null;
        dateOfBirth: string;
        day: string;
      }[]
    >`
      SELECT
        m."id"            AS id,
        m."memberId"      AS memberId,
        u."id"            AS userId,
        u."name"          AS name,
        u."phone"         AS phone,
        u."email"         AS email,
        u."avatarUrl"     AS avatarUrl,
        u."gender"        AS gender,
        u."dateOfBirth"   AS dateOfBirth,
        strftime('%m-%d', u."dateOfBirth") AS day
      FROM "TenantMembership" m
      JOIN "User" u ON u."id" = m."userId"
      WHERE m."tenantId" = ${tenantId}
        AND m."status" = 'ACTIVE'
        AND u."dateOfBirth" IS NOT NULL
        AND strftime('%m-%d', u."dateOfBirth") IN (${Prisma.join(dayKeys)})
      ORDER BY day ASC, u."name" ASC
    `;
  },

  async listMembers(
    tenantId: string,
    page: number,
    limit: number,
    roleFilter?: string,
    search?: string,
    statusFilter?: string,
    badgeId?: string,
    occupationId?: string,
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

    if (roleFilter) {
      where.role = roleFilter;
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
    if (occupationId) {
      // Merged rather than assigned: the search above may already have put a
      // `user` filter here, and overwriting it would quietly drop the search.
      where.user = { ...(where.user as Prisma.UserWhereInput | undefined), occupationId };
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
          // When this membership last changed. For a suspended or deleted one
          // that is the closest thing to a leaving date the schema holds, and
          // it is what the analytics screen already counts as one — so the
          // roster can answer "who was deactivated in March" with the same
          // people that screen counted.
          updatedAt: true,
          shift: { select: shiftSelect },
          // Ids only. The roster filters by badge in the browser, and an id is
          // all that takes — names and colours belong to the badge list the
          // screen already holds.
          badges: { select: { id: true } },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              gender: true,
              dateOfBirth: true,
              occupationId: true,
              occupation: { select: occupationSummarySelect },
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
        // Ids alone. The badges screen already holds the names and colours; what
        // it could not tell was which of them are this member's, so it fell back
        // to how many people hold each — which on a member's own screen reads as
        // "you have this".
        badges: { select: { id: true } },
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
            gender: true,
            dateOfBirth: true,
            occupationId: true,
            occupation: { select: occupationSummarySelect },
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
        gender: true,
        dateOfBirth: true,
        occupationId: true,
        occupation: { select: occupationSummarySelect },
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
  updateMemberRole(membershipId: string, role: string) {
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

    // How many *people* owe something, as distinct from how many payment rows
    // are outstanding. A member with three unpaid entries is one person to
    // chase, and "12 pending payments" does not say whether that is twelve
    // members or two.
    const [withPendingPayment, pastDue] = await Promise.all([
      prisma.tenantMembership.count({
        where: {
          tenantId,
          status: { not: "DELETED" },
          payments: { some: { status: "PENDING" } },
        },
      }),
      // Term already run out and not yet renewed. Suspended memberships are
      // excluded: they have stopped being someone to chase and started being
      // someone to win back, which is a different number.
      prisma.tenantMembership.count({
        where: {
          tenantId,
          status: "ACTIVE",
          dueDate: { not: null, lt: startOfToday },
        },
      }),
    ]);

    // What the gym's members do for a living, which is the question the
    // occupation list exists to answer. Active memberships only: the mix of
    // people training here is a fact about now, not about everyone who ever
    // signed up.
    //
    // One grouped statement rather than Prisma's `groupBy`, which cannot join:
    // doing this through the query builder meant pulling every active user id
    // into memory first, and a gym with two thousand members would have paid
    // for that on every load of the analytics screen.
    const occupationRows = await prisma.$queryRaw<
      { id: string | null; name: string | null; icon: string | null; members: number | bigint }[]
    >`
      SELECT o."id" AS id, o."name" AS name, o."icon" AS icon, COUNT(*) AS members
      FROM "TenantMembership" m
      JOIN "User" u ON u."id" = m."userId"
      LEFT JOIN "Occupation" o ON o."id" = u."occupationId"
      WHERE m."tenantId" = ${tenantId}
        AND m."status" = 'ACTIVE'
      GROUP BY o."id"
      ORDER BY members DESC, name ASC
    `;

    const occupations = occupationRows.map((row) => ({
      id: row.id,
      // A null row is everyone nobody has asked yet, which is worth showing
      // rather than hiding — it is the number that says whether the rest of
      // this breakdown can be trusted.
      name: row.name ?? "Not recorded",
      icon: row.icon,
      members: Number(row.members),
    }));

    return {
      total,
      active,
      suspended,
      joinedToday,
      joinedWeek,
      joinedMonth,
      withPendingPayment,
      pastDue,
      occupations,
    };
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
    return prisma.tenantMembership.findMany({
      where: overdueWhere(tenantId, overdueDays),
      select: {
        id: true,
        memberId: true,
        dueDate: true,
        // The push that accompanies the suspension email is addressed to the
        // account, not the membership, so the id comes back with the row.
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });
  },

  /**
   * Suspend everyone this gym counts as overdue.
   *
   * Written as the same predicate `getOverdueMembers` reads with, rather than
   * as a list of the ids it returned. Two reasons: an id list is one bind
   * parameter per member and D1 allows about a hundred per statement, so a gym
   * with a long overdue list would fail outright; and a member who pays between
   * the read and this update simply stops matching, where an id list would
   * suspend them anyway.
   */
  async suspendOverdue(tenantId: string, overdueDays: number) {
    return prisma.tenantMembership.updateMany({
      where: overdueWhere(tenantId, overdueDays),
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
        // The RFID card this member carries, so the desk can see it and change
        // it without going near the machine.
        deviceUserPin: true,
        rfidCardNumber: true,
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
            gender: true,
            dateOfBirth: true,
            occupationId: true,
            occupation: { select: occupationSummarySelect },
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

  /**
   * Every window of membership this person has ever paid for.
   *
   * The whole ledger, not the ten rows the detail page shows: a gap history
   * built from a page of payments would report holes where the older terms
   * simply were not loaded, which is worse than reporting none.
   *
   * Only COMPLETED rows, and only those carrying both ends of a window. A
   * pending renewal has bought no time yet, and a balance row against a term
   * already granted deliberately carries no window of its own — counting either
   * would close a gap that is really still open.
   */
  async membershipCoverageWindows(membershipId: string, tenantId: string) {
    // `joinedAt` comes back with them: the wait between signing up and paying
    // for the first time is one of the gaps, and reading it separately would be
    // a second round trip for one column.
    const [membership, windows] = await Promise.all([
      prisma.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { joinedAt: true },
      }),
      /**
       * Only `validUntil` is required, not both ends.
       *
       * Requiring `validFrom` too silently dropped every imported term — this
       * gym's own history has rows carrying an end date and no start — and the
       * timeline then reported months of "no cover" over terms the member had
       * plainly paid for, contradicting the payment list on the same screen.
       * The start is reconstructed from `paidAt` instead, and marked as such.
       */
      prisma.payment.findMany({
        where: {
          membershipId,
          tenantId,
          status: "COMPLETED",
          validUntil: { not: null },
        },
        orderBy: { validUntil: "asc" },
        select: { validFrom: true, validUntil: true, paidAt: true, createdAt: true },
      }),
    ]);

    return { membership, windows };
  },
};
