/**
 * Documentation: Pagination query parsing.
 *
 * - Extracts `page` and `limit` query parameters from Hono requests and clamps them to shared defaults and maximums.
 * - Use this helper in list endpoints to keep pagination behavior uniform across modules.
 * - Primary exports: parsePagination.
 */
import type { Context } from "hono";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@fitconnect/shared/constants";

/**
 * Extract and clamp page/limit from query parameters.
 */
export function parsePagination(c: Context) {
  const page = Math.max(1, Number(c.req.query("page") ?? "1"));
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(c.req.query("limit") ?? String(DEFAULT_PAGE_SIZE))),
  );
  return { page, limit };
}
