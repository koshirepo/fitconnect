/**
 * Documentation: Shared API response helpers.
 *
 * - Creates success, message, pagination, and error envelopes that match the contracts exported from `src/shared/types/api.ts`.
 * - Controllers should use these helpers instead of building ad-hoc JSON so clients can depend on a stable response shape.
 * - Primary exports: ok, okMessage, okPaginated, error, badRequest, unauthorized, forbidden, notFound, conflict, validationError, internalError.
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

/** 422 Validation Error */
export const validationError = (c: Context, details: unknown) =>
  error(c, 422, "VALIDATION_ERROR", "Request validation failed.", details);

/** 500 Internal Server Error */
export const internalError = (c: Context) =>
  error(c, 500, "INTERNAL_ERROR", "Internal server error.");
