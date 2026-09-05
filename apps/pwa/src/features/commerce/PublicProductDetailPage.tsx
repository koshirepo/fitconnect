import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  PackageSearch,
  ShoppingCart,

  Star,
  MessageSquare,
  FileText,
} from "lucide-react";
import type { Product } from "@/types/api";
import { formatCurrency } from "./pricing";
import { ShopHeader } from "./ShopHeader";
import { getCartItems, getCartTotalQuantity, upsertCartItem } from "./cart";
import { useProductRatingStats, useProductReviews } from "@/api/queries/reviews";
import { ReviewForm } from "@/components/commerce/ReviewForm";
import { ReviewList } from "@/components/commerce/ReviewList";
import { RatingSummary } from "@/components/commerce/RatingSummary";
import { ProductDetailLayout } from "@/components/catalog/product-detail-layout";
import { stockLabel, stockState } from "@/components/catalog/stock";
import { VariantOptionsCard } from "@/components/catalog/variant-options";
import { useSeo, absoluteUrl } from "@/lib/seo";
import { ShareButton } from "@/components/ui/share-button";

export default function PublicProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = React.useState<Product | null>(null);
  const [cart, setCart] = React.useState(() => getCartItems());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [activeTab, setActiveTab] = React.useState<"details" | "write">("details");

  // Reviews and the rating histogram come from react-query rather than a fetch
  // in an effect. A posted review or comment invalidates the product's review
  // prefix, so the list, the average and the histogram refresh together — the
  // old version reloaded them by hand and did not after a helpful vote.
  const reviewsQuery = useProductReviews(productId);
  const ratingStatsQuery = useProductRatingStats(productId);
  const reviews = reviewsQuery.data ?? [];
  const ratingStats = ratingStatsQuery.data ?? null;
  const reviewsLoading = reviewsQuery.isPending;

  React.useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setError("");
    commerceApi
      .getProductById(productId)
      .then((res) => setProduct(res.data.data.product))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
  }, [productId]);


  const cartCount = getCartTotalQuantity(cart);
  const sellableVariants = React.useMemo(
    () => (product?.variants ?? []).filter((variant) => variant.isActive),
    [product],
  );

  /** Everything of this product in the cart, across its forms. */
  const cartQtyForProduct = product
    ? cart
        .filter((item) => item.productId === product.id)
        .reduce((total, item) => total + item.quantity, 0)
    : 0;

  const unavailable = !product?.isActive || (product?.stock ?? 0) <= 0;

  // Written from the product once it has loaded. While it is loading the title
  // is generic rather than wrong — a crawler that renders will see the real one,
  // and a crawler that does not is served the edge-rendered head instead.
  useSeo({
    title: product?.name ?? "Product",
    description:
      product?.description?.trim() ||
      (product ? `Buy ${product.name} online at FitConnect. Delivered across India.` : "Gym accessories and equipment."),
    canonicalPath: productId ? `/shop/products/${productId}` : undefined,
    image: product?.photos?.[0],
    type: "product",
    jsonLd: product
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: product.description ?? product.name,
          image: product.photos ?? [],
          sku: product.id,
          offers: {
            "@type": "Offer",
            price: product.price,
            priceCurrency: "INR",
            availability: unavailable
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
            url: absoluteUrl(`/shop/products/${product.id}`),
          },
        }
      : undefined,
  });


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

        <ProductDetailLayout
          name={product.name}
          photos={product.photos}
          summary={product.description}
          badges={
            product.category ? (
              <Badge variant="secondary" className="text-xs">
                {product.category}
              </Badge>
            ) : undefined
          }
          meta={
            ratingStats && ratingStats.totalReviews > 0 ? (
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
                  className="underline-offset-2 hover:underline"
                >
                  {ratingStats.totalReviews}{" "}
                  {ratingStats.totalReviews === 1 ? "review" : "reviews"}
                </button>
              </div>
            ) : undefined
          }
          actions={
            /* Beside the title, matching a gym's product page. A link passed
               into a WhatsApp group is how most of this shop's traffic
               arrives, so it is a control, not a footnote. */
            <ShareButton
              label="Share"
              url={absoluteUrl(`/shop/products/${product.id}`)}
              title={product.name}
              text={
                product.description?.trim() ||
                `${product.name} — ${formatCurrency(product.price)}`
              }
            />
          }
          galleryFallback={
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              No image available
            </div>
          }
          galleryOverlay={
            stockLabel(product.stock, product.isActive) ? (
              stockState(product.stock, product.isActive) === "out" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold text-muted-foreground">
                  {stockLabel(product.stock, product.isActive)}
                </div>
              ) : (
                <span className="absolute top-3 left-3 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-amber-950">
                  {stockLabel(product.stock, product.isActive)}
                </span>
              )
            ) : null
          }
        >
            {/* Always, even for a product sold in one form. A card listing a
                single option is not clutter — it is the row that carries the
                price and the quantity, and it is what the gym store has always
                shown. The panel that used to sit under it is gone: it repeated
                the price the rows already give, and its "Stock" was a total
                across variants that no single one of them had. */}
            <VariantOptionsCard
              variants={sellableVariants}
              maxPerOrder={product.maxOrderQty}
              disabled={!product.isActive}
              quantityFor={(variant) =>
                cart.find(
                  (item) => item.productId === product.id && item.variantId === variant.id,
                )?.quantity ?? 0
              }
              onQuantityChange={(variant, quantity) => {
                setError("");
                setCart(upsertCartItem(product.id, variant.id, quantity));
              }}
            />

            {cartQtyForProduct > 0 && (
              <Button variant="outline" className="w-full" onClick={() => navigate("/shop/cart")}>
                <ShoppingCart className="h-4 w-4" />
                View cart · {cartQtyForProduct}
              </Button>
            )}

            {!product.isActive && (
              <p className="text-center text-sm text-destructive">
                This product is currently unavailable.
              </p>
            )}

            {product.markdown && (
              <div className="rounded-xl border bg-card p-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-base font-semibold">Details</h2>
                </div>
                <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-a:text-primary prose-img:rounded-xl prose-pre:rounded-xl">
                  <Markdown remarkPlugins={[remarkGfm]}>{product.markdown}</Markdown>
                </div>
              </div>
            )}
        </ProductDetailLayout>

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
                      <ReviewList productId={productId!} reviews={reviews} />
                    )}
                  </div>
                </>
              )}
              {activeTab === "write" && (
                <ReviewForm
                  productId={productId!}
                  onSuccess={() => setActiveTab("details")}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
