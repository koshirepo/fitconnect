/**
 * Documentation: Public controller.
 *
 * - Owns the HTTP boundary for public gym discovery and tenant profile exposure, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: publicController.
 */
import type { Context } from "hono";
import { publicService } from "./public.service";
import { parsePagination } from "../../lib/pagination";
import { ok, okPaginated, notFound, badRequest, conflict } from "../../lib/response";
import {
  guestOrderSchema,
  guestOrderLookupSchema,
  guestCheckoutVerifySchema,
} from "../store/store.schema";

export const publicController = {
  /**
   * Handle the `get tenant by slug` HTTP action for the public module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getTenantBySlug(c: Context) {
    const slug = c.req.param("slug");
    if (!slug) return notFound(c, "Slug is required.");
    const result = await publicService.getTenantBySlug(slug);
    if ("error" in result) return notFound(c, result.error ?? "Tenant not found.");
    return ok(c, result.data);
  },

  async getTenantByHost(c: Context) {
   const host = c.req.query("host") ?? c.req.header("host") ?? "";
   if (!host) return notFound(c, "Tenant host is required.");
   const result = await publicService.getTenantByHost(host);
   if ("error" in result) return notFound(c, result.error ?? "Tenant not found.");
   return ok(c, result.data);
  },

  /** A gym's catalogue, for a visitor who has not signed in. */
  async getTenantStore(c: Context) {
   const host = c.req.query("host") ?? c.req.header("host") ?? "";
   if (!host) return notFound(c, "Tenant host is required.");
   const result = await publicService.getStoreByHost(host);
   if ("error" in result) return notFound(c, result.error ?? "Tenant not found.");
   return ok(c, result.data);
  },

  /** One product's page, for a visitor: media, body, and what members said. */
  async getTenantStoreProduct(c: Context) {
   const host = c.req.query("host") ?? c.req.header("host") ?? "";
   if (!host) return notFound(c, "Tenant host is required.");
   const result = await publicService.getStoreProductByHost(host, c.req.param("productId")!);
   if ("error" in result) return notFound(c, result.error ?? "Product not found.");
   return ok(c, result.data);
  },

  /**
   * Reserve a basket from the public storefront.
   *
   * The gym comes from the request host, never the body — a caller cannot place
   * an order into a gym they did not visit.
   */
  async placeGuestOrder(c: Context) {
    const host = c.req.query("host") ?? c.req.header("host") ?? "";
    if (!host) return notFound(c, "Tenant host is required.");

    const parsed = guestOrderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(c, "Check the details and try again.", parsed.error.issues);
    }

    const result = await publicService.placeGuestOrderByHost(host, parsed.data);
    if ("error" in result) {
      // 409 is the one worth distinguishing: it means the shop sold out from
      // under the basket, which the page retries differently to a typo.
      return result.status === 409
        ? conflict(c, result.error)
        : result.status === 404
          ? notFound(c, result.error)
          : badRequest(c, result.error);
    }
    return ok(c, result.data, 201);
  },

  /** Open a card payment for a basket, without an account. */
  async startGuestCheckout(c: Context) {
    const host = c.req.query("host") ?? c.req.header("host") ?? "";
    if (!host) return notFound(c, "Tenant host is required.");

    const parsed = guestOrderSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(c, "Check the details and try again.", parsed.error.issues);
    }

    const result = await publicService.startGuestCheckoutByHost(host, parsed.data);
    if ("error" in result) {
      return result.status === 409
        ? conflict(c, result.error!)
        : result.status === 404
          ? notFound(c, result.error!)
          : badRequest(c, result.error!);
    }
    return ok(c, result.data, 201);
  },

  /** Settle it against the signature the checkout widget returned. */
  async verifyGuestCheckout(c: Context) {
    const host = c.req.query("host") ?? c.req.header("host") ?? "";
    if (!host) return notFound(c, "Tenant host is required.");

    const parsed = guestCheckoutVerifySchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return badRequest(c, "That payment could not be read.", parsed.error.issues);
    }

    const result = await publicService.verifyGuestCheckoutByHost(host, parsed.data);
    if ("error" in result) {
      return result.status === 404
        ? notFound(c, result.error!)
        : badRequest(c, result.error!);
    }
    return ok(c, result.data);
  },

  /** Checking on a reservation with the reference and the phone number. */
  async lookupGuestOrder(c: Context) {
    const host = c.req.query("host") ?? c.req.header("host") ?? "";
    if (!host) return notFound(c, "Tenant host is required.");

    const parsed = guestOrderLookupSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(c, "Check the details and try again.", parsed.error.issues);
    }

    const result = await publicService.lookupGuestOrderByHost(host, parsed.data);
    if ("error" in result) return notFound(c, result.error ?? "Order not found.");
    return ok(c, result.data);
  },

  /** The gym's own wall — likes and comments — readable without an account. */
  async getTenantSocial(c: Context) {
   const host = c.req.query("host") ?? c.req.header("host") ?? "";
   if (!host) return notFound(c, "Tenant host is required.");
   const result = await publicService.getSocialByHost(host);
   if ("error" in result) return notFound(c, result.error ?? "Tenant not found.");
   return ok(c, result.data);
  },

  async getTenantBranding(c: Context) {
   const host = c.req.query("host") ?? c.req.header("host") ?? "";
   if (!host) return notFound(c, "Tenant host is required.");
   const result = await publicService.getTenantBrandingByHost(host);
   if ("error" in result) return notFound(c, result.error ?? "Tenant not found.");
   return ok(c, result.data);
  },

  /**
   * Handle the `list gyms` HTTP action for the public module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listGyms(c: Context) {
    const { page, limit } = parsePagination(c);
    const { data, total } = await publicService.listGyms(page, limit);
    return okPaginated(c, data, { page, limit, total });
  },
};
