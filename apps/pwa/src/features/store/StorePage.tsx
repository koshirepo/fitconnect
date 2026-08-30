/**
 * Documentation: The store from behind the counter.
 *
 * - Not a shop. Members and visitors buy on the public storefront at `/store`; this is where staff work the other side of it — reservations to hand over, money to take, stock to correct. That split is why this screen needs `STORE_SELL` or `STORE_MANAGE` rather than the browse grant every member holds.
 * - The queue leads, because it is the thing with people waiting on it. A reservation holds no stock: it was written when somebody chose a basket, and nothing moves until Complete is pressed here. That is also why completing can fail — the last tub can be sold from under a reservation — and why the row stays pending when it does.
 * - Completing a member's reservation writes the payment row too, so store revenue reaches the finance page through the same ledger as memberships and charges, and grants the coins the basket promised. A guest reservation has no membership to hang either off.
 * - Primary exports: StorePage.
 */
import * as React from "react";
import {
  Boxes,
  Check,
  ClipboardList,
  Coins,
  Minus,
  Package,
  Phone,
  Plus,
  Settings,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import {
  useCompleteStoreOrder,
  useRejectStoreOrder,
  useSellAtCounter,
  useSellToGuest,
  useStoreOrders,
  useStoreProducts,
} from "@/api/queries/store";
import { useAllMembers } from "@/api/queries/members";
import MemberSelector from "@/components/ui/memberSelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StoreVariantPicker } from "./StoreVariantPicker";
import type { TenantMember, StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";
import { getApiError } from "@/api/client";
import { haptics } from "@/lib/haptics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { StoreOrderRow } from "@/api/store";

/** One line of a sale being rung up at the desk. */
type CounterLine = {
  variantId: string;
  label: string;
  unitPrice: number;
  stock: number;
  quantity: number;
};

const TABS = [
  { value: "PENDING", label: "To hand over" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

/** Whoever this order belongs to, named however they are known. */
function buyerOf(order: StoreOrderRow) {
  if (order.member) {
    return {
      name: order.member.user.name,
      phone: order.member.user.phone,
      badge: `#${order.member.memberId}`,
    };
  }
  return { name: order.buyerName ?? "Guest", phone: order.buyerPhone, badge: "Guest" };
}

export default function StorePage() {
  const toast = useToast();
  const navigate = useAppNavigate();
  // The shop is a public page on this same host, and `useAppNavigate` counts
  // "store" as a gym path — so it would rewrite /store to /dashboard/store and
  // send the reader back to the screen they are already on. This one link has
  // to go out unrewritten.
  const navigateRaw = useNavigate();
  const { can } = usePermissions();
  const canSell = can(Permission.STORE_SELL);
  const canManage = can(Permission.STORE_MANAGE);

  const [tab, setTab] = React.useState<string>("PENDING");
  const [confirm, setConfirm] = React.useState<
    { order: StoreOrderRow; action: "complete" | "reject" } | null
  >(null);

  const ordersQuery = useStoreOrders({ status: tab });
  // Its own read, so the tile reads the same on every tab. Sharing the list
  // query made it show a dash the moment anyone looked at Completed, which is
  // the one number the desk is actually watching.
  const pendingQuery = useStoreOrders({ status: "PENDING" });
  const productsQuery = useStoreProducts();
  const orders = React.useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);
  const products = React.useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const completeOrder = useCompleteStoreOrder();
  const rejectOrder = useRejectStoreOrder();
  const sellAtCounter = useSellAtCounter();
  const sellToGuest = useSellToGuest();

  // The roster is only fetched when a sale is actually being rung up: this
  // screen is opened many times a day to hand orders over, and almost never to
  // sell from scratch.
  const [sellOpen, setSellOpen] = React.useState(false);
  const membersQuery = useAllMembers({ enabled: sellOpen && canSell });
  const members = React.useMemo(() => membersQuery.data ?? [], [membersQuery.data]);

  // Who is at the counter. A walk-in buying a shaker should not have to join
  // the gym first, so the till takes either.
  const [buyerKind, setBuyerKind] = React.useState<"MEMBER" | "GUEST">("MEMBER");
  const [buyer, setBuyer] = React.useState<TenantMember | null>(null);
  const [guestName, setGuestName] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [lines, setLines] = React.useState<CounterLine[]>([]);
  const [couponCode, setCouponCode] = React.useState("");
  const [coinsToSpend, setCoinsToSpend] = React.useState("");
  const [selling, setSelling] = React.useState(false);

  const counterTotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );

  const addLine = (product: StoreProduct, variant: StoreVariant) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.variantId === variant.id);
      if (existing) {
        return prev.map((line) =>
          line.variantId === variant.id
            ? { ...line, quantity: Math.min(line.quantity + 1, variant.stock) }
            : line,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          label: `${product.name} — ${variant.name}`,
          unitPrice: variant.price,
          stock: variant.stock,
          quantity: 1,
        },
      ];
    });
  };

  const changeLine = (variantId: string, delta: number) => {
    setLines((prev) =>
      prev.flatMap((line) => {
        if (line.variantId !== variantId) return [line];
        const quantity = Math.min(Math.max(line.quantity + delta, 0), line.stock);
        return quantity === 0 ? [] : [{ ...line, quantity }];
      }),
    );
  };

  const resetSale = () => {
    setBuyer(null);
    setGuestName("");
    setGuestPhone("");
    setLines([]);
    setCouponCode("");
    setCoinsToSpend("");
  };

  const sellable =
    lines.length > 0 &&
    (buyerKind === "MEMBER"
      ? Boolean(buyer)
      : guestName.trim().length >= 2 && guestPhone.trim().length >= 10);

  /**
   * Ring a basket through for a member standing at the desk.
   *
   * Completes immediately: the money is in the till, so there is nothing to
   * settle later. Pricing, the coupon, and the coins are all the API's own —
   * this screen sends variant ids and quantities and nothing else.
   */
  const handleSell = async () => {
    if (!sellable) return;
    setSelling(true);

    const items = lines.map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity,
    }));

    try {
      if (buyerKind === "GUEST") {
        const sale = await sellToGuest.mutateAsync({
          items,
          buyerName: guestName.trim(),
          buyerPhone: guestPhone.trim(),
        });
        toast.success(`Sold for ${formatCurrency(sale.total)}.`);
      } else {
        const sale = await sellAtCounter.mutateAsync({
          membershipId: buyer!.id,
          items,
          ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}),
          ...(coinsToSpend ? { coinsToSpend: Number(coinsToSpend) } : {}),
        });
        toast.success(
          sale.coinsEarned > 0
            ? `Sold for ${formatCurrency(sale.total)}. ${sale.coinsEarned} coins earned.`
            : `Sold for ${formatCurrency(sale.total)}.`,
        );
      }

      haptics.payment();
      resetSale();
      setSellOpen(false);
    } catch (caught) {
      haptics.failure();
      toast.error(getApiError(caught));
    } finally {
      setSelling(false);
    }
  };

  /** Stock worth watching: what is gone, and what is nearly gone. */
  const stock = React.useMemo(() => {
    const variants = products.flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    );
    return {
      out: variants.filter((entry) => entry.variant.stock === 0),
      low: variants.filter((entry) => entry.variant.stock > 0 && entry.variant.stock <= 3),
      value: variants.reduce(
        (sum, entry) => sum + entry.variant.price * entry.variant.stock,
        0,
      ),
    };
  }, [products]);

  const waiting = pendingQuery.data?.length ?? null;

  /** Which stock tile, if any, is filtering the list below. */
  const [stockView, setStockView] = React.useState<"LOW" | "OUT" | null>(null);

  const handleConfirmed = async () => {
    if (!confirm) return;
    const { order, action } = confirm;
    setConfirm(null);

    try {
      if (action === "complete") {
        const result = await completeOrder.mutateAsync(order.id);
        // Handing an order over is a payment taken, same as any other.
        haptics.payment();
        toast.success(
          result.completed
            ? "Handed over. Stock updated."
            : "Somebody else closed that order first.",
        );
      } else {
        await rejectOrder.mutateAsync(order.id);
        toast.success("Reservation dropped. No stock was held.");
      }
    } catch (caught) {
      // The likely failure is stock: the last one sold while this sat reserved.
      toast.error(getApiError(caught));
    }
  };

  if (ordersQuery.isPending) return <ListPageSkeleton rows={5} search={false} filters={0} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store admin</h1>
          <p className="text-muted-foreground">
            Hand over reservations, take the money, and keep stock honest.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSell && (
            <Button onClick={() => setSellOpen((open) => !open)}>
              <ShoppingCart className="h-4 w-4" />
              {sellOpen ? "Close sale" : "Sell at counter"}
            </Button>
          )}
          <Button variant="outline" onClick={() => navigateRaw("/store")}>
            <Package className="h-4 w-4" />
            View shop
          </Button>
          {canManage && (
            <Button variant="outline" onClick={() => navigate("/store/manage")}>
              <Settings className="h-4 w-4" />
              Products &amp; stock
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Waiting to hand over"
          value={waiting === null ? "—" : String(waiting)}
          subtext="Show the queue"
          icon={ClipboardList}
          active={tab === "PENDING" && stockView === null}
          onClick={() => {
            setStockView(null);
            setTab("PENDING");
          }}
        />
        <StatCard
          label="Stock value"
          value={formatCurrency(stock.value)}
          subtext={canManage ? "Manage products" : "At current prices"}
          icon={Boxes}
          {...(canManage ? { onClick: () => navigate("/store/manage") } : {})}
        />
        <StatCard
          label="Low stock"
          value={String(stock.low.length)}
          subtext="3 or fewer left"
          icon={Package}
          color={stock.low.length > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
          active={stockView === "LOW"}
          onClick={() => setStockView((current) => (current === "LOW" ? null : "LOW"))}
        />
        <StatCard
          label="Out of stock"
          value={String(stock.out.length)}
          subtext="Nothing left to sell"
          icon={X}
          color={stock.out.length > 0 ? "text-destructive" : undefined}
          active={stockView === "OUT"}
          onClick={() => setStockView((current) => (current === "OUT" ? null : "OUT"))}
        />
      </div>

      {sellOpen && canSell && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sell at the counter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* A counter sale is complete the moment it is made — the money is
                in the till — so it needs the member up front rather than as an
                afterthought: the coins and any coupon are theirs. */}
            <div className="space-y-2">
              <Label>Buyer</Label>
              <div className="flex gap-2">
                {(["MEMBER", "GUEST"] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setBuyerKind(kind)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      buyerKind === kind
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {kind === "MEMBER" ? "Member" : "Walk-in"}
                  </button>
                ))}
              </div>

              {buyerKind === "MEMBER" ? (
                <MemberSelector
                  members={members}
                  selectedMember={buyer}
                  onSelect={setBuyer}
                  placeholder={
                    membersQuery.isPending ? "Loading members…" : "Choose the buyer"
                  }
                  title="Who is buying?"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="guest-name">Name</Label>
                    <Input
                      id="guest-name"
                      value={guestName}
                      onChange={(event) => setGuestName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="guest-phone">Phone</Label>
                    <Input
                      id="guest-phone"
                      inputMode="tel"
                      value={guestPhone}
                      onChange={(event) => setGuestPhone(event.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Pick from the catalogue below.
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.variantId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
                    >
                      <span className="min-w-0 truncate text-sm">{line.label}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon-xs"
                          onClick={() => changeLine(line.variantId, -1)}
                          aria-label="One fewer"
                        >
                          {line.quantity === 1 ? (
                            <Trash2 className="h-3 w-3" />
                          ) : (
                            <Minus className="h-3 w-3" />
                          )}
                        </Button>
                        <span className="w-5 text-center text-sm">{line.quantity}</span>
                        <Button
                          variant="outline"
                          size="icon-xs"
                          disabled={line.quantity >= line.stock}
                          onClick={() => changeLine(line.variantId, 1)}
                          aria-label="One more"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="w-20 text-right text-sm font-medium">
                          {formatCurrency(line.unitPrice * line.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              className={cn(
                "grid gap-3 sm:grid-cols-2",
                // Both hang off a membership, so a walk-in gets neither.
                buyerKind === "GUEST" && "hidden",
              )}
            >
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Before any coupon or coins
                </p>
                <p className="text-lg font-bold">{formatCurrency(counterTotal)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={resetSale} disabled={selling}>
                  Clear
                </Button>
                <Button onClick={handleSell} disabled={selling || !sellable}>
                  <Check className="h-4 w-4" />
                  {selling ? "Selling…" : "Take payment"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <StoreVariantPicker
                  key={product.id}
                  product={product}
                  canBuy
                  onAdd={(variant) => addLine(product, variant)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stockView && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">
              {stockView === "LOW" ? "Running low" : "Out of stock"}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStockView(null)}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {(stockView === "LOW" ? stock.low : stock.out).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {stockView === "LOW"
                  ? "Nothing is running low."
                  : "Everything is in stock."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(stockView === "LOW" ? stock.low : stock.out).map((entry) => (
                  <li
                    key={entry.variant.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{entry.product.name}</span>{" "}
                      <span className="text-muted-foreground">{entry.variant.name}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        entry.variant.stock === 0
                          ? "text-destructive"
                          : "text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {entry.variant.stock} left
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            onClick={() => setTab(entry.value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              tab === entry.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab === "PENDING" ? "Nothing waiting" : "Nothing here"}
          description={
            tab === "PENDING"
              ? "Reservations from the shop appear here for you to hand over."
              : "No orders with this status yet."
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const buyer = buyerOf(order);

            return (
              <Card key={order.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex flex-wrap items-center gap-2">
                      {buyer.name}
                      <Badge variant="secondary" className="text-[10px]">
                        {buyer.badge}
                      </Badge>
                      {/* The reference the buyer was told to quote. */}
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.id.slice(-6).toUpperCase()}
                      </span>
                    </span>
                    <span className="text-lg font-bold">
                      {formatCurrency(order.totalAmount)}
                    </span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(order.createdAt)}</span>
                    {buyer.phone && (
                      <a
                        href={`tel:${buyer.phone}`}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <Phone className="h-3 w-3" />
                        {buyer.phone}
                      </a>
                    )}
                    {order.coinsEarned > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Coins className="h-3 w-3" />
                        {order.member
                          ? `${order.coinsEarned} coins on handover`
                          : `${order.coinsEarned} coins — member orders only`}
                      </span>
                    )}
                    {order.soldBy && <span>Sold by {order.soldBy.user.name}</span>}
                  </div>

                  <ul className="space-y-1 text-sm">
                    {order.items.map((item, index) => (
                      <li
                        key={`${order.id}-${index}`}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="font-medium">{item.productName}</span>{" "}
                          <span className="text-muted-foreground">{item.variantName}</span>{" "}
                          <span className="text-muted-foreground">× {item.quantity}</span>
                        </span>
                        <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>

                  {order.note && (
                    <p className="text-sm text-muted-foreground">{order.note}</p>
                  )}

                  {order.status === "PENDING" && canSell && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => setConfirm({ order, action: "complete" })}
                      >
                        <Check className="h-4 w-4" />
                        Collected &amp; paid
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirm({ order, action: "reject" })}
                      >
                        <X className="h-4 w-4" />
                        Drop it
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.action === "complete" ? "Hand this order over?" : "Drop this reservation?"
        }
        description={
          confirm?.action === "complete"
            ? `Confirms ${formatCurrency(confirm.order.totalAmount)} taken and takes the items out of stock.${
                confirm.order.member ? " The member's coins are granted now." : ""
              }`
            : "The buyer never collected it. Nothing was held back, so nothing is returned."
        }
        confirmLabel={confirm?.action === "complete" ? "Collected & paid" : "Drop it"}
        onConfirm={handleConfirmed}
      />
    </div>
  );
}
