import type { Context } from "hono";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../shared/constants";

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
