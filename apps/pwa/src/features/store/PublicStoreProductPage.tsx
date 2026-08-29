/**
 * Documentation: One product, for somebody with no account.
 *
 * - The same product page a member sees, minus the two things that need an identity: adding to a basket, and adding an opinion. Both are replaced by a route to sign in rather than hidden, because a visitor who cannot buy still deserves to know that they could.
 * - Reads the unauthenticated `/public/store/products/:productId` endpoint, which returns only what is actually for sale. A retired product is "not found" here: a visitor has no way to tell that apart from one the gym never stocked, and no reason to.
 * - Comments are readable without an account on purpose. What members say about a supplement is a large part of why somebody browses a gym's store before joining it.
 * - Primary exports: PublicStoreProductPage.
 */
import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { ProductOverview } from "./ProductOverview";

export default function PublicStoreProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [product, setProduct] = React.useState<StoreProduct | null>(null);
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
            <Button variant="outline" onClick={() => navigate("/store")}>
              <ArrowLeft className="h-4 w-4" />
              Back to store
            </Button>
          }
        />
      </div>
    );
  }

  const signIn = () => navigate(isAuthenticated ? "/dashboard/store" : "/login");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <Button variant="outline" size="sm" onClick={() => navigate("/store")}>
        <ArrowLeft className="h-4 w-4" />
        Back to store
      </Button>

      <ProductOverview
        product={product}
        action={
          /* The count without the button: a visitor can see that forty people
             liked this, and what they are missing by not having an account. */
          <span className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground">
            <Heart className="h-4 w-4" />
            {product.likeCount}
          </span>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="text-sm text-muted-foreground">
            {isAuthenticated
              ? "Open the store from your dashboard to buy this."
              : "Sign in as a member to buy this, or to join the conversation."}
          </p>
          <Button size="sm" onClick={signIn}>
            {isAuthenticated ? "Go to store" : "Sign in"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comments ({comments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            comments={comments}
            canComment={false}
            canDelete={() => false}
            onSubmit={async () => {}}
            onDelete={() => {}}
            emptyDescription="No member has written about this yet."
            signedOutHint={
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Sign in as a member of this gym to leave a comment.
              </p>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
