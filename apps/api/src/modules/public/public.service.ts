/**
 * Documentation: Public service.
 *
 * - Implements the business rules for public gym discovery and tenant profile exposure by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: publicService.
 */
import { normalizeTenantHost, publicRepository } from "./public.repository";
import { storeGuestService } from "../store/store-sale.service";
import type { GuestOrderInput, GuestOrderLookupInput } from "../store/store.schema";
import { storeRepository } from "../store/store.repository";
import { socialRepository } from "../social/social.repository";
import { socialService } from "../social/social.service";

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

  /**
   * A gym's shop window, for somebody with no account.
   *
   * Only what is actually for sale: retired products and retired variants are
   * left out, because a visitor has no way to tell the difference between "we
   * stopped stocking this" and "we never did". Buying still needs an account —
   * this is the browsing half.
   */
  async getStoreByHost(host: string) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    const products = await storeRepository.listProducts(tenant.id, {});

    return {
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        products,
      },
    };
  },

  /**
   * One product's page, for a visitor.
   *
   * Comments come with it rather than as a second request: they are the reason
   * somebody opens a product page they cannot buy from, and splitting them out
   * would mean a visible gap under the photos on every load.
   */
  async getStoreProductByHost(host: string, productId: string) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    const product = await storeRepository.findProduct(tenant.id, productId);
    // A retired product is "not found" to a visitor. They have no way to tell
    // that apart from a product the gym never stocked, and no reason to.
    if (!product || !product.isActive) return { error: "Product not found.", status: 404 as const };

    const { comments } = await socialRepository.listProductComments(productId, 1, 50);

    return {
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        product: { ...product, variants: product.variants.filter((v) => v.isActive) },
        comments,
      },
    };
  },

  /**
   * What people have said about the gym itself.
   *
   * Readable with no account, because the audience for a gym's wall is largely
   * people who have not joined it yet. Writing still needs one — `liked` is
   * false here for want of anybody to have liked it.
   */
  async getSocialByHost(host: string) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    const result = await socialService.listTenantComments(tenant.id, null, 1, 50);
    return { data: { tenantId: tenant.id, ...result.data } };
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
         brandColor: tenant.brandColor,
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

  /**
   * Reserve from the public storefront, without an account.
   *
   * The gym is fixed by the request host rather than taken from the body, the
   * same rule public signup follows: a caller cannot place an order into a gym
   * they did not visit.
   */
  async placeGuestOrderByHost(host: string, input: GuestOrderInput) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    return storeGuestService.place(tenant.id, input);
  },

  /** Pay for a basket now, without an account. */
  async startGuestCheckoutByHost(host: string, input: GuestOrderInput) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    return storeGuestService.startCheckout(tenant.id, input);
  },

  /** Settle it against the signature the checkout widget handed back. */
  async verifyGuestCheckoutByHost(
    host: string,
    input: { orderId: string; paymentId: string; signature: string },
  ) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    return storeGuestService.verifyCheckout(tenant.id, input);
  },

  /** Checking on a reservation: the reference the desk gave, plus the phone. */
  async lookupGuestOrderByHost(host: string, input: GuestOrderLookupInput) {
    const slug = normalizeTenantHost(host);
    if (!slug) return { error: "Tenant host is invalid.", status: 404 as const };

    const tenant = await publicRepository.findTenantBySlug(slug);
    if (!tenant) return { error: "Tenant not found.", status: 404 as const };

    return storeGuestService.lookup(tenant.id, input.orderId, input.buyerPhone);
  },
};
