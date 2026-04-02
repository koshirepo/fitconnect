/**
 * Documentation: Tenants repository.
 *
 * - Encapsulates Prisma queries for tenant onboarding, tenant profile maintenance, and tenant administration, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: tenantRepository.
 */
import { prisma } from "../../lib/prisma";
import type { AccountStatus } from "../../shared/types/enums";

type CreateTenantData = {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  markdown?: string;
  description?: string;
};

type CreateTenantAdminData = {
  userId?: string;
  name?: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  avatarUrl?: string;
};

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  address: true,
  logoUrl: true,
  markdown: true,
  description: true,
  estd: true,
  status: true,
  platformExpiresAt: true,
  createdAt: true,
} as const;

const tenantListSelect = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  status: true,
  platformExpiresAt: true,
  createdAt: true,
} as const;

export const tenantRepository = {
  /**
   * Run the `find by slug` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findBySlug(slug: string) {
    return prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
  },

  /**
   * Run the `find by lookup` persistence operation for the tenants module.
   * Accepts either the public slug or the internal tenant id so platform and tenant-scoped flows can resolve the same entity safely.
   */
  findByLookup(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: {
        OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }],
      },
      select: tenantSelect,
    });
  },

  /**
   * Run the `find by phone` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findByPhone(phone: string) {
    return prisma.tenant.findFirst({
      where: { phone },
      select: { id: true },
    });
  },

  /**
   * Run the `find user by email` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, phone: true, status: true },
    });
  },

  /**
   * Run the `find by id` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findById(id: string) {
    return prisma.tenant.findUnique({
      where: { id },
      select: tenantSelect,
    });
  },

  /**
   * Run the `create` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  create(data: {
    name: string;
    slug: string;
    email?: string;
    phone?: string;
    address?: string;
  }) {
    return prisma.tenant.create({
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });
  },

  /**
   * Run the `create with admin` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async createWithAdmin(input: {
    tenant: CreateTenantData;
    admin: CreateTenantAdminData;
  }) {
    const admin = input.admin;
    let userId = "";

    if (admin.userId) {
      userId = admin.userId;
    } else {
      if (!admin.name || !admin.email || !admin.passwordHash) {
        throw new Error("Missing admin user data for tenant creation.");
      }

      const createdUser = await prisma.user.create({
        data: {
          name: admin.name,
          email: admin.email,
          ...(admin.phone ? { phone: admin.phone } : {}),
          passwordHash: admin.passwordHash,
          platformRole: "USER",
          ...(admin.avatarUrl ? { avatarUrl: admin.avatarUrl } : {}),
        },
        select: { id: true },
      });
      userId = createdUser.id;
    }

    const tenant = await prisma.tenant.create({
      data: input.tenant,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });

    await prisma.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId,
        memberId: 1,
        role: "ADMIN",
      },
    });

    return tenant;
  },

  /**
   * Run the `update` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  update(id: string, data: Record<string, unknown>) {
    return prisma.tenant.update({
      where: { id },
      data,
      select: tenantSelect,
    });
  },

  /**
   * Run the `update status` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateStatus(id: string, status: AccountStatus) {
    return prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, slug: true, status: true },
    });
  },

  /**
   * Run the `list` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async list(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: tenantListSelect,
      }),
      prisma.tenant.count(),
    ]);
    return { tenants, total };
  },

  /**
   * Run the `create platform payment` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async createPlatformPayment(data: {
    tenantId: string;
    amount: number;
    note?: string;
    extendsUntil: Date;
    recordedBy: string;
  }) {
    const payment = await prisma.platformPayment.create({
      data,
      select: {
        id: true,
        tenantId: true,
        amount: true,
        note: true,
        extendsUntil: true,
        recordedBy: true,
        createdAt: true,
        recordedByUser: { select: { id: true, name: true } },
      },
    });

    await prisma.tenant.update({
      where: { id: data.tenantId },
      data: { platformExpiresAt: data.extendsUntil },
    });

    return payment;
  },

  /**
   * Run the `list platform payments` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listPlatformPayments(tenantId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      prisma.platformPayment.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          tenantId: true,
          amount: true,
          note: true,
          extendsUntil: true,
          recordedBy: true,
          createdAt: true,
          recordedByUser: { select: { id: true, name: true } },
        },
      }),
      prisma.platformPayment.count({ where: { tenantId } }),
    ]);
    return { payments, total };
  },

  /**
   * Run the `list active tenants for overdue enforcement` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listActiveTenantsForOverdueEnforcement() {
    return prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        settings: {
          select: {
            overdueDays: true,
          },
        },
      },
    });
  },

  /**
   * Run the `list active tenants for scheduled reports` persistence operation for the tenants module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listActiveTenantsForScheduledReports() {
    return prisma.tenant.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        settings: {
          select: {
            overdueDays: true,
          },
        },
        memberships: {
          where: {
            role: "ADMIN",
            status: "ACTIVE",
          },
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
              },
            },
          },
        },
      },
    });
  },
};
