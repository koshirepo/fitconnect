/**
 * Documentation: One product, for a member who is signed in.
 *
 * - The page a storefront card links to: full media, the long description, every variant, and what other members have said about it.
 * - Buying happens on the storefront, which owns the basket. A variant's "Add" here hands the id back through the URL rather than duplicating basket, coupon, and checkout state on a second screen — two baskets that could disagree is a worse problem than one extra navigation.
 * - The like and the comment box need a membership, which the API resolves from the session. A coach or an admin browsing their own gym has one too, so nothing here is member-only.
 * - Primary exports: StoreProductDetailPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import { useCurrentTenantId } from "@/api/queries/shared";
import {
  basketTotalQuantity,
  readBasket,
  setBasketQuantity,
  type BasketEntry,
} from "./basket";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useStoreProduct } from "@/api/queries/store";
import {
  useAddProductComment,
  useDeleteProductComment,
  useProductComments,
  useToggleProductLike,
} from "@/api/queries/social";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { LikeButton } from "@/components/social/LikeButton";
import { CommentThread } from "@/components/social/CommentThread";
import { Package } from "lucide-react";
import type { SocialComment } from "@fitconnect/shared/types/models";
import { ProductOverview } from "./ProductOverview";

export default function StoreProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useAppNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canBuy = can(Permission.STORE_BUY_SELF);
  const canModerate = can(Permission.STORE_MANAGE);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const tenantId = useCurrentTenantId();
  // The same basket the storefront reads. Staff previewing a product put
  // things in it exactly as a member would, rather than collecting a draft.
  const [basket, setBasket] = React.useState<BasketEntry[]>(() => readBasket(tenantId));

  const productQuery = useStoreProduct(productId);
  const commentsQuery = useProductComments(productId);
  const toggleLike = useToggleProductLike(productId);
  const addComment = useAddProductComment(productId);
  const deleteComment = useDeleteProductComment();

  const feed = commentsQuery.data;

  const handleLike = async (liked: boolean) => {
    try {
      await toggleLike.mutateAsync(liked);
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleComment = async (body: string) => {
    try {
      await addComment.mutateAsync(body);
      toast.success("Comment posted.");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const handleDelete = async (comment: SocialComment) => {
    try {
      await deleteComment.mutateAsync(comment.id);
      toast.success("Comment deleted.");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  if (productQuery.isPending) return <DetailPageSkeleton />;

  if (!productQuery.data) {
    return (
      <EmptyState
        icon={Package}
        title="Product not found"
        description="It may have been removed from the catalogue."
        action={
          <Button variant="outline" onClick={() => navigate("/dashboard/store")}>
            <ArrowLeft className="h-4 w-4" />
            Back to store
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProductOverview
        product={productQuery.data}
        action={
          <LikeButton
            liked={feed?.liked ?? false}
            count={feed?.likeCount ?? productQuery.data.likeCount}
            onToggle={handleLike}
            disabled={commentsQuery.isPending}
            label="product"
          />
        }
        quantityFor={(variant) =>
          basket.find((entry) => entry.variantId === variant.id)?.quantity ?? 0
        }
        onQuantityChange={
          canBuy && productQuery.data
            ? (variant, quantity) =>
                setBasket(
                  setBasketQuantity(
                    tenantId,
                    {
                      variantId: variant.id,
                      productId: productQuery.data.id,
                      productName: productQuery.data.name,
                      variantName: variant.name,
                      unitPrice: variant.price,
                      stock: variant.stock,
                      ...(Array.isArray(productQuery.data.photos) && productQuery.data.photos[0]
                        ? { photo: productQuery.data.photos[0] }
                        : {}),
                    },
                    quantity,
                  ),
                )
            : undefined
        }
      />

      {basketTotalQuantity(basket) > 0 && (
        <Button className="w-full" onClick={() => navigate("/shop")}>
          View basket · {basketTotalQuantity(basket)}
        </Button>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Comments{feed ? ` (${feed.comments.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={feed?.comments ?? []}
            loading={commentsQuery.isPending}
            canComment
            canDelete={(comment) => canModerate || comment.author.id === currentUserId}
            onSubmit={handleComment}
            onDelete={handleDelete}
            submitting={addComment.isPending}
            emptyDescription="Tell other members how this worked out for you."
          />
        </CardContent>
      </Card>
    </div>
  );
}
