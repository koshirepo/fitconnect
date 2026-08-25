/**
 * Documentation: Public service.
 *
 * - Implements the business rules for public gym discovery and tenant profile exposure by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: publicService.
 */
import { normalizeTenantHost, publicRepository } from "./public.repository";

export const publicService = {
  /**
   * Execute the `get tenant by slug` workflow for the public module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getTenantBySlug(slug: string) {
    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };
    return { data: { tenant } };
  },

  async getTenantByHost(host: string) {
   const slug = normalizeTenantHost(host);
   if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };
   return this.getTenantBySlug(slug);
  },

  async getTenantBrandingByHost(host: string) {
   const slug = normalizeTenantHost(host);
   if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

   const tenant = await publicRepository.findTenantBySlug(slug);
   if (!tenant) return { error: "Tenant not found.", status: 404 as const };

   return {
     data: {
       tenant: {
         id: tenant.id,
         name: tenant.name,
         slug: tenant.slug,
         logoUrl: tenant.logoUrl,
         description: tenant.description,
         markdown: tenant.markdown,
         email: tenant.email,
         phone: tenant.phone,
         address: tenant.address,
         estd: tenant.estd,
       },
     },
   };
  },

  /**
   * Execute the `list gyms` workflow for the public module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listGyms(page: number, limit: number) {
   const { tenants, total } = await publicRepository.listActiveTenants(page, limit);
   return { data: { gyms: tenants }, total };
  },
};
