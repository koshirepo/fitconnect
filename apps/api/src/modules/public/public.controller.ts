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
import { ok, okPaginated, notFound } from "../../lib/response";

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
