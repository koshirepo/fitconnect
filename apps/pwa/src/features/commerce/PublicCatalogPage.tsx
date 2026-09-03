import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { formatCurrency } from "./pricing";
import { PRODUCT_IMAGE_ASPECT_CLASS } from "./product-image";
import {
  getCartItems,
  getCartTotalQuantity,
  upsertCartItem,
  removeCartItem,
  type CartItem,
} from "./cart";

const ALL_CATEGORIES = "All";

export default function PublicCatalogPage() {
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
    setCart(upsertCartItem(product.id, nextQty));
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
    setCart(upsertCartItem(product.id, nextQty));
  };

  const handleDecrease = (product: Product) => {
    setError("");
    const current = getCartQty(product.id);
    if (current <= product.minOrderQty) {
      setCart(removeCartItem(product.id));
    } else {
      setCart(upsertCartItem(product.id, current - 1));
    }
  };

  if (loading) return <CardsGridSkeleton count={8} className="gap-5 xl:grid-cols-4" />;

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
              Pick up at your gym
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
        <div className="sticky top-[65px] z-30 border-y bg-background/85 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 sm:max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search products…"
                  aria-label="Search products"
                  className="pl-9"
                />
              </div>

              <p className="ml-auto hidden text-sm whitespace-nowrap text-muted-foreground sm:block">
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

              <Button
                onClick={() => navigate("/shop/cart")}
                disabled={cartCount === 0}
                className="relative shrink-0"
              >
                <ShoppingCart className="h-4 w-4" />
                <span className="ml-1.5">Cart</span>
                {cartCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center bg-accent-foreground px-1 text-xs"
                  >
                    {cartCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Chips scroll sideways on a phone rather than stacking into a
                wall of categories above the grid. */}
            {categories.length > 1 && (
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
                {categories.map((c) => {
                  const active = c === category;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((product) => {
                  const inCart = getCartQty(product.id);
                  const unavailable = !product.isActive || product.stock <= 0;
                  const firstPhoto = product.photos[0];

                  return (
                    <div
                      key={product.id}
                      className={`group flex flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 ${
                        unavailable ? "opacity-60" : ""
                      }`}
                    >
                      {/* Image */}
                      <button
                        type="button"
                        className={`relative ${PRODUCT_IMAGE_ASPECT_CLASS} w-full overflow-hidden bg-muted`}
                        onClick={() => navigate(`/shop/products/${product.id}`)}
                      >
                        {firstPhoto ? (
                          <img
                            src={firstPhoto}
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/40 text-muted-foreground">
                            <PackageOpen className="h-10 w-10 opacity-40" />
                          </div>
                        )}

                        {/* Category rides on the image so the info block below
                            stays a clean name → price → action column. */}
                        {product.category && (
                          <span className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">
                            {product.category}
                          </span>
                        )}

                        {/* Stock badge */}
                        {product.stock <= 5 && product.stock > 0 && (
                          <span className="absolute bottom-3 left-3 rounded-full bg-yellow-500/90 px-2.5 py-0.5 text-xs font-semibold text-black">
                            Only {product.stock} left
                          </span>
                        )}
                        {product.stock === 0 && (
                          <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold text-muted-foreground">
                            Out of stock
                          </span>
                        )}
                        {!product.isActive && (
                          <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold text-muted-foreground">
                            Unavailable
                          </span>
                        )}
                        {inCart > 0 && (
                          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                            <Check className="h-3 w-3" />
                            In cart
                          </span>
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex flex-1 flex-col gap-1.5 p-4">
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => navigate(`/shop/products/${product.id}`)}
                        >
                          <p className="font-semibold leading-snug line-clamp-2 transition-colors group-hover:text-primary">
                            {product.name}
                          </p>
                        </button>
                        {product.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {product.description}
                          </p>
                        )}

                        <div className="mt-auto space-y-3 pt-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xl font-bold tracking-tight">
                              {formatCurrency(product.price)}
                            </span>
                            <span className="text-xs whitespace-nowrap text-muted-foreground">
                              {product.stock} in stock
                            </span>
                          </div>

                          {/* Cart controls */}
                          {inCart === 0 ? (
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
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
