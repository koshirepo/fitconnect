/**
 * Documentation: Shared API response helpers.
 *
 * - Creates success, message, pagination, and error envelopes that match the contracts exported from `src/shared/types/api.ts`.
 * - Controllers should use these helpers instead of building ad-hoc JSON so clients can depend on a stable response shape.
 * - Primary exports: ok, okMessage, okPaginated, error, badRequest, unauthorized, forbidden, notFound, conflict, tooManyRequests, validationError, internalError.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type {
  ErrorCode,
  ApiResponse as SuccessResponse,
  MessageResponse,
  PaginatedResponse,
  ApiError,
} from "@fitconnect/shared";

// Re-export the type for local usage
export type { ErrorCode };

// Derive ErrorResponse from the shared ApiError type
type ErrorResponse = ApiError;

// ─── Success helpers ──────────────────────────────────────────────────────────

/** Return a success envelope with data. */
export const ok = <T>(c: Context, data: T, status: ContentfulStatusCode = 200) =>
  c.json<SuccessResponse<T>>({ success: true, data }, status);

/** Return a success envelope with only a message (no entity data). */
export const okMessage = (c: Context, message: string, status: ContentfulStatusCode = 200) =>
  c.json<MessageResponse>({ success: true, message }, status);

/** Return a success envelope with data + pagination meta. */
export const okPaginated = <T>(
  c: Context,
  data: T,
  pagination: { page: number; limit: number; total: number },
) =>
  c.json<PaginatedResponse<T>>({
    success: true,
    data,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });

// ─── Error helpers ────────────────────────────────────────────────────────────

/** Generic error response. */
export const error = (
  c: Context,
  status: ContentfulStatusCode,
  code: ErrorCode,
  message: string,
  details?: unknown,
) => {
  const body: ErrorResponse = {
    success: false,
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  return c.json(body, status);
};

/** 400 Bad Request */
export const badRequest = (c: Context, message: string, details?: unknown) =>
  error(c, 400, "BAD_REQUEST", message, details);

/** 401 Unauthorized */
export const unauthorized = (c: Context, message: string) =>
  error(c, 401, "UNAUTHORIZED", message);

/** 403 Forbidden */
export const forbidden = (c: Context, message: string) =>
  error(c, 403, "FORBIDDEN", message);

/** 404 Not Found */
export const notFound = (c: Context, message: string) =>
  error(c, 404, "NOT_FOUND", message);

/** 409 Conflict */
export const conflict = (c: Context, message: string) =>
  error(c, 409, "CONFLICT", message);

/** 429 Too Many Requests */
export const tooManyRequests = (c: Context, message: string) =>
  error(c, 429, "TOO_MANY_REQUESTS", message);

/** 422 Validation Error */
export const validationError = (c: Context, details: unknown) =>
  error(c, 422, "VALIDATION_ERROR", "Request validation failed.", details);

/** 500 Internal Server Error */
export const internalError = (c: Context) =>
  error(c, 500, "INTERNAL_ERROR", "Internal server error.");

/**
 * Map a service failure onto the matching HTTP response.
 *
 * Services in this codebase report failure as `{ error, status }`, and several
 * controllers were funnelling all of it through `badRequest`. A refusal then
 * arrived as 400 rather than 403, a missing record as 400 rather than 404, and
 * a dead payment gateway as 400 rather than 502 — so a client could not tell
 * "you may not" from "you typed it wrong", and an outage looked like a bad
 * request in the logs.
 *
 * Anything unrecognised is treated as an upstream failure rather than the
 * caller's fault, which is the safer of the two guesses.
 */
export const failWith = (
  c: Context,
  result: { error?: string; status?: number },
) => {
  const message = result.error ?? "Request failed.";

  switch (result.status) {
    case 400:
      return badRequest(c, message);
    case 401:
      return unauthorized(c, message);
    case 403:
      return forbidden(c, message);
    case 404:
      return notFound(c, message);
    case 409:
      return conflict(c, message);
    case 429:
      return tooManyRequests(c, message);
    default:
      return error(c, (result.status ?? 502) as ContentfulStatusCode, "GATEWAY_ERROR", message);
  }
};
