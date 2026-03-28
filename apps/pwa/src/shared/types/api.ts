// ─── API Response Envelopes ───────────────────────────────────────────────────
// Used by both API (to build responses) and PWA (to type-check responses).

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BAD_REQUEST"
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
