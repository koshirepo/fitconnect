/**
 * Documentation: Shared API envelope contracts.
 *
 * - Defines the response and error shapes that both the API and any typed client can depend on for transport-level consistency.
 * - Update these contracts together with `src/lib/response.ts` whenever the wire format changes.
 * - Primary exports: ApiResponse, MessageResponse, PaginatedResponse, ApiError, ErrorCode.
 */
// ─── API Response Envelopes ───────────────────────────────────────────────────
// Used by both API (to build responses) and PWA (to type-check responses).

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
  /** Too many attempts from one caller; the abuse guards on public endpoints. */
  | "TOO_MANY_REQUESTS"
  /** An upstream provider (e.g. the payment gateway) failed or refused. */
  | "GATEWAY_ERROR"
  | "INTERNAL_ERROR";

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  // Set by the PWA's offline interceptor when a mutation is queued locally.
  _offlineQueued?: boolean;
}

export interface MessageResponse {
  success: true;
  message: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}
