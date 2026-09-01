/**
 * Documentation: Likes and comments queries and mutations.
 *
 * - Wraps `socialApi` so a page declares what it needs rather than juggling fetches, optimistic state, and refetch-after-write by hand.
 * - A like is applied optimistically. It is the one write in this app where the round trip is longer than the gesture: a heart that fills a beat after the tap reads as broken, and the rollback on failure costs a count that was already only an estimate.
 * - Product reactions invalidate the store prefix, because the catalogue card shows the same count the product page does. Gym reactions have their own key, since nothing about the store changes when somebody likes the gym.
 * - Primary exports: useProductComments, useToggleProductLike, useAddProductComment, useDeleteProductComment, and the gym-level equivalents.
 */
import { useQueryClient } from "@tanstack/react-query";
import { socialApi, type CommentFeed } from "@/api/social";
import { queryKeys } from "@/lib/query-keys";
import { unwrap, useCurrentTenantId, useTenantMutation, useTenantQuery } from "./shared";

/** Every reaction to the gym itself, as the prefix invalidation uses. */
function socialRoot(tenantId: string | null | undefined) {
  return ["social", tenantId ?? "none"];
}

// ─── Store products ──────────────────────────────────────────────────────────

export function useProductComments(productId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.store.productComments(tenantId, productId ?? "none"),
    async (tenantId): Promise<CommentFeed> =>
      (await socialApi.listProductComments(tenantId, productId!)).data.data,
    { enabled: Boolean(productId) },
  );
}

/**
 * Toggle a product like, filling the heart before the server answers.
 *
 * The cached feed is edited in place and restored if the write fails, so the
 * gesture is instant and a failure does not leave a lie on screen.
 */
export function useToggleProductLike(productId: string | undefined) {
  const tenantId = useCurrentTenantId();
  const queryClient = useQueryClient();
  const key = queryKeys.store.productComments(tenantId ?? "none", productId ?? "none");

  return useTenantMutation(
    async (id, liked: boolean) =>
      unwrap(
        liked
          ? await socialApi.likeProduct(id, productId!)
          : await socialApi.unlikeProduct(id, productId!),
      ),
    {
      invalidates: [queryKeys.store.root(tenantId)],
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

export function useAddProductComment(productId: string | undefined) {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, body: string) => unwrap(await socialApi.addProductComment(id, productId!, body)),
    { invalidates: [queryKeys.store.root(tenantId)] },
  );
}

export function useDeleteProductComment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, commentId: string) => unwrap(await socialApi.deleteProductComment(id, commentId)),
    { invalidates: [queryKeys.store.root(tenantId)] },
  );
}

// ─── The gym itself ──────────────────────────────────────────────────────────

export function useTenantComments(options: { enabled?: boolean } = {}) {
  return useTenantQuery(
    (tenantId) => queryKeys.social.tenantComments(tenantId),
    async (tenantId): Promise<CommentFeed> =>
      (await socialApi.listTenantComments(tenantId)).data.data,
    options,
  );
}

export function useToggleTenantLike() {
  const tenantId = useCurrentTenantId();
  const queryClient = useQueryClient();
  const key = queryKeys.social.tenantComments(tenantId ?? "none");

  return useTenantMutation(
    async (id, liked: boolean) =>
      unwrap(liked ? await socialApi.likeTenant(id) : await socialApi.unlikeTenant(id)),
    {
      invalidates: [socialRoot(tenantId)],
      onMutate: async (liked: boolean) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<CommentFeed>(key);

        if (previous) {
          queryClient.setQueryData<CommentFeed>(key, {
            ...previous,
            liked,
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

export function useAddTenantComment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(async (id, body: string) => unwrap(await socialApi.addTenantComment(id, body)), {
    invalidates: [socialRoot(tenantId)],
  });
}

export function useDeleteTenantComment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, commentId: string) => unwrap(await socialApi.deleteTenantComment(id, commentId)),
    { invalidates: [socialRoot(tenantId)] },
  );
}
