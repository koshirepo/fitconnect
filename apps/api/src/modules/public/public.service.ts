import { publicRepository } from "./public.repository";

export const publicService = {
  async getTenantBySlug(slug: string) {
    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };
    return { data: { tenant } };
  },

  async listGyms(page: number, limit: number) {
    const { tenants, total } = await publicRepository.listActiveTenants(page, limit);
    return { data: { gyms: tenants }, total };
  },
};
