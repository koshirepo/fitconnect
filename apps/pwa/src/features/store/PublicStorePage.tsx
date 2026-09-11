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
import { Plus, Store } from "lucide-react";

import { publicApi } from "@/api/public";
import {
  readCachedTenantBranding,
  writeCachedTenantBranding,
  type TenantBranding,
} from "@/lib/tenant-branding";
import { getApiError } from "@/api/client";
import { haptics } from "@/lib/haptics";
import { useAuthStore } from "@/stores/auth";
import { useCurrentTenantId } from "@/api/queries/shared";
import {
  useCancelStoreOrder,
  useReserveStoreOrder,
  useStartStoreCheckout,
  useVerifyStoreCheckout,
} from "@/api/queries/store";
import { openRazorpayCheckout } from "@/lib/razorpay-checkout";
import { useVirtualKeyboard } from "@/lib/use-virtual-keyboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { ProductCard } from "@/components/catalog/product-card";
import { BasketDrawer } from "@/components/catalog/basket-drawer";
import { CartLine, CartSummary } from "@/components/catalog/cart-line";
import { FulfilmentBadge } from "@/components/catalog/fulfilment-badge";
import { ProductGrid, StorefrontToolbar } from "@/components/catalog/storefront-toolbar";
import { readBasket, writeBasket, type BasketEntry } from "./basket";
import {
  ALL_CATEGORIES,
  categoryChipsFor,
  filterAndSort,
  fromPrice,
  totalStock,
} from "./storefront";
import { CoinsBadge, StoreCartButton, StoreSortSelect } from "./storefront-controls";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { ShoppingBag } from "lucide-react";
import type { StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";

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
  // The shop wears the gym's name and mark, not the platform's. Read from the
  // same cache the login screen and the install prompt use, so a member who has
  // been here before sees the branding on the first frame rather than after a
  // round trip.
  const [brand, setBrand] = React.useState<TenantBranding | null>(() => readCachedTenantBranding());
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);
  const [sort, setSort] = React.useState<string>("popular");

  // Derived from what the gym actually sells, the same way the counter does.
  const categoryChips = React.useMemo(() => categoryChipsFor(products), [products]);

  const [tenantId, setTenantId] = React.useState<string | null>(null);
  const [basket, setBasket] = React.useState<BasketEntry[]>([]);

  /** Every write goes through storage, so the product page sees the same basket. */
  const persist = React.useCallback(
    (next: BasketEntry[] | ((prev: BasketEntry[]) => BasketEntry[])) => {
      setBasket((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        return writeBasket(tenantId, value);
      });
    },
    [tenantId],
  );
  const [basketOpen, setBasketOpen] = React.useState(false);
  // The basket is where somebody types their name and phone on a phone held in
  // one hand. The viewport meta shrinks the layout so the pay button stays
  // above the keyboard; this drops the prose that would otherwise push it back
  // down into what little room is left.
  const keyboard = useVirtualKeyboard();

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
  // Whether that reference is a receipt or a promise to pay. The wording
  // afterwards is the only thing telling somebody whether they still owe money.
  const [paid, setPaid] = React.useState(false);

  const guestDetailsValid = buyerName.trim().length >= 2 && buyerPhone.trim().length >= 10;

  React.useEffect(() => {
    let active = true;

    publicApi
      .getStore()
      .then((res) => {
        if (!active) return;
        setProducts(res.data.data.products);
        setGymName(res.data.data.tenant.name);
        setTenantId(res.data.data.tenant.id);
        setBasket(readBasket(res.data.data.tenant.id));
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

  React.useEffect(() => {
    if (brand) return;

    const host = typeof window === "undefined" ? "" : window.location.host;
    let active = true;

    publicApi
      .getTenantBranding(host)
      .then((res) => {
        const next = res.data.data.tenant as TenantBranding | undefined;
        if (!next || !active) return;
        setBrand(next);
        writeCachedTenantBranding(next, host);
      })
      .catch(() => {
        // The shop works unbranded; a missing logo is not worth an error state.
      });

    return () => {
      active = false;
    };
  }, [brand]);

  // The mark belongs to the shared header now; the name is still wanted here
  // for the search placeholder and the collection reference.
  const storeTitle = brand?.name ?? gymName;

  const addToBasket = React.useCallback(
    (product: StoreProduct, variant: StoreVariant) => {
      persist((prev) => {
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
    // `persist` closes over tenantId, which arrives after the first render.
    // Holding the first one froze every add at tenantId null, and writeBasket
    // returns early without storing anything when it has no tenant — so the
    // basket looked right on screen and was never written, which is exactly
    // what persisting through storage exists to prevent.
    [persist],
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

    // The product page sends how many, not just which: its Options rows carry a
    // stepper now, so arriving with three of something has to mean three.
    const requested = Number.parseInt(searchParams.get("qty") ?? "1", 10);
    const quantity = Number.isFinite(requested) && requested > 0 ? requested : 1;

    for (const product of products) {
      const variant = product.variants.find((candidate) => candidate.id === variantId);
      if (variant) {
        for (let added = 0; added < quantity; added += 1) addToBasket(product, variant);
        break;
      }
    }

    setSearchParams(
      (params) => {
        params.delete("add");
        params.delete("qty");
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

  const visible = React.useMemo(
    () => filterAndSort(products, { search, category, sort }),
    [products, search, category, sort],
  );

  const itemCount = basket.reduce((sum, entry) => sum + entry.quantity, 0);
  const subtotal = basket.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0);

  const items = basket.map((entry) => ({
    variantId: entry.variantId,
    quantity: entry.quantity,
  }));

  const clearBasket = () => {
    persist([]);
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
      haptics.payment();
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

  /**
   * The visitor path, paid now.
   *
   * Stock is claimed when the window opens, exactly as it is for a member:
   * somebody who has paid has bought the thing, and it must not sell from
   * under them while they type a card number.
   */
  const payAsGuest = async () => {
    if (!guestDetailsValid) {
      toast.error("A name and a phone number are needed for the receipt.");
      return;
    }

    setPlacing(true);
    try {
      const res = await publicApi.startGuestCheckout({
        items,
        buyerName: buyerName.trim(),
        buyerPhone: buyerPhone.trim(),
        ...(buyerEmail.trim() ? { buyerEmail: buyerEmail.trim() } : {}),
      });
      const { checkout, reference: ref } = res.data.data;

      const result = await openRazorpayCheckout({
        keyId: checkout.keyId,
        orderId: checkout.orderId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: storeTitle || gymName,
        description: `${basket.length} item${basket.length === 1 ? "" : "s"}`,
        prefill: { name: buyerName.trim(), contact: buyerPhone.trim() },
      });

      if (result.status !== "paid") {
        toast.error(
          result.status === "failed"
            ? `${result.message} Nothing was charged.`
            : "Payment cancelled. Nothing was charged.",
        );
        return;
      }

      await publicApi.verifyGuestCheckout({
        orderId: result.orderId,
        paymentId: result.paymentId,
        signature: result.signature,
      });

      haptics.payment();
      setReference(ref);
      setPaid(true);
      clearBasket();
      setBasketOpen(false);
      toast.success("Paid. Collect it from the counter.");
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
      setPaid(false);
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
      <div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <CardsGridSkeleton
            count={8}
            className="gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* No heading of its own: the shared frame above carries the gym's mark
          and name, and a second one under it would only repeat them. What is
          left is the shop's own furniture — search, categories, the cart. */}

      {/* Search and categories stay put while the grid scrolls, which is the
          whole ergonomics of browsing a catalogue. */}
      <StorefrontToolbar
        stickyTop={57}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${gymName || "the"} store`}
        categories={categoryChips}
        activeCategory={category}
        onCategoryChange={setCategory}
        cart={
          <StoreCartButton count={itemCount} total={subtotal} onClick={() => setBasketOpen(true)} />
        }
        sort={<StoreSortSelect value={sort} onChange={setSort} />}
      />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        {reference && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {paid ? "Paid" : "Reserved"} — quote {reference} at {storeTitle || "the counter"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {paid
                ? "Your order is paid for and waiting. Bring the reference, or the phone number you gave, and the desk will hand it over."
                : "Nothing has been charged yet. Pay when you collect it, and bring the phone number you gave so the desk can find the order."}
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
            title={products.length === 0 ? "Nothing in the store yet" : "Nothing matches that"}
            description={
              products.length === 0
                ? "This gym has not added anything to sell."
                : "Try a different search, or clear the category filter."
            }
          />
        ) : (
          <ProductGrid>
            {visible.map((product) => {
              const photo = Array.isArray(product.photos) ? product.photos[0] : undefined;
              const stock = totalStock(product);
              const price = fromPrice(product);
              const buyable = product.variants.filter((v) => v.isActive && v.stock > 0);

              return (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  photo={photo}
                  stock={stock}
                  onOpen={() => navigate(`/shop/products/${product.id}`)}
                  emptyIcon={<ShoppingBag className="h-8 w-8" />}
                  topRight={
                    product.coinsGranted > 0 ? <CoinsBadge coins={product.coinsGranted} /> : undefined
                  }
                  price={price}
                  priceSuffix={product.variants.length > 1 ? "onwards" : undefined}
                  description={product.description}
                  action={
                    stock === 0 ? (
                      <Button variant="outline" className="w-full" disabled>
                        Sold out
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => {
                          // One live variant is unambiguous, so it goes straight
                          // in. More than one is a choice, and the choice is made
                          // on the product page rather than guessed here.
                          if (buyable.length === 1) addToBasket(product, buyable[0]!);
                          else navigate(`/shop/products/${product.id}`);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {buyable.length === 1 ? "Add" : "Options"}
                      </Button>
                    )
                  }
                />
              );
            })}
          </ProductGrid>
        )}
      </div>

      {/* ── Basket ─────────────────────────────────────────────────────────── */}
      <BasketDrawer
        open={basketOpen}
        onClose={() => setBasketOpen(false)}
        title="Your basket"
        count={itemCount}
        footer={
          basket.length > 0 ? (
            <>
              <CartSummary
                rows={[{ label: "Subtotal", value: formatCurrency(subtotal), strong: true }]}
                footnote={
                  asMember
                    ? "A coupon or coins come off at the next step, and only when paying online."
                    : undefined
                }
              />
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
                  {!keyboard.open && (
                    <p className="text-center text-xs text-muted-foreground">
                      Paying at the store holds nothing back for you until a coach hands it over,
                      so anything low on stock is safer bought now.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    disabled={placing || !guestDetailsValid}
                    onClick={payAsGuest}
                  >
                    {placing ? "Working…" : "Pay online now"}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={placing || !guestDetailsValid}
                    onClick={reserveAsGuest}
                  >
                    <Store className="h-4 w-4" />
                    Reserve and pay at the store
                  </Button>
                  {!keyboard.open && (
                    <p className="text-center text-xs text-muted-foreground">
                      {guestDetailsValid
                        ? "Reserving holds nothing back until a coach hands it over, so anything low on stock is safer bought now."
                        : "Add your name and phone number above to continue."}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : undefined
        }
      >
        {basket.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          basket.map((entry) => (
            <CartLine
              key={entry.variantId}
              name={entry.productName}
              subtitle={entry.variantName}
              photo={entry.photo}
              price={formatCurrency(entry.unitPrice * entry.quantity)}
              meta={<FulfilmentBadge fulfilment="PICKUP" className="mt-1" />}
              quantity={entry.quantity}
              canIncrease={entry.quantity < entry.stock}
              onDecrease={() => changeQuantity(entry.variantId, -1)}
              onIncrease={() => changeQuantity(entry.variantId, 1)}
            />
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
            {!keyboard.open && (
              <p className="text-xs text-muted-foreground">
                Everything is collected from the gym. Pay now or at the counter — either way we
                need a name and number to hand it to.
              </p>
            )}
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
              <PhoneInput
                id="buyer-phone"
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
      </BasketDrawer>
    </div>
  );
}
