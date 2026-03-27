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
  findBySlug(slug: string) {
    return prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
  },

  findByPhone(phone: string) {
    return prisma.tenant.findFirst({
      where: { phone },
      select: { id: true },
    });
  },

  findUserByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email },
      select: { id: true, email: true, phone: true, status: true },
    });
  },

  findUserByPhone(phone: string) {
    return prisma.user.findUnique({
      where: { phone },
      select: { id: true, email: true, phone: true, status: true },
    });
  },

  findById(id: string) {
    return prisma.tenant.findUnique({
      where: { slug: id },
      select: tenantSelect,
    });
  },

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

  update(id: string, data: Record<string, unknown>) {
    return prisma.tenant.update({
      where: { id },
      data,
      select: tenantSelect,
    });
  },

  updateStatus(id: string, status: AccountStatus) {
    return prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, slug: true, status: true },
    });
  },

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
};
