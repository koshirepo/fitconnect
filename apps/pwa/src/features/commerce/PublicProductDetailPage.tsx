import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { commerceApi } from "@/api/commerce";
import { reviewsApi } from "@/api/reviews";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  PackageSearch,
  ShoppingCart,

  Plus,
  Minus,
  Trash2,
  Star,
  MessageSquare,
  FileText,
} from "lucide-react";
import type { Product } from "@/types/api";
import type { ProductReview, RatingStats } from "@/api/reviews";
import { formatCurrency } from "./pricing";
import { ShopHeader } from "./ShopHeader";
import { getCartItems, getCartTotalQuantity, upsertCartItem, removeCartItem } from "./cart";
import { ReviewForm } from "@/components/commerce/ReviewForm";
import { ReviewList } from "@/components/commerce/ReviewList";
import { RatingSummary } from "@/components/commerce/RatingSummary";
import { PRODUCT_IMAGE_ASPECT_CLASS } from "./product-image";

export default function PublicProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = React.useState<Product | null>(null);
  const [cart, setCart] = React.useState(() => getCartItems());
  const [selectedPhoto, setSelectedPhoto] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [activeTab, setActiveTab] = React.useState<"details" | "write">("details");
  const [reviews, setReviews] = React.useState<ProductReview[]>([]);
  const [ratingStats, setRatingStats] = React.useState<RatingStats | null>(null);
  const [reviewsLoading, setReviewsLoading] = React.useState(false);

  const loadReviewsAndStats = async (pId: string) => {
    try {
      setReviewsLoading(true);
      const [statsRes, reviewsRes] = await Promise.all([
        reviewsApi.getRatingStats(pId),
        reviewsApi.listByProduct(pId, 1, 10),
      ]);
      setRatingStats(statsRes.data.data);
      setReviews(reviewsRes.data.data);
    } catch (err) {
      console.error("Failed to load reviews:", err);
    } finally {
      setReviewsLoading(false);
    }
  };

  React.useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setError("");
    commerceApi
      .getProductById(productId)
      .then((res) => setProduct(res.data.data.product))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
    loadReviewsAndStats(productId);
  }, [productId]);


  const cartCount = getCartTotalQuantity(cart);
  const cartQty = product ? (cart.find((i) => i.productId === product.id)?.quantity ?? 0) : 0;
  const unavailable = !product?.isActive || (product?.stock ?? 0) <= 0;

  const handleAdd = () => {
    if (!product || unavailable) return;
    const next = cartQty + product.minOrderQty;
    if (next > product.maxOrderQty) return;
    if (next > product.stock) return;
    setCart(upsertCartItem(product.id, next));
  };

  const handleIncrease = () => {
    if (!product) return;
    const next = cartQty + 1;
    if (next > product.maxOrderQty) {
      setError(`Max order quantity is ${product.maxOrderQty}.`);
      return;
    }
    if (next > product.stock) {
      setError(`Only ${product.stock} units in stock.`);
      return;
    }
    setError("");
    setCart(upsertCartItem(product.id, next));
  };

  const handleDecrease = () => {
    if (!product) return;
    setError("");
    if (cartQty <= product.minOrderQty) {
      setCart(removeCartItem(product.id));
    } else {
      setCart(upsertCartItem(product.id, cartQty - 1));
    }
  };

  if (loading) return <DetailPageSkeleton />;

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <EmptyState
          icon={PackageSearch}
          title="Product not found"
          description={error || "This product may be unavailable."}
          action={
            <Button variant="outline" onClick={() => navigate("/shop")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Catalog
            </Button>
          }
        />
      </div>
    );
  }

  const activePhoto = product.photos[selectedPhoto] ?? product.photos[0];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <ShopHeader backTo="/shop" backLabel="Shop" cartCount={cartCount}>
        <p className="text-sm text-muted-foreground hidden md:block truncate max-w-xs">
          {product.category && (
            <span className="text-muted-foreground">{product.category} / </span>
          )}
          <span className="text-foreground font-medium">{product.name}</span>
        </p>
      </ShopHeader>

      {/* ── Hero: image + info ───────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
          {/* ── Gallery ── */}
          <div className="space-y-3">
            <div
              className={`relative ${PRODUCT_IMAGE_ASPECT_CLASS} max-h-[70vh] w-full overflow-hidden rounded-2xl border bg-muted`}
            >
              {activePhoto ? (
                <img src={activePhoto} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  No image available
                </div>
              )}
              {product.stock <= 5 && product.stock > 0 && (
                <span className="absolute top-3 left-3 rounded-full bg-yellow-500/90 px-2.5 py-1 text-xs font-semibold text-black">
                  Only {product.stock} left
                </span>
              )}
              {product.stock === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold text-muted-foreground rounded-2xl">
                  Out of stock
                </div>
              )}
            </div>
            {product.photos.length > 1 && (
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                {product.photos.map((photo, index) => (
                  <button
                    type="button"
                    key={`${photo}-${index}`}
                    onClick={() => setSelectedPhoto(index)}
                    className={`aspect-square overflow-hidden rounded-lg border transition-all ${
                      selectedPhoto === index
                        ? "ring-2 ring-primary ring-offset-1"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={photo}
                      alt={`${product.name} ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Info panel ── */}
          <div className="flex flex-col gap-5">
            <div>
              {product.category && (
                <p className="mb-1 text-sm font-medium text-primary">{product.category}</p>
              )}
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
              {ratingStats && ratingStats.totalReviews > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium text-foreground">
                    {ratingStats.averageRating.toFixed(1)}
                  </span>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      document
                        .getElementById("reviews-section")
                        ?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="hover:underline underline-offset-2"
                  >
                    {ratingStats.totalReviews}{" "}
                    {ratingStats.totalReviews === 1 ? "review" : "reviews"}
                  </button>
                </div>
              )}
            </div>

            {product.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
            )}

            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-bold">{formatCurrency(product.price)}</span>
                <span className="text-sm text-muted-foreground">per unit</span>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>
                  Stock:{" "}
                  <span
                    className={
                      product.stock > 0
                        ? "text-foreground font-medium"
                        : "text-destructive font-medium"
                    }
                  >
                    {product.stock}
                  </span>
                </span>
                <span>·</span>
                <span>
                  Min / Max: {product.minOrderQty} / {product.maxOrderQty}
                </span>
              </div>

              {cartQty === 0 ? (
                <Button className="w-full" size="lg" onClick={handleAdd} disabled={unavailable}>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {unavailable ? "Unavailable" : "Add to Cart"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleDecrease}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title={cartQty <= product.minOrderQty ? "Remove from cart" : "Decrease"}
                    >
                      {cartQty <= product.minOrderQty ? (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      ) : (
                        <Minus className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex-1 text-center">
                      <span className="text-2xl font-bold tabular-nums">{cartQty}</span>
                      <p className="text-xs text-muted-foreground">in cart</p>
                    </div>

                    <button
                      type="button"
                      onClick={handleIncrease}
                      disabled={cartQty >= product.maxOrderQty || cartQty >= product.stock}
                      className="flex h-11 w-11 items-center justify-center rounded-lg border bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                      title="Increase quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/shop/cart")}
                  >
                    View Cart
                  </Button>
                </div>
              )}

              {!product.isActive && (
                <p className="text-center text-sm text-destructive">
                  This product is currently unavailable.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Markdown description ─────────────────────────────────────── */}
        {product.markdown && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Product Details</h2>
            </div>
            <div className="rounded-2xl border bg-card px-6 py-8 sm:px-10">
              <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-bold prose-a:text-primary prose-img:rounded-xl prose-pre:rounded-xl">
                <Markdown remarkPlugins={[remarkGfm]}>{product.markdown}</Markdown>
              </div>
            </div>
          </div>
        )}

        {/* ── Reviews ─────────────────────────────────────────────────── */}
        <div id="reviews-section" className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Reviews &amp; Ratings</h2>
            </div>
            {ratingStats && (
              <span className="text-sm text-muted-foreground">
                {ratingStats.totalReviews} {ratingStats.totalReviews === 1 ? "review" : "reviews"}
              </span>
            )}
          </div>

          <div className="rounded-2xl border bg-card">
            {/* Tabs */}
            <div className="flex gap-1 border-b px-6 pt-4">
              {(["details", "write"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 pb-3 text-sm font-medium transition border-b-2 -mb-px ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "details" ? "Rating & Reviews" : "Write a Review"}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-6">
              {activeTab === "details" && (
                <>
                  {ratingStats ? (
                    <RatingSummary stats={ratingStats} />
                  ) : (
                    <p className="text-center text-muted-foreground py-8">Loading ratings…</p>
                  )}
                  <div className="border-t pt-6">
                    <h3 className="font-semibold mb-4">Customer Reviews</h3>
                    {reviewsLoading ? (
                      <p className="text-center text-muted-foreground py-8">Loading reviews…</p>
                    ) : (
                      <ReviewList
                        reviews={reviews}
                        onCommentAdded={() => loadReviewsAndStats(productId!)}
                        onHelpfulToggled={() => {}}
                      />
                    )}
                  </div>
                </>
              )}
              {activeTab === "write" && (
                <ReviewForm
                  productId={productId!}
                  onSuccess={() => {
                    loadReviewsAndStats(productId!);
                    setActiveTab("details");
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
