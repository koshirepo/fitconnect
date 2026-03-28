import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, PackageOpen, ShoppingCart, Search, Plus, Minus, Trash2 } from "lucide-react";
import type { Product } from "@/types/api";
import { formatCurrency } from "./pricing";
import {
  getCartItems,
  getCartTotalQuantity,
  upsertCartItem,
  removeCartItem,
  type CartItem,
} from "./cart";

export default function PublicCatalogPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [products, setProducts] = React.useState<Product[]>([]);
  const [cart, setCart] = React.useState<CartItem[]>(() => getCartItems());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setLoading(true);
    commerceApi
      .listProducts(1, 200)
      .then((res) => setProducts(res.data.data.products))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  const cartCount = getCartTotalQuantity(cart);

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

  if (loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">Gym Store</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Browse &amp; add to cart, then checkout
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/shop/orders/lookup")}>
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Order Status</span>
            </Button>
            {isAuthenticated ? (
              <Button variant="ghost" size="sm" onClick={() => navigate("/orders/history")}>
                My Orders
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
                Sign In
              </Button>
            )}
            <Button
              onClick={() => navigate("/shop/cart")}
              disabled={cartCount === 0}
              className="relative"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="ml-1.5">Cart</span>
              {cartCount > 0 && (
                <Badge
                  variant="secondary"
                  className="absolute bg-accent-foreground -top-2 -right-2 h-5 min-w-5 px-1 text-xs flex items-center justify-center"
                >
                  {cartCount}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </div>

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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const inCart = getCartQty(product.id);
              const unavailable = !product.isActive || product.stock <= 0;
              const firstPhoto = product.photos[0];

              return (
                <div
                  key={product.id}
                  className={`group flex flex-col rounded-xl border bg-card overflow-hidden transition-shadow hover:shadow-lg ${unavailable ? "opacity-60" : ""}`}
                >
                  {/* Image */}
                  <button
                    type="button"
                    className="relative aspect-square w-full overflow-hidden bg-muted"
                    onClick={() => navigate(`/shop/products/${product.id}`)}
                  >
                    {firstPhoto ? (
                      <img
                        src={firstPhoto}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <PackageOpen className="h-10 w-10 opacity-40" />
                      </div>
                    )}

                    {/* Stock badge */}
                    {product.stock <= 5 && product.stock > 0 && (
                      <span className="absolute top-2 left-2 rounded-full bg-yellow-500/90 px-2 py-0.5 text-xs font-semibold text-black">
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
                  </button>

                  {/* Info */}
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => navigate(`/shop/products/${product.id}`)}
                    >
                      <p className="font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {product.name}
                      </p>
                    </button>
                    {product.category && (
                      <p className="text-xs text-muted-foreground">{product.category}</p>
                    )}
                    {product.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-auto pt-3 space-y-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-lg font-bold">{formatCurrency(product.price)}</span>
                        <span className="text-xs text-muted-foreground">
                          Stock: {product.stock}
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
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleDecrease(product)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title={inCart <= product.minOrderQty ? "Remove from cart" : "Decrease"}
                          >
                            {inCart <= product.minOrderQty ? (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            ) : (
                              <Minus className="h-4 w-4" />
                            )}
                          </button>

                          <div className="flex-1 text-center">
                            <span className="text-lg font-bold tabular-nums">{inCart}</span>
                            <p className="text-xs text-muted-foreground leading-none">in cart</p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleIncrease(product)}
                            disabled={inCart >= product.maxOrderQty || inCart >= product.stock}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
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

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Need to track an existing order?{" "}
          <Link
            to="/shop/orders/lookup"
            className="text-primary underline-offset-4 hover:underline"
          >
            Check order status by ID
          </Link>
        </p>
      </div>
    </div>
  );
}
