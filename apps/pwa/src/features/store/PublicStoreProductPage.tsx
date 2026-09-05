/**
 * Documentation: One product, for somebody with no account.
 *
 * - The same product page a member sees, minus the two things that need an identity: adding to a basket, and adding an opinion. Both are replaced by a route to sign in rather than hidden, because a visitor who cannot buy still deserves to know that they could.
 * - Reads the unauthenticated `/public/store/products/:productId` endpoint, which returns only what is actually for sale. A retired product is "not found" here: a visitor has no way to tell that apart from one the gym never stocked, and no reason to.
 * - Comments are readable without an account on purpose. What members say about a supplement is a large part of why somebody browses a gym's store before joining it.
 * - Primary exports: PublicStoreProductPage.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import {
  basketTotalQuantity,
  readBasket,
  setBasketQuantity,
  type BasketEntry,
} from "./basket";
import {
  useAddProductComment,
  useDeleteProductComment,
  useProductComments,
  useToggleProductLike,
} from "@/api/queries/social";
import { useCurrentTenantId } from "@/api/queries/shared";
import { LikeButton } from "@/components/social/LikeButton";
import { useToast } from "@/components/ui/toast";
import { ArrowLeft, Heart, Package } from "lucide-react";
import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { CommentThread } from "@/components/social/CommentThread";
import type { SocialComment, StoreProduct } from "@fitconnect/shared/types/models";
import { ShareButton } from "@/components/ui/share-button";
import { ProductOverview } from "./ProductOverview";

export default function PublicStoreProductPage() {
  // The basket itself, not a draft of one: pressing + puts it in, exactly as
  // the platform shop does. Held here so the rows re-render as it changes.
  const [basket, setBasket] = React.useState<BasketEntry[]>([]);
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const currentUserId = useAuthStore((state) => state.user?.id);

  // A signed-in member on this page is still a member: the storefront is public
  // but the reader need not be anonymous. When a membership at this gym is in
  // the session, the page uses the same authenticated feed the dashboard does,
  // so liking, commenting, and buying all work from the public url. A visitor
  // has no tenant id, the tenant-scoped queries stay disabled, and the public
  // read-only copy below is what renders.
  const memberTenantId = useCurrentTenantId();
  const asMember = Boolean(isAuthenticated && memberTenantId);

  const memberFeed = useProductComments(asMember ? productId : undefined);
  const toggleLike = useToggleProductLike(productId);
  const addComment = useAddProductComment(productId);
  const deleteComment = useDeleteProductComment();

  const [product, setProduct] = React.useState<StoreProduct | null>(null);
  // Only for the share text — "Shaker Bottle at Rudra Gym" says more in a
  // WhatsApp message than the product name alone.
  const [tenantName, setTenantName] = React.useState("");
  // The basket is keyed by gym, and this page is reached without one in the
  // session when a visitor is browsing, so it comes from the product response.
  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [comments, setComments] = React.useState<SocialComment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!productId) return;
    let active = true;

    publicApi
      .getStoreProduct(productId)
      .then((res) => {
        if (!active) return;
        setProduct(res.data.data.product);
        setTenantName(res.data.data.tenant.name);
        setTenantId(res.data.data.tenant.id);
        // Whatever is already in this gym's basket, so the rows open showing
        // what the storefront would show.
        setBasket(readBasket(res.data.data.tenant.id));
        setComments(res.data.data.comments);
      })
      .catch((caught) => {
        if (active) setError(getApiError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <DetailPageSkeleton />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <EmptyState
          icon={Package}
          title="Product not found"
          description={error || "It is no longer on sale at this gym."}
          action={
            <Button variant="outline" onClick={() => navigate("/shop")}>
              <ArrowLeft className="h-4 w-4" />
              Back to store
            </Button>
          }
        />
      </div>
    );
  }

  const feed = memberFeed.data;
  /** The member feed once it lands, the public snapshot until then. */
  const shownComments = asMember && feed ? feed.comments : comments;

  /**
   * The address of this page, as the reader is standing on it.
   *
   * Taken from `window.location` rather than rebuilt from the slug so a link
   * shared from the gym's own subdomain stays on that subdomain — which is
   * where the gym's branding, its store, and its signup all live.
   */
  const shareUrl = typeof window === "undefined" ? "" : window.location.href;

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

  const handleDeleteComment = async (comment: SocialComment) => {
    try {
      await deleteComment.mutateAsync(comment.id);
      toast.success("Comment deleted.");
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">

      <ProductOverview
        product={product}
        action={
          <div className="flex items-center gap-2">
            {asMember ? (
              <LikeButton
                liked={feed?.liked ?? false}
                count={feed?.likeCount ?? product.likeCount}
                onToggle={handleLike}
                disabled={memberFeed.isPending}
                label="product"
              />
            ) : (
              /* The count without the button: a visitor can see that forty people
                 liked this, and what they are missing by not having an account. */
              <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
                <Heart className="h-4 w-4" />
                {product.likeCount}
              </span>
            )}
            {/* Shown to everyone, member or not. The page is public, so the
                link works for whoever receives it — which is the whole point
                of a member sending it to somebody who has no account yet. */}
            <ShareButton
              url={shareUrl}
              title={product.name}
              text={`${product.name} at ${tenantName}`}
            />
          </div>
        }
        // Everyone gets this, not only members. A visitor sent here to
        // choose between three flavours had no way to choose one: the grid
        // said "Options", the product page listed them, and nothing on it
        // added anything. Guests can buy now, so the button that starts
        // that has to be here too.
        quantityFor={(variant) =>
          basket.find((entry) => entry.variantId === variant.id)?.quantity ?? 0
        }
        onQuantityChange={(variant, quantity) => {
          if (!product) return;
          setBasket(
            setBasketQuantity(
              tenantId,
              {
                variantId: variant.id,
                productId: product.id,
                productName: product.name,
                variantName: variant.name,
                unitPrice: variant.price,
                stock: variant.stock,
                ...(Array.isArray(product.photos) && product.photos[0]
                  ? { photo: product.photos[0] }
                  : {}),
              },
              quantity,
            ),
          );
        }}
      />

      {basketTotalQuantity(basket) > 0 && (
        <Button className="w-full" onClick={() => navigate("/shop")}>
          <ShoppingCart className="h-4 w-4" />
          View basket · {basketTotalQuantity(basket)}
        </Button>
      )}

      {!asMember && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              Sign in as a member to buy this, or to join the conversation.
            </p>
            <Button size="sm" onClick={() => navigate("/login")}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comments ({shownComments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={shownComments}
            loading={asMember && memberFeed.isPending}
            canComment={asMember}
            submitting={addComment.isPending}
            canDelete={(comment) => asMember && comment.author.id === currentUserId}
            onSubmit={handleComment}
            onDelete={handleDeleteComment}
            emptyDescription="No member has written about this yet."
            signedOutHint={
              // This page never takes a comment — writing one needs a
              // membership, which the public storefront cannot check. But
              // telling somebody who is already signed in to sign in reads as a
              // broken session, so they are pointed at the screen that does
              // take one instead.
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                {isAuthenticated ? (
                  <>
                    You are signed in, but not as a member of this gym.{" "}
                    <Link to="/signup" className="text-primary hover:underline">
                      Join it
                    </Link>{" "}
                    to like, comment, and buy.
                  </>
                ) : (
                  "Sign in as a member of this gym to leave a comment."
                )}
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
