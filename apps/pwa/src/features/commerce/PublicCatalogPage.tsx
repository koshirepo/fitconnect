import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PackageOpen,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Search,
  SearchX,
  Check,
  Truck,
  ShieldCheck,
  ReceiptText,
} from "lucide-react";
import type { Product } from "@/types/api";
import { ProductCard } from "@/components/catalog/product-card";
import {
  CartCountBadge,
  ProductGrid,
  StorefrontToolbar,
} from "@/components/catalog/storefront-toolbar";
import { useSeo, absoluteUrl } from "@/lib/seo";
import {
  getCartItems,
  getCartTotalQuantity,
  upsertCartItem,
  removeCartItem,
  type CartItem,
} from "./cart";

const ALL_CATEGORIES = "All";

export default function PublicCatalogPage() {
  useSeo({
    title: "Shop Gym Accessories & Equipment",
    description:
      "Buy gym accessories online — performance apparel, hydration bottles, protein shakers and workout gear. Delivered across India.",
    canonicalPath: "/shop",
    keywords:
      "buy gym accessories online, protein shaker, gym water bottle, gym apparel, workout gear India",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "FitConnect Shop",
      url: absoluteUrl("/shop"),
      description:
        "Gym accessories and equipment: apparel, hydration, shakers and workout gear.",
    },
  });

  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [products, setProducts] = React.useState<Product[]>([]);
  const [cart, setCart] = React.useState<CartItem[]>(() => getCartItems());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState(ALL_CATEGORIES);

  React.useEffect(() => {
    setLoading(true);
    commerceApi
      .listProducts(1, 200)
      .then((res) => setProducts(res.data.data.products))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const cartCount = getCartTotalQuantity(cart);

  // Categories come from the catalog itself — the storefront never has to be
  // redeployed when a gym starts selling something new.
  const categories = React.useMemo(() => {
    const found = new Set<string>();
    for (const p of products) if (p.category) found.add(p.category);
    return [ALL_CATEGORIES, ...Array.from(found).sort()];
  }, [products]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== ALL_CATEGORIES && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category?.toLowerCase().includes(q) ?? false) ||
        (p.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [products, query, category]);

  /**
   * The variant a card acts on.
   *
   * A product sold in one form is unambiguous, so the card can add it. More than
   * one is a choice, and the choice belongs on the product page — the same rule
   * the gym store already followed.
   */
  const soleVariant = (product: Product) => {
    const sellable = (product.variants ?? []).filter((variant) => variant.isActive);
    return sellable.length === 1 ? sellable[0]! : null;
  };

  const getCartQty = (productId: string) =>
    cart.find((item) => item.productId === productId)?.quantity ?? 0;

  const handleAdd = (product: Product) => {
    setError("");
    if (!product.isActive || product.stock <= 0) return;
    const nextQty = getCartQty(product.id) + product.minOrderQty;
    if (nextQty > product.maxOrderQty) {
      setError(`${product.name}: max order quantity is ${product.maxOrderQty}.`);
      return;
    }
    if (nextQty > product.stock) {
      setError(`${product.name}: only ${product.stock} units available.`);
      return;
    }
    setCart(upsertCartItem(product.id, soleVariant(product)?.id ?? null, nextQty));
  };

  const handleIncrease = (product: Product) => {
    setError("");
    const current = getCartQty(product.id);
    const nextQty = current + 1;
    if (nextQty > product.maxOrderQty) {
      setError(`${product.name}: max order quantity is ${product.maxOrderQty}.`);
      return;
    }
    if (nextQty > product.stock) {
      setError(`${product.name}: only ${product.stock} units in stock.`);
      return;
    }
    setCart(upsertCartItem(product.id, soleVariant(product)?.id ?? null, nextQty));
  };

  const handleDecrease = (product: Product) => {
    setError("");
    const current = getCartQty(product.id);
    const variantId = soleVariant(product)?.id ?? null;
    if (current <= product.minOrderQty) {
      setCart(removeCartItem(product.id, variantId));
    } else {
      setCart(upsertCartItem(product.id, variantId, current - 1));
    }
  };

  if (loading) return <CardsGridSkeleton count={8} className="grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" />;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      {/* No shop sub-header here: the site header is already sticky above, and
          a second title bar under it just repeated the page's own heading. */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Gear up at the Gym Store
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Supplements, apparel and equipment picked by your gym — no account needed to order.
          </p>

          {/* Trust row: the three questions a first-time buyer asks before they
              hand over a phone number. */}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Verified gym products
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-primary" />
              {/* The platform shop couriers everything. Collecting at a counter
                  is a gym store's promise, and this badge was making it on a
                  page that cannot keep it. */}
              Delivered to your address
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ReceiptText className="h-3.5 w-3.5 text-primary" />
              Track orders by ID
            </span>
          </div>
        </div>
      </section>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      {/* Sticks directly under the site header (65px tall, border included) so
          search and the cart stay in reach while the grid scrolls. */}
      {products.length > 0 && (
        <StorefrontToolbar
          stickyTop={65}
          search={query}
          onSearchChange={setQuery}
          categories={categories.map((name) => ({
            value: name,
            label: name,
            count:
              name === ALL_CATEGORIES
                ? products.length
                : products.filter((product) => product.category === name).length,
          }))}
          activeCategory={category}
          onCategoryChange={setCategory}
          actions={
            <>
              <p className="hidden text-sm whitespace-nowrap text-muted-foreground sm:block">
                {visible.length} {visible.length === 1 ? "product" : "products"}
              </p>
              {isAuthenticated && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={() => navigate("/orders/history")}
                >
                  My Orders
                </Button>
              )}
            </>
          }
          cart={
            <Button
              onClick={() => navigate("/shop/cart")}
              disabled={cartCount === 0}
              className="relative"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="ml-1.5">Cart</span>
              <CartCountBadge count={cartCount} />
            </Button>
          }
        />
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {products.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title="No products available"
            description="Please check back later."
          />
        ) : (
          <>
            {visible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matching products"
                description="Try a different search term or category."
                action={
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setCategory(ALL_CATEGORIES);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <ProductGrid>
                {visible.map((product) => {
                  const inCart = getCartQty(product.id);
                  const unavailable = !product.isActive || product.stock <= 0;
                  const firstPhoto = product.photos[0];

                  return (
                    <ProductCard
                      key={product.id}
                      name={product.name}
                      description={product.description}
                      photo={firstPhoto}
                      price={product.price}
                      stock={product.stock}
                      isActive={product.isActive}
                      onOpen={() => navigate(`/shop/products/${product.id}`)}
                      topLeft={
                        product.category ? (
                          <span className="rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm">
                            {product.category}
                          </span>
                        ) : undefined
                      }
                      topRight={
                        inCart > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            <Check className="h-3 w-3" />
                            In cart
                          </span>
                        ) : undefined
                      }
                      action={
                        // More than one form to buy is a decision, and the card
                        // has no room to make it. Same as the gym store: the
                        // choice happens on the product page.
                        !soleVariant(product) ? (
                          <Button
                            className="w-full"
                            disabled={unavailable}
                            onClick={() => navigate(`/shop/products/${product.id}`)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Options
                          </Button>
                        ) : inCart === 0 ? (
                <Button
                  className="w-full"
                  onClick={() => handleAdd(product)}
                  disabled={unavailable}
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Add to Cart
                </Button>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => handleDecrease(product)}
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title={
                      inCart <= product.minOrderQty ? "Remove from cart" : "Decrease"
                    }
                  >
                    {inCart <= product.minOrderQty ? (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    ) : (
                      <Minus className="h-4 w-4" />
                    )}
                  </button>

                  <div className="flex-1 text-center">
                    <span className="text-lg font-bold tabular-nums leading-none">
                      {inCart}
                    </span>
                    <p className="text-xs text-muted-foreground leading-none">
                      in cart
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleIncrease(product)}
                    disabled={inCart >= product.maxOrderQty || inCart >= product.stock}
                    className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    title="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                        )
                      }
                    />
                  );
                })}
              </ProductGrid>
            )}
          </>
        )}

        {/* Order tracking is the one thing a guest buyer comes back for, so it
            gets a panel rather than a line of small print. */}
        <div className="mt-12 flex flex-col items-center gap-3 rounded-2xl border bg-muted/30 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="font-semibold">Already placed an order?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Look it up with the order ID from your confirmation.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/shop/orders/lookup")}>
            <Search className="h-4 w-4 mr-2" />
            Track an order
          </Button>
        </div>
      </div>
    </div>
  );
}
