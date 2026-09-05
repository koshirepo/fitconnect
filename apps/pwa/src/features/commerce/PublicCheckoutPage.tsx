import * as React from "react";
import { useNavigate } from "react-router-dom";
import { commerceApi } from "@/api/commerce";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShoppingBag, AlertTriangle, Trash2, Truck, Loader2 } from "lucide-react";
import type { PlaceOrderPayload, Product } from "@/types/api";
import { calculateTotals, formatCurrency, validateQuantity } from "./pricing";
import { clearCartItems, getCartItems, saveCartItems, type CartItem } from "./cart";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { FulfilmentBadge } from "@/components/catalog/fulfilment-badge";
import { useSeo } from "@/lib/seo";

type BuyerForm = {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerCity: string;
  buyerState: string;
  buyerPincode: string;
};

/**
 * What the courier said about the pincode, and what carriage will cost.
 *
 * Both come from the API together because they are asked the same moment and
 * a serviceable pincode with no price is not something the buyer can act on.
 */
type ShippingState = {
  status: "idle" | "checking" | "ok" | "unserviceable" | "error";
  amount: number;
  city: string | null;
  state: string | null;
  message: string;
};

const IDLE_SHIPPING: ShippingState = {
  status: "idle",
  amount: 0,
  city: null,
  state: null,
  message: "",
};

type CheckoutLine = {
  product: Product;
  /** The form bought. Null on a line saved before variants existed. */
  variantId: string | null;
  variant: Product["variants"][number] | undefined;
  quantity: number;
};

export default function PublicCheckoutPage() {
  useSeo({
    title: "Checkout",
    description: "Complete your order.",
    noIndex: true,
  });

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
    buyerCity: "",
    buyerState: "",
    buyerPincode: "",
  });
  const [shipping, setShipping] = React.useState<ShippingState>(IDLE_SHIPPING);

  React.useEffect(() => {
    commerceApi
      .listProducts(1, 200)
      .then((res) => setProducts(res.data.data.products))
      .catch((err: unknown) => setError(getApiError(err)))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    if (!user) return;
    setBuyer((prev) => ({
      ...prev,
      buyerName: prev.buyerName || user.name || "",
      buyerEmail: prev.buyerEmail || user.email || "",
      buyerPhone: prev.buyerPhone || user.phone || "",
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
          const sellable = (product.variants ?? []).filter((variant) => variant.isActive);
          const variant =
            sellable.find((candidate) => candidate.id === item.variantId) ??
            (sellable.length === 1 ? sellable[0] : undefined);
          return { product, variantId: item.variantId, variant, quantity: item.quantity };
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
  const payable = totals.totalAmount + shipping.amount;

  const pincode = buyer.buyerPincode.trim();
  // Stable across renders that only reorder the cart, so a quote is not
  // re-requested every time the summary re-renders.
  const itemsKey = React.useMemo(
    () =>
      lines
        .map((line) => `${line.product.id}:${line.quantity}`)
        .sort()
        .join(","),
    [lines],
  );

  /**
   * Ask the courier about the address as it is typed.
   *
   * Debounced, and abandoned when the pincode changes mid-flight, so the answer
   * on screen always belongs to the pincode in the box. City and state are
   * filled in from the courier's own answer — it knows them better than the
   * buyer does, and a mismatch there is what gets a parcel misrouted.
   */
  React.useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(pincode) || !itemsKey) {
      setShipping(IDLE_SHIPPING);
      return;
    }

    let cancelled = false;
    setShipping((prev) => ({ ...prev, status: "checking", message: "" }));

    const timer = window.setTimeout(async () => {
      try {
        const res = await commerceApi.checkPincode(pincode);
        if (cancelled) return;

        const service = res.data.data;
        if (!service.serviceable) {
          setShipping({
            status: "unserviceable",
            amount: 0,
            city: null,
            state: null,
            message: "We cannot deliver to this pincode yet.",
          });
          return;
        }

        setBuyer((prev) => ({
          ...prev,
          buyerCity: service.city ?? prev.buyerCity,
          buyerState: service.state ?? prev.buyerState,
        }));

        const quote = await commerceApi.quoteShipping(
          pincode,
          lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        );
        if (cancelled) return;

        setShipping({
          status: "ok",
          amount: quote.data.data.shippingAmount,
          city: service.city ?? null,
          state: service.state ?? null,
          message: "",
        });
      } catch (err: unknown) {
        if (cancelled) return;
        // A courier that will not answer must not block a sale. The order goes
        // through with carriage the server prices again at that moment.
        setShipping({
          status: "error",
          amount: 0,
          city: null,
          state: null,
          message: getApiError(err),
        });
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `lines` is read inside, but `itemsKey` is what decides a re-quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode, itemsKey]);

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
      !buyer.buyerAddress.trim() ||
      !buyer.buyerCity.trim() ||
      !buyer.buyerState.trim()
    ) {
      setError("Please complete the delivery address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.buyerEmail.trim())) {
      setError("Please enter a valid buyer email.");
      return;
    }
    // These two mirror the API's own rules. Letting them through only to be
    // refused server-side costs a round trip and returns a worse message.
    if (buyer.buyerPhone.replace(/\D/g, "").length < 8) {
      setError("Please enter a valid phone number the courier can call.");
      return;
    }
    if (buyer.buyerAddress.trim().length < 10) {
      setError("Please enter the full street address — house or flat, street, and landmark.");
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(buyer.buyerPincode.trim())) {
      setError("Please enter a valid 6-digit pincode.");
      return;
    }
    if (shipping.status === "unserviceable") {
      setError("We cannot deliver to this pincode yet. Try another address.");
      return;
    }

    const payload: PlaceOrderPayload = {
      buyerName: buyer.buyerName.trim(),
      buyerEmail: buyer.buyerEmail.trim(),
      buyerPhone: buyer.buyerPhone.trim(),
      buyerAddress: buyer.buyerAddress.trim(),
      buyerCity: buyer.buyerCity.trim(),
      buyerState: buyer.buyerState.trim(),
      buyerPincode: buyer.buyerPincode.trim(),
      items: lines.map((line) => ({
        productId: line.product.id,
        // Named where the buyer chose one. The server refuses to guess for a
        // product sold in several forms, which is what stops a mis-picked
        // colour being shipped.
        ...(line.variant ? { variantId: line.variant.id } : {}),
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
      // Kept so it can be handed back if the payment does not complete. The
      // cart is cleared now rather than after, because a dismissed payment
      // window must not leave the buyer able to place the same order twice.
      const snapshot = getCartItems();
      clearCartItems();

      // The API refuses to place an order it cannot take money for, so a
      // response without a payment window is not a state the shop can be in.
      if (!checkout) {
        await commerceApi.discardUnpaidOrder(order.id).catch(() => {});
        saveCartItems(snapshot);
        setError("Online payment is unavailable right now. Please try again shortly.");
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
       * Dismissed or failed means no order.
       *
       * The row exists only to hold stock while the payment window is open, so
       * walking away throws it out and puts the tubs back. The cart comes back
       * with it — somebody who closed the window by accident should find their
       * basket where they left it, not have to build it again.
       *
       * `discardUnpaidOrder` refuses anything already paid, so a webhook that
       * lands mid-dismissal keeps the order rather than losing it.
       */
      if (result.status !== "paid") {
        await commerceApi.discardUnpaidOrder(order.id).catch(() => {});
        saveCartItems(snapshot);
        setError("Payment was not completed, so nothing was ordered. Your basket is as you left it.");
        return;
      }

      try {
        await commerceApi.verifyOrderPayment({
          orderId: result.orderId,
          paymentId: result.paymentId,
          signature: result.signature,
        });
      } catch {
        // The money is taken and the webhook will settle it; showing a failure
        // here would be both alarming and wrong.
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
                  <PhoneInput
                    id="buyerPhone"
                    placeholder="9876543210"
                    value={buyer.buyerPhone}
                    onChange={(e) => setBuyer((prev) => ({ ...prev, buyerPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyerAddress">Street address</Label>
                  <Input
                    id="buyerAddress"
                    placeholder="House / flat, street, landmark"
                    value={buyer.buyerAddress}
                    onChange={(e) =>
                      setBuyer((prev) => ({ ...prev, buyerAddress: e.target.value }))
                    }
                  />
                </div>

                {/* Pincode leads, because it is what the courier answers on and
                    what fills in the two fields beside it. */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="buyerPincode">Pincode</Label>
                    <Input
                      id="buyerPincode"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="560001"
                      value={buyer.buyerPincode}
                      onChange={(e) =>
                        setBuyer((prev) => ({
                          ...prev,
                          buyerPincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerCity">City</Label>
                    <Input
                      id="buyerCity"
                      value={buyer.buyerCity}
                      onChange={(e) => setBuyer((prev) => ({ ...prev, buyerCity: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buyerState">State</Label>
                    <Input
                      id="buyerState"
                      value={buyer.buyerState}
                      onChange={(e) =>
                        setBuyer((prev) => ({ ...prev, buyerState: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* One line, and only when it says something the buyer did not
                    already know from typing the pincode. */}
                {shipping.status === "checking" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking delivery to {pincode}…
                  </p>
                )}
                {shipping.status === "ok" && (
                  <p className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-500">
                    <Truck className="h-3.5 w-3.5" />
                    Delivers to {shipping.city ?? (buyer.buyerCity || pincode)} —{" "}
                    {shipping.amount === 0 ? "free shipping" : formatCurrency(shipping.amount)}
                  </p>
                )}
                {shipping.status === "unserviceable" && (
                  <p className="flex items-center gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {shipping.message}
                  </p>
                )}
                {shipping.status === "error" && (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Shipping could not be priced right now. You can still place the order.
                  </p>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || shipping.status === "unserviceable"}
                >
                  {submitting ? "Processing..." : `Pay ${formatCurrency(payable)}`}
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
                {lines.map((line) => {
                  const unitPrice = line.variant?.price ?? line.product.price;

                  return (
                    <div
                      key={line.variantId ?? line.product.id}
                      className="space-y-1 rounded-md border p-2 text-sm"
                    >
                      <p className="font-medium">{line.product.name}</p>
                      {line.variant && (
                        <p className="text-xs text-muted-foreground">{line.variant.name}</p>
                      )}
                      <p className="text-muted-foreground">
                        Qty {line.quantity} x {formatCurrency(unitPrice)}
                      </p>
                      <p className="font-medium">{formatCurrency(line.quantity * unitPrice)}</p>
                      {/* Everything the platform shop sells is couriered; a gym
                          store is collected. Said per line so a basket that ever
                          mixes the two reads correctly without changing here. */}
                      <FulfilmentBadge fulfilment="DELIVERY" />
                    </div>
                  );
                })}
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>
                    {shipping.status === "checking"
                      ? "…"
                      : shipping.status === "ok"
                        ? shipping.amount === 0
                          ? "Free"
                          : formatCurrency(shipping.amount)
                        : // Nothing to show until there is a pincode to price
                          // against, and a dash reads better than ₹0 does.
                          "—"}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(payable)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
