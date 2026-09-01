import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShoppingBag, AlertTriangle, Trash2 } from "lucide-react";
import type { PlaceOrderPayload, Product } from "@/types/api";
import { calculateTotals, formatCurrency, validateQuantity } from "./pricing";
import { clearCartItems, getCartItems, saveCartItems, type CartItem } from "./cart";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";

type BuyerForm = {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
};

type CheckoutLine = {
  product: Product;
  quantity: number;
};

export default function PublicCheckoutPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  const [products, setProducts] = React.useState<Product[]>([]);
  const [cart, setCart] = React.useState<CartItem[]>(() => getCartItems());
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [buyer, setBuyer] = React.useState<BuyerForm>({
    buyerName: user?.name ?? "",
    buyerEmail: user?.email ?? "",
    buyerPhone: user?.phone ?? "",
    buyerAddress: "",
  });

  React.useEffect(() => {
    setLoading(true);
    commerceApi
      .listProducts(1, 200)
      .then((res) => setProducts(res.data.data.products))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    setCart(getCartItems());
  }, []);

  React.useEffect(() => {
    if (!user) return;
    setBuyer((prev) => ({
      buyerName: prev.buyerName || user.name || "",
      buyerEmail: prev.buyerEmail || user.email || "",
      buyerPhone: prev.buyerPhone || user.phone || "",
      buyerAddress: prev.buyerAddress,
    }));
  }, [user]);

  const productMap = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const lines = React.useMemo<CheckoutLine[]>(
    () =>
      cart
        .map((item) => {
          const product = productMap.get(item.productId);
          if (!product) return null;
          return { product, quantity: item.quantity };
        })
        .filter((line): line is CheckoutLine => Boolean(line)),
    [cart, productMap],
  );

  const unavailableItems = React.useMemo(
    () => cart.filter((item) => !productMap.has(item.productId)),
    [cart, productMap],
  );

  const removeUnavailable = () => {
    const validIds = new Set(products.map((p) => p.id));
    const cleaned = cart.filter((item) => validIds.has(item.productId));
    saveCartItems(cleaned);
    setCart(cleaned);
  };

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

  const subtotalAmount = React.useMemo(
    () => lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [lines],
  );
  const totals = React.useMemo(() => calculateTotals(subtotalAmount), [subtotalAmount]);

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (lines.length === 0) {
      setError("Your cart is empty.");
      return;
    }
    if (unavailableItems.length > 0) {
      setError("Some products are unavailable. Remove them first.");
      return;
    }
    if (lineErrors.length > 0) {
      setError("Some quantities are invalid. Please review cart before checkout.");
      return;
    }

    if (
      !buyer.buyerName.trim() ||
      !buyer.buyerEmail.trim() ||
      !buyer.buyerPhone.trim() ||
      !buyer.buyerAddress.trim()
    ) {
      setError("Please complete buyer details.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.buyerEmail.trim())) {
      setError("Please enter a valid buyer email.");
      return;
    }

    const payload: PlaceOrderPayload = {
      buyerName: buyer.buyerName.trim(),
      buyerEmail: buyer.buyerEmail.trim(),
      buyerPhone: buyer.buyerPhone.trim(),
      buyerAddress: buyer.buyerAddress.trim(),
      items: lines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
      })),
    };

    setSubmitting(true);
    try {
      const res = await commerceApi.startCheckout(payload);
      const { order, checkout } = res.data.data;

      // The order exists from here on, whatever happens at the payment window,
      // so the cart is spent: clearing it now means a dismissed payment cannot
      // leave the buyer placing the same order twice. Only storage is cleared —
      // the in-memory copy still renders the summary behind the payment window,
      // which would otherwise flip to "no items to checkout" underneath it.
      clearCartItems();

      // No gateway configured: the order stands, unpaid, and the confirmation
      // page says so. This is what the shop did before it took cards.
      if (!checkout) {
        navigate(`/shop/orders/${order.id}`);
        return;
      }

      const result = await openRazorpayCheckout({
        keyId: checkout.keyId,
        orderId: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: "FitConnect",
        description: `Order ${order.id.slice(-6).toUpperCase()}`,
        prefill: {
          name: payload.buyerName,
          email: payload.buyerEmail,
          contact: payload.buyerPhone,
        },
      });

      /**
       * Dismissing or failing is not an error worth shouting about: the order
       * is real and unpaid, and the confirmation page is where they can see it
       * and its id. Razorpay's own webhook settles it if the money did land.
       */
      if (result.status === "paid") {
        try {
          await commerceApi.verifyOrderPayment({
            orderId: result.orderId,
            paymentId: result.paymentId,
            signature: result.signature,
          });
        } catch {
          // The money is taken and the webhook will settle it; showing a
          // failure here would be both alarming and wrong.
        }
      }

      navigate(`/shop/orders/${order.id}`);
    } catch (err: unknown) {
      setError(getApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormPageSkeleton fields={4} />;

  if (cart.length === 0 || lines.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <EmptyState
          icon={ShoppingBag}
          title="No items to checkout"
          description="Add products to cart before continuing."
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
            <h1 className="text-2xl font-bold tracking-tight">Checkout</h1>
            <p className="text-muted-foreground">Confirm buyer info and place your order.</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/shop/cart")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Cart
          </Button>
        </div>

        {unavailableItems.length > 0 && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {unavailableItems.length} item{unavailableItems.length !== 1 ? "s" : ""} in your
                  cart are no longer available
                </p>
                <p className="text-muted-foreground mt-1">Remove them to continue with checkout.</p>
              </div>
              <Button variant="destructive" size="sm" onClick={removeUnavailable}>
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Buyer Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={placeOrder}>
                {!isAuthenticated && (
                  <p className="text-xs text-muted-foreground">
                    You are checking out as guest. Buyer details are required for confirmation and
                    tracking.
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="buyerName">Full Name</Label>
                  <Input
                    id="buyerName"
                    value={buyer.buyerName}
                    onChange={(e) => setBuyer((prev) => ({ ...prev, buyerName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerEmail">Email</Label>
                  <Input
                    id="buyerEmail"
                    type="email"
                    value={buyer.buyerEmail}
                    onChange={(e) => setBuyer((prev) => ({ ...prev, buyerEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerPhone">Phone</Label>
                  <Input
                    id="buyerPhone"
                    value={buyer.buyerPhone}
                    onChange={(e) => setBuyer((prev) => ({ ...prev, buyerPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerAddress">Address</Label>
                  <Input
                    id="buyerAddress"
                    value={buyer.buyerAddress}
                    onChange={(e) =>
                      setBuyer((prev) => ({ ...prev, buyerAddress: e.target.value }))
                    }
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Processing..." : `Pay ${formatCurrency(totals.totalAmount)}`}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {lines.map((line) => (
                  <div key={line.product.id} className="rounded-md border p-2 text-sm">
                    <p className="font-medium">{line.product.name}</p>
                    <p className="text-muted-foreground">
                      Qty {line.quantity} x {formatCurrency(line.product.price)}
                    </p>
                    <p className="font-medium">
                      {formatCurrency(line.quantity * line.product.price)}
                    </p>
                  </div>
                ))}
              </div>

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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
