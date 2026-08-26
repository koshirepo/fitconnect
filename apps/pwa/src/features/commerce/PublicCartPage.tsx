import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SkeletonRow } from "@/components/ui/skeleton";
import { ShoppingCart, Trash2, ArrowLeft, AlertTriangle } from "lucide-react";
import type { Product } from "@/types/api";
import { calculateTotals, formatCurrency } from "./pricing";
import { getCartItems, removeCartItem, saveCartItems, upsertCartItem, type CartItem } from "./cart";

type CartLine = {
  product: Product;
  quantity: number;
};

function validateQuantity(product: Product, quantity: number) {
  if (quantity < product.minOrderQty || quantity > product.maxOrderQty) {
    return `Allowed quantity is ${product.minOrderQty} to ${product.maxOrderQty}.`;
  }
  if (quantity > product.stock) {
    return `Only ${product.stock} units are available.`;
  }
  if (!product.isActive) {
    return "Product is currently inactive.";
  }
  return "";
}

export default function PublicCartPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [products, setProducts] = React.useState<Product[]>([]);
  const [cart, setCart] = React.useState<CartItem[]>(() => getCartItems());
  const [draftQty, setDraftQty] = React.useState<Record<string, string>>({});
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

  React.useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of cart) next[item.productId] = String(item.quantity);
    setDraftQty(next);
  }, [cart]);

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
          return { product, quantity: item.quantity };
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

  const applyQty = (line: CartLine) => {
    const value = Number(draftQty[line.product.id]);
    if (!Number.isFinite(value)) {
      setError(`Please enter a valid quantity for ${line.product.name}.`);
      return;
    }

    const parsed = Math.floor(value);
    const issue = validateQuantity(line.product, parsed);
    if (issue) {
      setError(`${line.product.name}: ${issue}`);
      return;
    }

    setError("");
    const updated = upsertCartItem(line.product.id, parsed);
    setCart(updated);
  };

  const removeLine = (productId: string) => {
    const updated = removeCartItem(productId);
    setCart(updated);
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

              {lines.map((line) => {
                const issue = validateQuantity(line.product, line.quantity);
                const inputValue = draftQty[line.product.id] ?? String(line.quantity);
                return (
                  <div key={line.product.id} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{line.product.name}</p>
                        <p className="text-sm text-muted-foreground">{line.product.category}</p>
                        <p className="text-sm">
                          {formatCurrency(line.product.price)} each | Stock {line.product.stock}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Min {line.product.minOrderQty} / Max {line.product.maxOrderQty}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeLine(line.product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        min={line.product.minOrderQty}
                        max={Math.min(line.product.maxOrderQty, line.product.stock)}
                        value={inputValue}
                        onChange={(e) =>
                          setDraftQty((prev) => ({ ...prev, [line.product.id]: e.target.value }))
                        }
                        className="w-36"
                      />
                      <Button variant="outline" onClick={() => applyQty(line)}>
                        Update Qty
                      </Button>
                    </div>

                    {issue && <p className="text-sm text-destructive">{issue}</p>}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(totals.subtotalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST ({totals.gstRatePct}%)</span>
                  <span>{formatCurrency(totals.gstAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(totals.totalAmount)}</span>
                </div>
              </div>

              {!isAuthenticated && (
                <p className="text-xs text-muted-foreground">
                  Guest checkout is supported. You will enter buyer details on the next step.
                </p>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button className="w-full" onClick={proceedToCheckout}>
                Proceed to Checkout
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
