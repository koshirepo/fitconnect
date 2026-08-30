/**
 * Documentation: The gym's storefront — the one place anybody buys anything.
 *
 * - Members and visitors shop here alike. The dashboard store is for staff now: orders and stock. That is why the basket and the checkout live on this page rather than behind a session, and why the page has to work for somebody who has never signed in.
 * - Two checkout paths behind one button, chosen by who is looking. A member gets the member path — coupons, coins, Razorpay, stock claimed while they pay. A visitor gets a pickup reservation: no coupon, no coins, and no stock moved until a coach hands the goods over at the counter, so a no-show costs the gym nothing.
 * - Laid out after a large marketplace rather than the rest of the dashboard: a dense card grid, a search and category rail pinned to the top, price forward on every card, and a basket that follows the reader down the page. A shop is browsed, not administered.
 * - Prices shown are always the API's own figures. The basket holds variant ids and quantities; every total beside a pay button comes back from the server, because a browser that priced its own basket could pay whatever it liked.
 * - Primary exports: PublicStorePage.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Coins,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  X,
} from "lucide-react";

import { publicApi } from "@/api/public";
import { getApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { useCurrentTenantId } from "@/api/queries/shared";
import {
  useCancelStoreOrder,
  useReserveStoreOrder,
  useStartStoreCheckout,
  useVerifyStoreCheckout,
} from "@/api/queries/store";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, cn } from "@/lib/utils";
import { ShoppingBag } from "lucide-react";
import type { StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";

/** One chosen variant, held with enough detail to draw the basket. */
type BasketEntry = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unitPrice: number;
  stock: number;
  quantity: number;
  photo?: string;
};

const CATEGORIES = [
  { value: "", label: "All" },
  { value: "SUPPLEMENT", label: "Supplements" },
  { value: "ACCESSORY", label: "Accessories" },
] as const;

const SORTS = [
  { value: "popular", label: "Popularity" },
  { value: "price-asc", label: "Price — low to high" },
  { value: "price-desc", label: "Price — high to low" },
  { value: "name", label: "Name" },
] as const;

/** The cheapest live variant, which is the figure a card leads with. */
function fromPrice(product: StoreProduct) {
  const prices = product.variants.filter((v) => v.isActive).map((v) => v.price);
  return prices.length ? Math.min(...prices) : 0;
}

function totalStock(product: StoreProduct) {
  return product.variants.reduce((sum, variant) => sum + variant.stock, 0);
}

export default function PublicStorePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAuthenticated } = useAuthStore();
  const currentMembership = useAuthStore((state) => state.currentMembership);

  // A member of *this* gym gets the member checkout. Somebody signed in without
  // a membership here is, for the purposes of buying, a visitor.
  const memberTenantId = useCurrentTenantId();
  const asMember = Boolean(isAuthenticated && memberTenantId);

  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [gymName, setGymName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>("");
  const [sort, setSort] = React.useState<string>("popular");

  const [basket, setBasket] = React.useState<BasketEntry[]>([]);
  const [basketOpen, setBasketOpen] = React.useState(false);

  const startCheckout = useStartStoreCheckout();
  const verifyCheckout = useVerifyStoreCheckout();
  const cancelOrder = useCancelStoreOrder();
  const reserveOrder = useReserveStoreOrder();
  const [couponCode, setCouponCode] = React.useState("");
  const [coinsToSpend, setCoinsToSpend] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [buyerPhone, setBuyerPhone] = React.useState("");
  const [buyerEmail, setBuyerEmail] = React.useState("");
  const [placing, setPlacing] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    publicApi
      .getStore()
      .then((res) => {
        if (!active) return;
        setProducts(res.data.data.products);
        setGymName(res.data.data.tenant.name);
      })
      .catch((caught) => {
        if (active) setError(getApiError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const addToBasket = React.useCallback(
    (product: StoreProduct, variant: StoreVariant) => {
      setBasket((prev) => {
        const existing = prev.find((entry) => entry.variantId === variant.id);
        if (existing) {
          // Never past what the gym has. The API refuses it anyway, and finding
          // out at the payment step is a worse way to learn.
          const quantity = Math.min(existing.quantity + 1, variant.stock);
          return prev.map((entry) =>
            entry.variantId === variant.id ? { ...entry, quantity } : entry,
          );
        }

        const photo = Array.isArray(product.photos) ? product.photos[0] : undefined;
        return [
          ...prev,
          {
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            variantName: variant.name,
            unitPrice: variant.price,
            stock: variant.stock,
            quantity: 1,
            ...(photo ? { photo } : {}),
          },
        ];
      });
      setBasketOpen(true);
    },
    [],
  );

  /**
   * A variant chosen on the product page.
   *
   * Consumed once and stripped from the URL, so a refresh — or a back button
   * landing here again — does not quietly add a second tub to the basket.
   */
  React.useEffect(() => {
    const variantId = searchParams.get("add");
    if (!variantId || products.length === 0) return;

    for (const product of products) {
      const variant = product.variants.find((candidate) => candidate.id === variantId);
      if (variant) {
        addToBasket(product, variant);
        break;
      }
    }

    setSearchParams(
      (params) => {
        params.delete("add");
        return params;
      },
      { replace: true },
    );
  }, [products, searchParams, setSearchParams, addToBasket]);

  const changeQuantity = (variantId: string, delta: number) => {
    setBasket((prev) =>
      prev.flatMap((entry) => {
        if (entry.variantId !== variantId) return [entry];
        const quantity = Math.min(Math.max(entry.quantity + delta, 0), entry.stock);
        return quantity === 0 ? [] : [{ ...entry, quantity }];
      }),
    );
  };

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = products.filter((product) => {
      if (category && product.category !== category) return false;
      if (!term) return true;
      return `${product.name} ${product.description ?? ""}`.toLowerCase().includes(term);
    });

    const sorted = [...filtered];
    if (sort === "price-asc") sorted.sort((a, b) => fromPrice(a) - fromPrice(b));
    else if (sort === "price-desc") sorted.sort((a, b) => fromPrice(b) - fromPrice(a));
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else sorted.sort((a, b) => b.likeCount - a.likeCount);

    return sorted;
  }, [products, search, category, sort]);

  const itemCount = basket.reduce((sum, entry) => sum + entry.quantity, 0);
  const subtotal = basket.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);

  const items = basket.map((entry) => ({
    variantId: entry.variantId,
    quantity: entry.quantity,
  }));

  const clearBasket = () => {
    setBasket([]);
    setCouponCode("");
    setCoinsToSpend("");
  };

  /** The member path: coupons, coins, and Razorpay. */
  const payAsMember = async () => {
    setPlacing(true);
    try {
      const sale = await startCheckout.mutateAsync({
        items,
        ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
        ...(coinsToSpend ? { coinsToSpend: Number(coinsToSpend) } : {}),
      });

      // Coins and a coupon can clear a bill outright, and then there is nothing
      // to pay — the API has already completed the order.
      if (!sale.checkout) {
        clearBasket();
        setBasketOpen(false);
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
        name: currentMembership()?.tenantName ?? gymName,
        description: `${basket.length} item${basket.length === 1 ? "" : "s"} from the store`,
      });

      if (result.status !== "paid") {
        // The member path claims stock while the card is being typed, so a
        // dismissed window has to give it back rather than leave a tub reserved
        // for nobody.
        await cancelOrder.mutateAsync(sale.order.id).catch(() => {
          // A failed release is not worth blocking the buyer on; the order
          // stays pending and the gym can clear it.
        });
        toast.error(
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
      clearBasket();
      setBasketOpen(false);
      toast.success("Paid. Collect it from the counter.");
    } catch (caught) {
      toast.error(getApiError(caught));
    } finally {
      setPlacing(false);
    }
  };

  /**
   * The member's other option: hold it, settle at the desk.
   *
   * Deliberately without the coupon and coins fields. Nothing is charged here,
   * and a coin spent against a bill nobody has settled would have to be clawed
   * back if the member never collects — so those apply on the online path, or
   * at the counter when staff ring the order through.
   */
  const payAtStoreAsMember = async () => {
    setPlacing(true);
    try {
      const res = await reserveOrder.mutateAsync({ items });
      setReference(res.reference);
      clearBasket();
      setBasketOpen(false);
      toast.success("Reserved. Pay when you collect it.");
    } catch (caught) {
      toast.error(getApiError(caught));
    } finally {
      setPlacing(false);
    }
  };

  /** The visitor path: reserve now, pay at the counter on collection. */
  const reserveAsGuest = async () => {
    if (buyerName.trim().length < 2 || buyerPhone.trim().length < 10) {
      toast.error("A name and a phone number are needed to hold this for you.");
      return;
    }

    setPlacing(true);
    try {
      const res = await publicApi.placeGuestOrder({
        items,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });

      setReference(res.data.data.reference);
      clearBasket();
      toast.success("Reserved. Pay when you collect it.");
    } catch (caught) {
      toast.error(getApiError(caught));
    } finally {
      setPlacing(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        <CardsGridSkeleton count={8} className="gap-3 sm:grid-cols-2 lg:grid-cols-4" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      {/* The shop's own bar: search and categories stay put while the grid
          scrolls, which is the whole ergonomics of browsing a catalogue. */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>

          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${gymName || "the"} store`}
              className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
            />
          </div>

          <Button
            variant={itemCount > 0 ? "default" : "outline"}
            size="sm"
            onClick={() => setBasketOpen(true)}
            aria-label={`Basket, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="ml-1 rounded-full bg-background/25 px-1.5 text-xs font-semibold">
                {itemCount}
              </span>
            )}
          </Button>
        </div>

        <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 pb-3 md:px-6">
          {CATEGORIES.map((entry) => (
            <button
              key={entry.value}
              onClick={() => setCategory(entry.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                category === entry.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {entry.label}
            </button>
          ))}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">Sort by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none"
            >
              {SORTS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
        {reference && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Reserved — quote {reference} at the counter
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing has been charged yet. Pay when you collect it, and bring the phone
              number you gave so the desk can find the order.
            </p>
          </div>
        )}

        {error ? (
          <EmptyState
            icon={ShoppingBag}
            title="The store could not be loaded"
            description={error}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={
              products.length === 0 ? "Nothing in the store yet" : "Nothing matches that"
            }
            description={
              products.length === 0
                ? "This gym has not added anything to sell."
                : "Try a different search, or clear the category filter."
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {visible.map((product) => {
              const photo = Array.isArray(product.photos) ? product.photos[0] : undefined;
              const stock = totalStock(product);
              const price = fromPrice(product);
              const buyable = product.variants.filter((v) => v.isActive && v.stock > 0);

              return (
                <div
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow hover:shadow-md"
                >
                  <button
                    onClick={() => navigate(`/store/products/${product.id}`)}
                    className="block aspect-square overflow-hidden bg-muted/50"
                    aria-label={`Open ${product.name}`}
                  >
                    {photo ? (
                      <OptimizedImage
                        src={photo}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
                    <button
                      onClick={() => navigate(`/store/products/${product.id}`)}
                      className="line-clamp-2 text-left text-sm font-medium hover:text-primary"
                    >
                      {product.name}
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-bold">{formatCurrency(price)}</span>
                      {product.variants.length > 1 && (
                        <span className="text-xs text-muted-foreground">onwards</span>
                      )}
                    </div>

                    {product.coinsGranted > 0 && (
                      <Badge variant="accent" className="w-fit text-[10px]">
                        <Coins className="mr-1 h-3 w-3" />+{product.coinsGranted} coins
                      </Badge>
                    )}

                    {stock === 0 ? (
                      <p className="mt-auto pt-1 text-xs font-medium text-destructive">
                        Out of stock
                      </p>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-auto"
                        onClick={() => {
                          // One live variant is unambiguous, so it goes straight
                          // in. More than one is a choice, and the choice is
                          // made on the product page rather than guessed here.
                          if (buyable.length === 1) addToBasket(product, buyable[0]!);
                          else navigate(`/store/products/${product.id}`);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {buyable.length === 1 ? "Add to cart" : "Choose option"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Basket ─────────────────────────────────────────────────────────── */}
      {basketOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Close basket"
            className="flex-1 bg-black/40"
            onClick={() => setBasketOpen(false)}
          />
          <aside className="flex w-full max-w-md flex-col bg-background shadow-xl">
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">
                Your basket{itemCount > 0 ? ` (${itemCount})` : ""}
              </h2>
              <Button variant="ghost" size="icon-sm" onClick={() => setBasketOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {basket.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nothing here yet.
                </p>
              ) : (
                basket.map((entry) => (
                  <div
                    key={entry.variantId}
                    className="flex gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-muted/50">
                      {entry.photo && (
                        <OptimizedImage
                          src={entry.photo}
                          alt={entry.productName}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.productName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.variantName}
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {formatCurrency(entry.unitPrice * entry.quantity)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => changeQuantity(entry.variantId, -1)}
                        aria-label="One fewer"
                      >
                        {entry.quantity === 1 ? (
                          <Trash2 className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                      </Button>
                      <span className="w-6 text-center text-sm">{entry.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon-xs"
                        disabled={entry.quantity >= entry.stock}
                        onClick={() => changeQuantity(entry.variantId, 1)}
                        aria-label="One more"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}

              {basket.length > 0 && asMember && (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="store-coupon">Coupon code</Label>
                    <Input
                      id="store-coupon"
                      value={couponCode}
                      onChange={(event) => setCouponCode(event.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="store-coins">Coins to spend</Label>
                    <Input
                      id="store-coins"
                      type="number"
                      min={0}
                      value={coinsToSpend}
                      onChange={(event) => setCoinsToSpend(event.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {basket.length > 0 && !asMember && (
                <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    Collection only — the gym holds it at the counter and you pay when
                    you pick it up.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="buyer-name">Your name</Label>
                    <Input
                      id="buyer-name"
                      value={buyerName}
                      onChange={(event) => setBuyerName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="buyer-phone">Phone</Label>
                    <Input
                      id="buyer-phone"
                      inputMode="tel"
                      value={buyerPhone}
                      onChange={(event) => setBuyerPhone(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="buyer-email">Email (optional)</Label>
                    <Input
                      id="buyer-email"
                      type="email"
                      value={buyerEmail}
                      onChange={(event) => setBuyerEmail(event.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {basket.length > 0 && (
              <footer className="space-y-3 border-t border-border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-lg font-bold">{formatCurrency(subtotal)}</span>
                </div>
                {asMember && (
                  <p className="text-xs text-muted-foreground">
                    A coupon or coins come off at the next step, and only when
                    paying online.
                  </p>
                )}
                {asMember ? (
                  <div className="space-y-2">
                    <Button className="w-full" disabled={placing} onClick={payAsMember}>
                      {placing ? "Working…" : "Pay online now"}
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={placing}
                      onClick={payAtStoreAsMember}
                    >
                      <Store className="h-4 w-4" />
                      Pay at the store
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Paying at the store holds nothing back for you until a coach
                      hands it over, so anything low on stock is safer bought now.
                    </p>
                  </div>
                ) : (
                  <Button className="w-full" disabled={placing} onClick={reserveAsGuest}>
                    {placing ? "Working…" : "Reserve for collection"}
                  </Button>
                )}
              </footer>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
