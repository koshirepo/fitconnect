import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRow } from "@/components/ui/skeleton";
import { ShoppingCart, Trash2, ArrowLeft, AlertTriangle } from "lucide-react";
import type { Product } from "@/types/api";
import { calculateTotals, formatCurrency, validateQuantity } from "./pricing";
import { CartLine as CartLineRow, CartSummary } from "@/components/catalog/cart-line";
import { FulfilmentBadge } from "@/components/catalog/fulfilment-badge";
import { getCartItems, removeCartItem, saveCartItems, upsertCartItem, type CartItem } from "./cart";
import { useSeo } from "@/lib/seo";

type CartLine = {
  product: Product;
  /** The form bought. Null on a line saved before variants existed. */
  variantId: string | null;
  variant: Product["variants"][number] | undefined;
  quantity: number;
};

export default function PublicCartPage() {
  useSeo({
    title: "Your Basket",
    description: "The items you are about to buy.",
    noIndex: true,
  });

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

  const productMap = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const lines = React.useMemo<CartLine[]>(
    () =>
      cart
        .map((item) => {
          const product = productMap.get(item.productId);
          if (!product) return null;
          // A legacy line names no variant; a product with one form has an
          // obvious answer, which is the same rule the API applies at checkout.
          const sellable = (product.variants ?? []).filter((variant) => variant.isActive);
          const variant =
            sellable.find((candidate) => candidate.id === item.variantId) ??
            (sellable.length === 1 ? sellable[0] : undefined);
          return { product, variantId: item.variantId, variant, quantity: item.quantity };
        })
        .filter((line): line is CartLine => Boolean(line)),
    [cart, productMap],
  );

  const missingItems = React.useMemo(
    () => cart.filter((item) => !productMap.has(item.productId)),
    [cart, productMap],
  );

  const subtotalAmount = React.useMemo(
    () => lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [lines],
  );
  const totals = React.useMemo(() => calculateTotals(subtotalAmount), [subtotalAmount]);

  const lineErrors = React.useMemo(
    () =>
      lines
        .map((line) => ({
          productId: line.product.id,
          message: validateQuantity(line.product, line.quantity),
        }))
        .filter((entry) => Boolean(entry.message)),
    [lines],
  );

  /**
   * One step up or down.
   *
   * Replaces a number field with a separate "Update Qty" button, which let
   * somebody type 3, not press it, and check out with 1. Stepping below the
   * minimum is how a line is removed, matching the control on the catalogue.
   */
  const changeQuantity = (line: CartLine, delta: number) => {
    const next = line.quantity + delta;

    if (next < line.product.minOrderQty) {
      setError("");
      setCart(removeCartItem(line.product.id, line.variantId));
      return;
    }

    const issue = validateQuantity(line.product, next);
    if (issue) {
      setError(`${line.product.name}: ${issue}`);
      return;
    }

    setError("");
    setCart(upsertCartItem(line.product.id, line.variantId, next));
  };


  const proceedToCheckout = () => {
    if (lines.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    if (missingItems.length > 0) {
      setError("Some cart items are unavailable. Remove them before checkout.");
      return;
    }
    if (lineErrors.length > 0) {
      setError("Please fix quantity issues before checkout.");
      return;
    }
    navigate("/shop/checkout");
  };

  if (loading) return (<div className="space-y-3">{[0,1,2].map((i)=>(<div key={i} className="rounded-lg ring-1 ring-foreground/10"><SkeletonRow className="p-3" /></div>))}</div>);

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Browse the product catalog and add items to continue."
          action={<Button onClick={() => navigate("/shop")}>Browse Products</Button>}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Your Cart</h1>
            <p className="text-muted-foreground">Review quantities before checkout.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/shop")}>
            <ArrowLeft className="h-4 w-4" />
            Continue Shopping
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {missingItems.length > 0 && (
                <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {missingItems.length} item{missingItems.length !== 1 ? "s" : ""} unavailable
                      </p>
                      <p className="text-muted-foreground mt-1">
                        These products have been removed from the store.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        let updated = getCartItems();
                        for (const item of missingItems) {
                          updated = updated.filter((c) => c.productId !== item.productId);
                        }
                        saveCartItems(updated);
                        setCart(updated);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove All
                    </Button>
                  </div>
                </div>
              )}

              {lines.map((line) => (
                <CartLineRow
                  key={line.product.id}
                  name={line.product.name}
                  subtitle={line.variant?.name ?? line.product.category}
                  photo={line.product.photos[0]}
                  price={`${formatCurrency(line.variant?.price ?? line.product.price)} each`}
                  meta={
                    <>
                      Stock {line.variant?.stock ?? line.product.stock} · Min{" "}
                      {line.product.minOrderQty} / Max {line.product.maxOrderQty}
                      <FulfilmentBadge fulfilment="DELIVERY" className="mt-1 flex w-fit" />
                    </>
                  }
                  quantity={line.quantity}
                  atMinimum={line.quantity <= line.product.minOrderQty}
                  canIncrease={
                    line.quantity < line.product.maxOrderQty &&
                    line.quantity < (line.variant?.stock ?? line.product.stock)
                  }
                  onDecrease={() => changeQuantity(line, -1)}
                  onIncrease={() => changeQuantity(line, 1)}
                  issue={validateQuantity(line.product, line.quantity)}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <CartSummary
                rows={[
                  { label: "Subtotal", value: formatCurrency(totals.subtotalAmount) },
                  {
                    label: `GST (${totals.gstRatePct}%)`,
                    value: formatCurrency(totals.gstAmount),
                  },
                  { label: "Total", value: formatCurrency(totals.totalAmount), strong: true },
                ]}
                footnote={
                  !isAuthenticated
                    ? "Guest checkout is supported. You will enter buyer details on the next step."
                    : undefined
                }
              >
                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button className="w-full" onClick={proceedToCheckout}>
                  Proceed to Checkout
                </Button>
              </CartSummary>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
