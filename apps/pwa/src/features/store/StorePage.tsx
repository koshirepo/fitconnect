/**
 * Documentation: The store from behind the counter.
 *
 * - Not a shop. Members and visitors buy on the public storefront at `/shop`; this is where staff work the other side of it — reservations to hand over, money to take, stock to correct. That split is why this screen needs `STORE_SELL` or `STORE_MANAGE` rather than the browse grant every member holds.
 * - The queue leads, because it is the thing with people waiting on it. A reservation holds no stock: it was written when somebody chose a basket, and nothing moves until Complete is pressed here. That is also why completing can fail — the last tub can be sold from under a reservation — and why the row stays pending when it does.
 * - Completing a member's reservation writes the payment row too, so store revenue reaches the finance page through the same ledger as memberships and charges, and grants the coins the basket promised. A guest reservation has no membership to hang either off.
 * - Selling from scratch is `CounterSale`: the shop's own grid, always on the page for staff who sell. Its cart belongs to this page through `useCounterCart`, so the one cart button is Sell at counter in the header — it shows what is in the cart and opens it to take the payment.
 * - Primary exports: StorePage.
 */
import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Boxes,
  Check,
  ClipboardList,
  Coins,
  Package,
  Phone,
  Settings,
  X,
} from "lucide-react";

import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useNavigate } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import {
  useCompleteStoreOrder,
  useRejectStoreOrder,
  useStoreOrders,
  useStoreProducts,
} from "@/api/queries/store";
import { CounterSale } from "./CounterSale";
import { StoreCartButton } from "./storefront-controls";
import { useCounterCart } from "./use-counter-cart";
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
import { usePhoneDisplay } from "@/lib/use-phone-display";
import { formatCompactCurrency, formatCurrency, formatDate, cn } from "@/lib/utils";
import type { StoreOrderRow } from "@/api/store";

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
  const { format: formatPhone } = usePhoneDisplay();
  const canSell = can(Permission.STORE_SELL);
  const canManage = can(Permission.STORE_MANAGE);

  const [tab, setTab] = React.useState<string>("PENDING");
  const [confirm, setConfirm] = React.useState<{
    order: StoreOrderRow;
    action: "complete" | "reject";
  } | null>(null);

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

  // The counter's cart lives here rather than in `CounterSale`, so its one
  // button can be this page's main action, in the header.
  const counter = useCounterCart(products);

  /** Stock worth watching: what is gone, and what is nearly gone. */
  const stock = React.useMemo(() => {
    const variants = products.flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    );
    return {
      out: variants.filter((entry) => entry.variant.stock === 0),
      low: variants.filter((entry) => entry.variant.stock > 0 && entry.variant.stock <= 3),
      value: variants.reduce((sum, entry) => sum + entry.variant.price * entry.variant.stock, 0),
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
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Store admin"
        description="Hand over reservations, take the money, and keep stock honest."
        actions={
          <>
            {/* On a phone these used to wrap two-then-one, leaving a stray button on
                      its own line. The primary action takes the full width and the two
                      secondaries split the row beneath it; from `sm` up they sit inline
                      as before. */}
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              {canSell && (
                // The only cart button on the page. Products go in from the
                // grid below; this opens the cart to finish the sale.
                <StoreCartButton
                  className="col-span-2 sm:col-span-1"
                  variant="default"
                  text="Sell at counter"
                  label="Counter cart"
                  count={counter.itemCount}
                  total={counter.subtotal}
                  onClick={() => counter.setOpen(true)}
                />
              )}
              <Button variant="outline" onClick={() => navigateRaw("/dashboard/store")}>
                <Package className="h-4 w-4" />
                View shop
              </Button>
              {canManage && (
                <Button variant="outline" onClick={() => navigate("/dashboard/store/manage")}>
                  <Settings className="h-4 w-4" />
                  Products &amp; stock
                </Button>
              )}
            </div>
          </>
        }
      />

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
          value={formatCompactCurrency(stock.value)}
          subtext={canManage ? "Manage products" : "At current prices"}
          icon={Boxes}
          {...(canManage ? { onClick: () => navigate("/dashboard/store/manage") } : {})}
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

      {stockView && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle>{stockView === "LOW" ? "Running low" : "Out of stock"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setStockView(null)}>
              <X className="h-4 w-4" />
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {(stockView === "LOW" ? stock.low : stock.out).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {stockView === "LOW" ? "Nothing is running low." : "Everything is in stock."}
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

      {/* The shop's own grid, always here for staff who sell, so a sale starts
          with a tap on a product rather than a button to open a panel first. */}
      {canSell && (
        <CounterSale products={products} loading={productsQuery.isPending} cart={counter} />
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
                  {/* The amount sits opposite the name from `sm` up. On a phone
                      the two never fit, and letting them wrap dropped the total
                      onto its own line at body size — so it is stated first
                      instead, which is what the person at the counter reads. */}
                  <CardTitle className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                    <span className="order-2 flex flex-wrap items-center gap-2 sm:order-1">
                      {buyer.name}
                      <Badge variant="secondary" className="text-[10px]">
                        {buyer.badge}
                      </Badge>
                      {/* The reference the buyer was told to quote. */}
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.id.slice(-6).toUpperCase()}
                      </span>
                    </span>
                    <span className="order-1 text-lg font-bold tabular-nums sm:order-2">
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
                        {/* Masked for staff who may not read numbers; the
                            `tel:` link above still dials the real one. */}
                        {formatPhone(buyer.phone)}
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

                  {order.note && <p className="text-sm text-muted-foreground">{order.note}</p>}

                  {order.status === "PENDING" && canSell && (
                    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap">
                      <Button size="sm" onClick={() => setConfirm({ order, action: "complete" })}>
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
        title={confirm?.action === "complete" ? "Hand this order over?" : "Drop this reservation?"}
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
