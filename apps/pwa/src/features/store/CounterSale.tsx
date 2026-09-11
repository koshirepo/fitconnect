/**
 * Documentation: Ringing a sale up at the desk, laid out like the shop.
 *
 * - The grid, toolbar and cards a member sees at `/shop`, so a coach finds a tub by the photo on its label rather than by reading down a list of variant names. The pieces are the storefront's own — `StorefrontToolbar`, `ProductGrid`, `ProductCard`, `VariantOptionsCard`, `CartLine`, `CartSummary`, `BasketDrawer`, and the same search, chips and sort — so only what the counter does differently lives here.
 * - The cart is where the sale is finished: who is buying, the lines, a coupon and coins for a member, how the money was taken, and the button that takes it. A walk-in buying a shaker does not have to join the gym first. The sale completes the moment it is made, because the money is already in the till.
 * - There is no cart button here. The page owns the cart through `useCounterCart` and opens it from its header, so the desk has exactly one cart button to look for.
 * - A product sold in several forms opens its options in a dialog rather than leaving the page, and the quantities there are the cart's own — two 1kg tubs and one 2kg tub are chosen in one place.
 * - Prices on the cards are the catalogue's; what is charged is the API's. The cart sends variant ids and quantities, and the coupon and coins are applied on the server.
 * - Primary exports: CounterSale.
 */
import * as React from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Footprints,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  UserRound,
} from "lucide-react";

import type { StoreProduct, TenantMember } from "@fitconnect/shared/types/models";
import { getApiError } from "@/api/client";
import { useAllMembers } from "@/api/queries/members";
import { useSellAtCounter, useSellToGuest } from "@/api/queries/store";
import { BasketDrawer } from "@/components/catalog/basket-drawer";
import { CartLine, CartSummary } from "@/components/catalog/cart-line";
import { ProductCard } from "@/components/catalog/product-card";
import { QuantityStepper } from "@/components/catalog/quantity-stepper";
import { ProductGrid, StorefrontToolbar } from "@/components/catalog/storefront-toolbar";
import { VariantOptionsCard } from "@/components/catalog/variant-options";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MemberSelector from "@/components/ui/memberSelector";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { PhoneInput } from "@/components/ui/phone-input";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { haptics } from "@/lib/haptics";
import { cn, formatCurrency } from "@/lib/utils";
import {
  ALL_CATEGORIES,
  categoryChipsFor,
  filterAndSort,
  fromPrice,
  totalStock,
} from "./storefront";
import { CoinsBadge, StoreSortSelect } from "./storefront-controls";
import type { CounterCart } from "./use-counter-cart";

/**
 * How the money reached the till.
 *
 * A store sale has no payment-method column of its own, so this rides on the
 * order's note — which the desk's order list and the payment row both already
 * show — and reconciling the drawer at close is a matter of reading it.
 */
const METHODS = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "UPI", label: "UPI", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
] as const;

type Method = (typeof METHODS)[number]["value"];

const BUYERS = [
  { kind: "MEMBER", label: "Member", icon: UserRound },
  { kind: "GUEST", label: "Walk-in", icon: Footprints },
] as const;

type BuyerKind = (typeof BUYERS)[number]["kind"];

function firstPhoto(product: StoreProduct) {
  return Array.isArray(product.photos) ? product.photos[0] : undefined;
}

export function CounterSale({
  products,
  cart,
  loading = false,
}: {
  products: StoreProduct[];
  /** The page's counter cart. It opens the panel; this fills and finishes it. */
  cart: CounterCart;
  loading?: boolean;
}) {
  const toast = useToast();
  const sellAtCounter = useSellAtCounter();
  const sellToGuest = useSellToGuest();

  // Browsing, exactly as the shop does it.
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState<string>(ALL_CATEGORIES);
  const [sort, setSort] = React.useState<string>("name");
  const categories = React.useMemo(() => categoryChipsFor(products), [products]);
  const visible = React.useMemo(
    () => filterAndSort(products, { search, category, sort }),
    [products, search, category, sort],
  );

  const [choosing, setChoosing] = React.useState<StoreProduct | null>(null);

  // Who is at the counter, and how they paid.
  const [buyerKind, setBuyerKind] = React.useState<BuyerKind>("MEMBER");
  const [buyer, setBuyer] = React.useState<TenantMember | null>(null);
  const [guestName, setGuestName] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [couponCode, setCouponCode] = React.useState("");
  const [coinsToSpend, setCoinsToSpend] = React.useState("");
  const [method, setMethod] = React.useState<Method>("cash");
  const [selling, setSelling] = React.useState(false);

  // The roster is only fetched once the cart is opened: this screen is visited
  // many times a day to hand orders over, and far less often to sell.
  const membersQuery = useAllMembers({ enabled: cart.open });
  const members = React.useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  const methodLabel = METHODS.find((entry) => entry.value === method)?.label ?? "Cash";

  /** Ready for the next person at the counter. */
  const resetSale = () => {
    cart.clear();
    setBuyer(null);
    setGuestName("");
    setGuestPhone("");
    setCouponCode("");
    setCoinsToSpend("");
    setMethod("cash");
  };

  const sellable =
    cart.lines.length > 0 &&
    (buyerKind === "MEMBER"
      ? Boolean(buyer)
      : guestName.trim().length >= 2 && guestPhone.trim().length >= 10);

  /**
   * Take the money and complete the sale.
   *
   * The server prices the basket, applies the coupon and coins, and takes the
   * stock; this sends variant ids, quantities, and how the money arrived.
   */
  const takePayment = async () => {
    if (!sellable) return;
    setSelling(true);

    const items = cart.lines.map((entry) => ({
      variantId: entry.variantId,
      quantity: entry.quantity,
    }));
    const note = `Paid by ${method}`;

    try {
      if (buyerKind === "GUEST") {
        const sale = await sellToGuest.mutateAsync({
          items,
          buyerName: guestName.trim(),
          buyerPhone: guestPhone.trim(),
          note,
        });
        toast.success(`Sold for ${formatCurrency(sale.total)}.`);
      } else {
        const sale = await sellAtCounter.mutateAsync({
          membershipId: buyer!.id,
          items,
          ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
          ...(coinsToSpend ? { coinsToSpend: Number(coinsToSpend) } : {}),
          note,
        });
        toast.success(
          sale.coinsEarned > 0
            ? `Sold for ${formatCurrency(sale.total)}. ${sale.coinsEarned} coins earned.`
            : `Sold for ${formatCurrency(sale.total)}.`,
        );
      }

      haptics.payment();
      resetSale();
      cart.setOpen(false);
    } catch (caught) {
      haptics.failure();
      toast.error(getApiError(caught));
    } finally {
      setSelling(false);
    }
  };

  return (
    <section aria-label="Sell at the counter" className="space-y-4">
      <StorefrontToolbar
        stickyTop={57}
        // Edge to edge across the dashboard's own padding, and lined up with it.
        className="-mx-3 md:-mx-6"
        containerClassName="max-w-none px-3 sm:px-3 md:px-6 lg:px-6"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search products to sell"
        categories={categories}
        activeCategory={category}
        onCategoryChange={setCategory}
        sort={<StoreSortSelect value={sort} onChange={setSort} />}
      />

      {loading ? (
        <CardsGridSkeleton count={8} className="grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title={products.length === 0 ? "Nothing in the store yet" : "Nothing matches that"}
          description={
            products.length === 0
              ? "Add products under Products & stock to sell them here."
              : "Try a different search, or clear the category filter."
          }
        />
      ) : (
        // Three across beside the sidebar at `lg`, where four left each card
        // too narrow for its price and its button.
        <ProductGrid className="lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((product) => {
            const stock = totalStock(product);
            const buyable = product.variants.filter((v) => v.isActive && v.stock > 0);
            const single = buyable.length === 1 ? buyable[0]! : null;
            const inCart = product.variants.reduce((sum, v) => sum + cart.quantityOf(v.id), 0);

            return (
              <ProductCard
                key={product.id}
                name={product.name}
                photo={firstPhoto(product)}
                stock={stock}
                onOpen={() => setChoosing(product)}
                emptyIcon={<ShoppingBag className="h-8 w-8" />}
                topLeft={
                  inCart > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
                      {inCart} in cart
                    </span>
                  ) : undefined
                }
                topRight={
                  product.coinsGranted > 0 ? <CoinsBadge coins={product.coinsGranted} /> : undefined
                }
                price={fromPrice(product)}
                priceSuffix={product.variants.length > 1 ? "onwards" : undefined}
                description={product.description}
                action={
                  stock === 0 ? (
                    <Button variant="outline" className="w-full" disabled>
                      Sold out
                    </Button>
                  ) : single && cart.quantityOf(single.id) > 0 ? (
                    // Already in the cart: the card becomes its stepper, so a
                    // second tub is one tap here rather than a trip to the cart.
                    <QuantityStepper
                      className="w-full justify-between"
                      quantity={cart.quantityOf(single.id)}
                      stock={single.stock}
                      label={`Quantity of ${product.name}`}
                      onChange={(quantity) => cart.setQuantity(product, single, quantity)}
                    />
                  ) : (
                    <Button
                      className="w-full"
                      variant={single ? "default" : "outline"}
                      onClick={() =>
                        single ? cart.setQuantity(product, single, 1) : setChoosing(product)
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {single ? "Add" : "Options"}
                    </Button>
                  )
                }
              />
            );
          })}
        </ProductGrid>
      )}

      {/* ── A product's options ───────────────────────────────────────────── */}
      <Dialog open={Boolean(choosing)} onOpenChange={(open) => !open && setChoosing(null)}>
        <DialogContent className="sm:max-w-lg">
          {choosing && (
            <>
              <DialogHeader className="flex-row items-center gap-3 pr-8">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted/50">
                  {firstPhoto(choosing) && (
                    <OptimizedImage
                      src={firstPhoto(choosing)!}
                      alt={choosing.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-base">{choosing.name}</DialogTitle>
                  {choosing.description && (
                    <DialogDescription>{choosing.description}</DialogDescription>
                  )}
                </div>
              </DialogHeader>

              <VariantOptionsCard
                title="Add to cart"
                variants={choosing.variants.filter((variant) => variant.isActive)}
                quantityFor={(variant) => cart.quantityOf(variant.id)}
                onQuantityChange={(row, quantity) => {
                  const variant = choosing.variants.find((candidate) => candidate.id === row.id);
                  if (variant) cart.setQuantity(choosing, variant, quantity);
                }}
              />

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setChoosing(null)}>
                  Keep browsing
                </Button>
                <Button
                  onClick={() => {
                    setChoosing(null);
                    cart.setOpen(true);
                  }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  View cart
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── The cart ──────────────────────────────────────────────────────── */}
      <BasketDrawer
        open={cart.open}
        onClose={() => cart.setOpen(false)}
        title="Counter cart"
        count={cart.itemCount}
        footer={
          cart.lines.length > 0 ? (
            <>
              <CartSummary
                rows={[{ label: "Subtotal", value: formatCurrency(cart.subtotal), strong: true }]}
                footnote={
                  buyerKind === "MEMBER"
                    ? "A coupon or coins come off when the payment is taken; the confirmation shows what was charged."
                    : "A walk-in pays the shelf price. Coupons and coins belong to a membership."
                }
              />
              <div className="space-y-2">
                <Button className="w-full" disabled={selling || !sellable} onClick={takePayment}>
                  <Check className="h-4 w-4" />
                  {selling ? "Taking payment…" : `Take payment · ${methodLabel}`}
                </Button>
                {!sellable && (
                  <p className="text-center text-xs text-muted-foreground">
                    {buyerKind === "MEMBER"
                      ? "Choose the member who is buying to continue."
                      : "Add the buyer's name and phone number to continue."}
                  </p>
                )}
                <Button variant="ghost" className="w-full" disabled={selling} onClick={resetSale}>
                  Clear cart
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
        {/* Who first. The coins and any coupon are a member's, and a walk-in
            needs a name before anything is handed over. */}
        <div className="space-y-2">
          <Label>Who is buying?</Label>
          <div className="grid grid-cols-2 gap-2">
            {BUYERS.map(({ kind, label, icon: Icon }) => (
              <ChoiceButton
                key={kind}
                active={buyerKind === kind}
                onClick={() => setBuyerKind(kind)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </ChoiceButton>
            ))}
          </div>

          {buyerKind === "MEMBER" ? (
            <MemberSelector
              members={members}
              selectedMember={buyer}
              onSelect={setBuyer}
              placeholder={membersQuery.isPending ? "Loading members…" : "Choose the member"}
              title="Who is buying?"
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="counter-guest-name">Name</Label>
                <Input
                  id="counter-guest-name"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="counter-guest-phone">Phone</Label>
                <PhoneInput
                  id="counter-guest-phone"
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Items</Label>
          {cart.lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              Nothing in the cart yet. Tap Add on a product.
            </p>
          ) : (
            cart.lines.map((entry) => (
              <CartLine
                key={entry.variantId}
                name={entry.productName}
                subtitle={entry.variantName}
                photo={entry.photo}
                price={formatCurrency(entry.unitPrice * entry.quantity)}
                meta={`${formatCurrency(entry.unitPrice)} each · ${cart.stockFor(entry)} on the shelf`}
                quantity={entry.quantity}
                canIncrease={entry.quantity < cart.stockFor(entry)}
                onDecrease={() => cart.changeLine(entry, -1)}
                onIncrease={() => cart.changeLine(entry, 1)}
              />
            ))
          )}
        </div>

        {cart.lines.length > 0 && buyerKind === "MEMBER" && (
          <div className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="counter-coupon">Coupon code</Label>
              <Input
                id="counter-coupon"
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="counter-coins">Coins to spend</Label>
              <Input
                id="counter-coins"
                type="number"
                min={0}
                value={coinsToSpend}
                onChange={(event) => setCoinsToSpend(event.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        )}

        {cart.lines.length > 0 && (
          <div className="space-y-2">
            <Label>Payment taken by</Label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(({ value, label, icon: Icon }) => (
                <ChoiceButton key={value} active={method === value} onClick={() => setMethod(value)}>
                  <Icon className="h-4 w-4" />
                  {label}
                </ChoiceButton>
              ))}
            </div>
          </div>
        )}
      </BasketDrawer>
    </section>
  );
}

/** One of a small set of mutually exclusive choices, drawn as a button. */
function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
