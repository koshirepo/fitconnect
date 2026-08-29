/**
 * Documentation: Likes and comments API client.
 *
 * - Wraps the two reaction surfaces: a product in the gym store, and the gym itself.
 * - Liking is a POST and unliking a DELETE on the same path rather than one call taking a boolean, so a request retried on a flaky connection lands on the state the member pressed for.
 * - Every call answers with the resulting `liked` and `likeCount`, so a button never has to re-read to find out what it just did.
 * - Primary exports: socialApi.
 */
import { api } from "./client";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type { SocialComment, SocialState } from "@fitconnect/shared/types/models";

/** A comment list, with the state its like button should show. */
export type CommentFeed = SocialState & { comments: SocialComment[] };

export const socialApi = {
  // ─── Store products ────────────────────────────────────────────────────────

  likeProduct: (tenantId: string, productId: string) =>
    api.post<ApiResponse<SocialState>>(
      `/tenants/${tenantId}/store/products/${productId}/like`,
    ),

  unlikeProduct: (tenantId: string, productId: string) =>
    api.delete<ApiResponse<SocialState>>(
      `/tenants/${tenantId}/store/products/${productId}/like`,
    ),

  listProductComments: (tenantId: string, productId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<CommentFeed>>(
      `/tenants/${tenantId}/store/products/${productId}/comments`,
      { params: { page, limit } },
    ),

  addProductComment: (tenantId: string, productId: string, body: string) =>
    api.post<ApiResponse<{ comment: SocialComment }>>(
      `/tenants/${tenantId}/store/products/${productId}/comments`,
      { body },
    ),

  deleteProductComment: (tenantId: string, commentId: string) =>
    api.delete<ApiResponse<{ deleted: boolean }>>(
      `/tenants/${tenantId}/store/comments/${commentId}`,
    ),

  // ─── The gym itself ────────────────────────────────────────────────────────

  likeTenant: (tenantId: string) =>
    api.post<ApiResponse<SocialState>>(`/tenants/${tenantId}/social/like`),

  unlikeTenant: (tenantId: string) =>
    api.delete<ApiResponse<SocialState>>(`/tenants/${tenantId}/social/like`),

  listTenantComments: (tenantId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<CommentFeed>>(`/tenants/${tenantId}/social/comments`, {
      params: { page, limit },
    }),

  addTenantComment: (tenantId: string, body: string) =>
    api.post<ApiResponse<{ comment: SocialComment }>>(`/tenants/${tenantId}/social/comments`, {
      body,
    }),

  deleteTenantComment: (tenantId: string, commentId: string) =>
    api.delete<ApiResponse<{ deleted: boolean }>>(
      `/tenants/${tenantId}/social/comments/${commentId}`,
    ),
};
