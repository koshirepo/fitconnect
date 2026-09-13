/**
 * Documentation: Likes and comments API client.
 *
 * - One client for every reaction in the app. A gym's page, a product in a gym's store and an exercise in the platform library are all `(subjectType, subjectId)` now, so there is one set of calls rather than one per thing worth liking.
 * - Liking is a POST and unliking a DELETE on the same path rather than one call taking a boolean, so a request retried on a flaky connection lands on the state the person pressed for.
 * - Every call answers with the resulting `liked` and `likeCount`, so a button never has to re-read to find out what it just did.
 * - The gym a request is acting in rides on the `x-tenant-id` header the axios client already sends; these paths carry no gym id.
 * - Primary exports: reactionsApi, type ReactionSubject, type CommentFeed.
 */
import { api } from "./client";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type { SocialComment, SocialState } from "@fitconnect/shared/types/models";

/** What can be liked and commented on. */
export type ReactionSubject = "GYM" | "PRODUCT" | "EXERCISE" | "DIET_PLAN";

/** A comment list, with the state its like button should show. */
export type CommentFeed = SocialState & { comments: SocialComment[] };

export const reactionsApi = {
  like: (subjectType: ReactionSubject, subjectId: string) =>
    api.post<ApiResponse<SocialState>>(`/reactions/${subjectType}/${subjectId}/like`),

  unlike: (subjectType: ReactionSubject, subjectId: string) =>
    api.delete<ApiResponse<SocialState>>(`/reactions/${subjectType}/${subjectId}/like`),

  listComments: (subjectType: ReactionSubject, subjectId: string, page = 1, limit = 20) =>
    api.get<PaginatedResponse<CommentFeed>>(`/reactions/${subjectType}/${subjectId}/comments`, {
      params: { page, limit },
    }),

  addComment: (subjectType: ReactionSubject, subjectId: string, body: string) =>
    api.post<ApiResponse<{ comment: SocialComment }>>(
      `/reactions/${subjectType}/${subjectId}/comments`,
      { body },
    ),

  /**
   * Deleting takes only the comment id.
   *
   * A comment id is already unique, and naming its subject would let a delete
   * be refused for quoting the wrong parent — a distinction nobody removing
   * their own sentence cares about.
   */
  deleteComment: (commentId: string) =>
    api.delete<ApiResponse<{ deleted: boolean }>>(`/reactions/comments/${commentId}`),
};
