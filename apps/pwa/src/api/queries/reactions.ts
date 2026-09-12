/**
 * Documentation: Likes and comments queries and mutations.
 *
 * - One set of hooks for every reaction in the app, taking the subject as an argument. A product page, a gym's wall and an exercise all use these; there is nothing per-subject left to write.
 * - A like is applied optimistically. It is the one write in this app where the round trip is longer than the gesture: a heart that fills a beat after the tap reads as broken, and the rollback on failure costs a count that was only ever an estimate.
 * - `alsoInvalidate` is how a caller keeps its own screen honest — a product's card shows the same count its page does, so the store prefix is cleared alongside the thread.
 * - Not gym-scoped: the subject is in the path and the gym rides on the tenant header, so these are plain app-level hooks rather than the tenant-aware ones.
 * - Primary exports: useComments, useToggleLike, useAddComment, useDeleteComment.
 */
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { reactionsApi, type CommentFeed, type ReactionSubject } from "@/api/reactions";
import { queryKeys } from "@/lib/query-keys";
import { unwrap, useAppMutation } from "./shared";

/** The thread, and the state the like button should show. */
export function useComments(
  subjectType: ReactionSubject,
  subjectId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.reactions.comments(subjectType, subjectId ?? "none"),
    enabled: Boolean(subjectId) && (options.enabled ?? true),
    queryFn: async (): Promise<CommentFeed> =>
      (await reactionsApi.listComments(subjectType, subjectId!)).data.data,
  });
}

/**
 * Toggle a like, filling the heart before the server answers.
 *
 * The cached feed is edited in place and restored if the write fails, so the
 * gesture is instant and a failure does not leave a lie on screen.
 */
export function useToggleLike(
  subjectType: ReactionSubject,
  subjectId: string | undefined,
  alsoInvalidate: QueryKey[] = [],
) {
  const queryClient = useQueryClient();
  const key = queryKeys.reactions.comments(subjectType, subjectId ?? "none");

  return useAppMutation(
    async (liked: boolean) =>
      unwrap(
        liked
          ? await reactionsApi.like(subjectType, subjectId!)
          : await reactionsApi.unlike(subjectType, subjectId!),
      ),
    {
      invalidates: alsoInvalidate,
      onMutate: async (liked: boolean) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<CommentFeed>(key);

        if (previous) {
          queryClient.setQueryData<CommentFeed>(key, {
            ...previous,
            liked,
            // Clamped at zero: an optimistic count is an estimate, and an
            // estimate should never read "-1 likes".
            likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)),
          });
        }

        return { previous };
      },
      onError: (_error, _liked, context) => {
        const restored = (context as { previous?: CommentFeed } | undefined)?.previous;
        if (restored) queryClient.setQueryData(key, restored);
      },
    },
  );
}

export function useAddComment(
  subjectType: ReactionSubject,
  subjectId: string | undefined,
  alsoInvalidate: QueryKey[] = [],
) {
  return useAppMutation(
    async (body: string) => unwrap(await reactionsApi.addComment(subjectType, subjectId!, body)),
    {
      invalidates: [
        queryKeys.reactions.comments(subjectType, subjectId ?? "none"),
        ...alsoInvalidate,
      ],
    },
  );
}

export function useDeleteComment(
  subjectType: ReactionSubject,
  subjectId: string | undefined,
  alsoInvalidate: QueryKey[] = [],
) {
  return useAppMutation(
    async (commentId: string) => unwrap(await reactionsApi.deleteComment(commentId)),
    {
      invalidates: [
        queryKeys.reactions.comments(subjectType, subjectId ?? "none"),
        ...alsoInvalidate,
      ],
    },
  );
}
