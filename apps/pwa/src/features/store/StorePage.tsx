/**
 * Documentation: The gym store, as a member sees it.
 *
 * - Browse what the gym sells, pick a variant, and pay — online through Razorpay, or with coins and a coupon if those clear the bill.
 * - The basket holds variant ids and quantities only. Every total shown next to the pay button is the API's own figure from `startCheckout`, not one this screen worked out: a browser that priced its own basket could pay whatever it liked.
 * - Stock is claimed when checkout opens, so closing the payment window releases it again rather than leaving the tub reserved for nobody.
 * - Primary exports: StorePage.
 */
import * as React from "react";
import { useAuthStore } from "@/stores/auth";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  useCancelStoreOrder,
  useStartStoreCheckout,
  useStoreProducts,
  useVerifyStoreCheckout,
} from "@/api/queries/store";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { ShoppingBag, Minus, Plus, Coins, Settings, Trash2 } from "lucide-react";
import type { StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";
import { StoreVariantPicker } from "./StoreVariantPicker";

/** One chosen variant, held with enough detail to draw the basket. */
type BasketEntry = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPrice: number;
  stock: number;
  quantity: number;
};

export default function StorePage() {
  const toast = useToast();
  const navigate = useAppNavigate();
  const { can } = usePermissions();
  const canBuy = can(Permission.STORE_BUY_SELF);
  const canManage = can(Permission.STORE_MANAGE);
  const currentMembership = useAuthStore((state) => state.currentMembership);
  const gymName = currentMembership()?.tenantName ?? "the gym";

  const productsQuery = useStoreProducts();
  const products = React.useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  const loading = productsQuery.isPending;

  const startCheckout = useStartStoreCheckout();
  const verifyCheckout = useVerifyStoreCheckout();
  const cancelOrder = useCancelStoreOrder();

  const [basket, setBasket] = React.useState<BasketEntry[]>([]);
  const [couponCode, setCouponCode] = React.useState("");
  const [coinsToSpend, setCoinsToSpend] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  const [error, setError] = React.useState("");

  const subtotal = basket.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);

  const addToBasket = (product: StoreProduct, variant: StoreVariant) => {
    setError("");
    setBasket((prev) => {
      const existing = prev.find((entry) => entry.variantId === variant.id);
      if (existing) {
        // Never past what the gym has; the API refuses it anyway, and finding
        // out at the payment step is a worse way to learn.
        const quantity = Math.min(existing.quantity + 1, variant.stock);
        return prev.map((entry) =>
          entry.variantId === variant.id ? { ...entry, quantity } : entry,
        );
      }

      return [
        ...prev,
        {
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          unitPrice: variant.price,
          stock: variant.stock,
          quantity: 1,
        },
      ];
    });
  };

  const changeQuantity = (variantId: string, delta: number) => {
    setBasket((prev) =>
      prev.flatMap((entry) => {
        if (entry.variantId !== variantId) return [entry];
        const quantity = Math.min(Math.max(entry.quantity + delta, 0), entry.stock);
        return quantity === 0 ? [] : [{ ...entry, quantity }];
      }),
    );
  };

  const handlePay = async () => {
    if (basket.length === 0) return;
    setError("");
    setPaying(true);

    try {
      const sale = await startCheckout.mutateAsync({
        items: basket.map((entry) => ({
          variantId: entry.variantId,
          quantity: entry.quantity,
        })),
        ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
        ...(coinsToSpend ? { coinsToSpend: Number(coinsToSpend) } : {}),
      });

      // Coins and a coupon can clear a bill outright, and then there is nothing
      // to pay — the API has already completed the order.
      if (!sale.checkout) {
        setBasket([]);
        setCouponCode("");
        setCoinsToSpend("");
        toast.success(
          sale.coinsEarned > 0
            ? `Paid with coins. You earned ${sale.coinsEarned} more.`
            : "Paid with coins.",
        );
        return;
      }

      const result = await openRazorpayCheckout({
        keyId: sale.checkout.keyId,
        orderId: sale.checkout.orderId,
        amount: sale.checkout.amount,
        currency: sale.checkout.currency,
        name: gymName,
        description: `${basket.length} item${basket.length === 1 ? "" : "s"} from the store`,
      });

      if (result.status !== "paid") {
        // The stock is being held for this order, so it goes back rather than
        // sitting reserved until someone notices.
        await cancelOrder.mutateAsync(sale.order.id).catch(() => {
          // A failed release is not worth blocking the member on; the order
          // stays pending and the gym can clear it.
        });
        setError(
          result.status === "failed"
            ? `${result.message} Nothing was charged.`
            : "Payment cancelled. Nothing was charged.",
        );
        return;
      }

      await verifyCheckout.mutateAsync({
        orderId: result.orderId,
        paymentId: result.paymentId,
        signature: result.signature,
      });

      setBasket([]);
      setCouponCode("");
      setCoinsToSpend("");
      toast.success(
        sale.coinsEarned > 0
          ? `Purchase complete. You earned ${sale.coinsEarned} coins.`
          : "Purchase complete.",
      );
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <CardsGridSkeleton count={6} className="gap-4" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store</h1>
          <p className="text-muted-foreground">Supplements and kit from {gymName}</p>
        </div>
        <div className="flex items-center gap-2">
          {basket.length > 0 && (
            <Badge variant="accent" className="text-sm">
              {basket.reduce((sum, entry) => sum + entry.quantity, 0)} in basket
            </Badge>
          )}
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => navigate("/store/manage")}>
              <Settings className="h-4 w-4" />
              Manage
            </Button>
          )}
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nothing in the store yet"
          description={`${gymName} has not added anything to sell.`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <StoreVariantPicker
              key={product.id}
              product={product}
              canBuy={canBuy}
              onAdd={(variant) => addToBasket(product, variant)}
            />
          ))}
        </div>
      )}

      {canBuy && basket.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your basket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {basket.map((entry) => (
              <div key={entry.variantId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-snug">{entry.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.variantName} · {formatCurrency(entry.unitPrice)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => changeQuantity(entry.variantId, -1)}
                    aria-label={`One fewer ${entry.variantName}`}
                  >
                    {entry.quantity === 1 ? (
                      <Trash2 className="h-3.5 w-3.5" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{entry.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => changeQuantity(entry.variantId, 1)}
                    disabled={entry.quantity >= entry.stock}
                    aria-label={`One more ${entry.variantName}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">
                    {formatCurrency(entry.unitPrice * entry.quantity)}
                  </span>
                </div>
              </div>
            ))}

            <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="coupon">Coupon code</Label>
                <Input
                  id="coupon"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coins">Coins to spend</Label>
                <Input
                  id="coins"
                  type="number"
                  min={0}
                  step={1}
                  value={coinsToSpend}
                  onChange={(e) => setCoinsToSpend(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              <Coins className="mr-1 inline h-3 w-3" />
              The gym works out the final price. A coupon comes off first, then coins — you
              will never be charged more than the total below.
            </p>

            {error && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <p className="text-xs text-muted-foreground">Before discounts</p>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(subtotal)}</p>
              </div>
              <Button onClick={handlePay} disabled={paying}>
                {paying ? "Working…" : "Pay"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
