/**
 * Documentation: Public repository.
 *
 * - Encapsulates Prisma queries for public gym discovery and tenant profile exposure, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: publicRepository.
 */
import { prisma } from "../../lib/prisma";
import { normalizeTenantHost } from "../../lib/tenant-host";

const publicTenantSelect = {
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
  createdAt: true,
  _count: {
    select: {
      memberships: true,
    },
  },
} as const;

// Host parsing lives in `lib/tenant-host` so the API and PWA share one
// definition of what counts as a gym subdomain. Re-exported here because
// callers already import it from this module.
export { normalizeTenantHost } from "../../lib/tenant-host";

export const publicRepository = {
  /**
   * Run the `find tenant by slug` persistence operation for the public module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findTenantBySlug(slug: string) {
    return prisma.tenant.findFirst({
      where: { slug, status: "ACTIVE" },
      select: {
        ...publicTenantSelect,
        subscriptions: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            description: true,
            amount: true,
            durationDays: true,
          },
          orderBy: { amount: "asc" as const },
        },
        shifts: {
          where: { isActive: true },
          select: {
            id: true,
            tenantId: true,
            name: true,
            description: true,
            startTime: true,
            endTime: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ startTime: "asc" as const }, { name: "asc" as const }],
        },
      },
    });
  },

  findTenantByHost(host: string) {
   const slug = normalizeTenantHost(host);
   if (!slug) return null;
   return this.findTenantBySlug(slug);
  },

  /**
   * Run the `list active tenants` persistence operation for the public module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listActiveTenants(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where: { status: "ACTIVE" },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          address: true,
          estd: true,
          _count: { select: { memberships: true } },
        },
      }),
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
    ]);
    return { tenants, total };
  },
};
