import type { Context } from "hono";
import { publicService } from "./public.service";
import { parsePagination } from "../../lib/pagination";
import { ok, okPaginated, notFound } from "../../lib/response";

export const publicController = {
  async getTenantBySlug(c: Context) {
    const slug = c.req.param("slug");
    if (!slug) return notFound(c, "Slug is required.");
    const result = await publicService.getTenantBySlug(slug);
    if ("error" in result) return notFound(c, result.error ?? "Tenant not found.");
    return ok(c, result.data);
  },

  async listGyms(c: Context) {
    const { page, limit } = parsePagination(c);
    const { data, total } = await publicService.listGyms(page, limit);
    return okPaginated(c, data, { page, limit, total });
  },
};
