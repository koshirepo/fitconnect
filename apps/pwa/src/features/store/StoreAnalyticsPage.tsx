/**
 * Documentation: The shop's own month — what it sold, what that cost, and what was left.
 *
 * - Separate from the payments screen on purpose. A gym runs two unrelated businesses through one ledger: memberships, and things off a shelf. Nothing here counts a subscription, and the payments screen no longer counts a tub.
 * - Profit leads, not revenue. A shop can turn over ₹200,000 and keep ₹8,000 of it, so the headline is margin and every slice below carries its cost beside its takings.
 * - Both prices are read from the order lines, which froze the selling and purchase price at the moment of sale. Repricing a product, or a supplier raising their rate, never rewrites a month that has closed.
 * - Sales made before a purchase price was ever recorded are named and held out of profit, rather than counted as having cost nothing.
 * - Primary exports: StoreAnalyticsPage.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useStoreAnalytics } from "@/api/queries/store";
import type { StoreSlice } from "@/api/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthNav } from "@/components/ui/month-nav";
import { PageLoader } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { getMonthStr } from "@/lib/month";
import { cn, formatCurrency } from "@/lib/utils";
import { useSeo } from "@/lib/seo";
import { getApiError } from "@/api/client";
import { AlertCircle, Package, ShoppingBag, TrendingUp, Wallet } from "lucide-react";

/** How a channel is spelled in the database, and how a person reads it. */
const CHANNEL_LABELS: Record<string, string> = {
  COUNTER: "At the counter",
  ONLINE: "Online",
  PICKUP: "Reserved for collection",
};

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  tone,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  subtext?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3 sm:p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p className={cn("text-lg font-bold tabular-nums sm:text-xl", tone)}>{value}</p>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * One row of a split: what it took, what it cost, what was left.
 *
 * Margin is shown only where there is something to divide into. A slice that
 * sold nothing reads as a dash rather than as 0%, which would suggest a shop
 * that sold at cost.
 */
function SliceRow({ label, slice, share }: { label: string; slice: StoreSlice; share: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{formatCurrency(slice.netSales)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-violet-500"
          style={{ width: `${Math.max(0, share * 100)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {slice.orders} {slice.orders === 1 ? "order" : "orders"} · {slice.units}{" "}
        {slice.units === 1 ? "unit" : "units"} · profit{" "}
        <span className={slice.profit >= 0 ? "text-emerald-600" : "text-red-600"}>
          {formatCurrency(slice.profit)}
        </span>
        {slice.marginPercent !== null && ` (${slice.marginPercent}%)`}
        {/* Otherwise this row looks like it contradicts itself: a lot collected,
            little profit, and a healthy margin — all true at once, because the
            margin is taken on the costed part alone. */}
        {slice.uncostedUnits > 0 && (
          <> · {formatCurrency(slice.uncostedSales)} uncosted, not in profit</>
        )}
      </p>
    </div>
  );
}

export default function StoreAnalyticsPage() {
  useSeo({ title: "Store analytics", noIndex: true });

  // The month lives in the URL, so a figure somebody is looking at can be sent
  // to somebody else and still be the same figure.
  const [searchParams, setSearchParams] = useSearchParams();
  const month = searchParams.get("month") ?? getMonthStr(new Date());

  const query = useStoreAnalytics(month);
  const data = query.data;

  const totals = data?.totals;
  const channelScale = React.useMemo(
    () => (data?.byChannel ?? []).reduce((sum, row) => sum + row.netSales, 0),
    [data],
  );
  const buyerScale = (data?.byBuyer.member.netSales ?? 0) + (data?.byBuyer.guest.netSales ?? 0);
  const busiestDay = React.useMemo(() => {
    const days = data?.daily ?? [];
    return days.reduce<(typeof days)[number] | null>(
      (best, row) => (best === null || row.netSales > best.netSales ? row : best),
      null,
    );
  }, [data]);

  if (query.isLoading) return <PageLoader />;

  if (query.isError) {
    return (
      <div className="space-y-4 p-4">
        <EmptyState
          icon={AlertCircle}
          title="Could not load the shop's figures"
          description={getApiError(query.error)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 sm:p-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Store analytics</h1>
        <p className="text-sm text-muted-foreground">
          Product sales only. Membership payments are on the payments screen.
        </p>
      </div>

      <MonthNav month={month} onMonthChange={(next) => setSearchParams({ month: next })} />

      {!totals || totals.orders === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No store sales this month"
          description="Sales rung up at the counter or bought online will show here, with what they cost and what they earned."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <StatCard
              icon={Wallet}
              label="Collected"
              value={formatCurrency(totals.netSales)}
              subtext={`${totals.orders} ${totals.orders === 1 ? "order" : "orders"}`}
            />
            <StatCard
              icon={Package}
              label="Cost of goods"
              value={formatCurrency(totals.cost)}
              subtext={`${totals.units} ${totals.units === 1 ? "unit" : "units"} sold`}
            />
            <StatCard
              icon={TrendingUp}
              label="Gross profit"
              value={formatCurrency(totals.profit)}
              subtext={
                totals.marginPercent !== null ? `${totals.marginPercent}% margin` : "Margin unknown"
              }
              tone={totals.profit >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <StatCard
              icon={ShoppingBag}
              label="Busiest day"
              value={
                busiestDay
                  ? new Date(busiestDay.day).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"
              }
              subtext={busiestDay ? formatCurrency(busiestDay.netSales) : undefined}
            />
          </div>

          {/* Left out, not counted as free: a tub sold before anybody typed in
              what it cost would otherwise read as pure profit. */}
          {totals.uncostedUnits > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {totals.uncostedUnits} {totals.uncostedUnits === 1 ? "unit" : "units"} (
              {formatCurrency(totals.uncostedSales)}) sold with no purchase price on record, so{" "}
              {totals.uncostedUnits === 1 ? "it is" : "they are"} left out of profit and margin. Add
              a purchase price to the product to include its future sales.
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Where it sold</CardTitle>
                <CardDescription className="text-xs">
                  Takings by channel, with what each one earned.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.byChannel.map((row) => (
                  <SliceRow
                    key={row.channel}
                    label={CHANNEL_LABELS[row.channel] ?? row.channel}
                    slice={row}
                    share={channelScale > 0 ? row.netSales / channelScale : 0}
                  />
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Who bought</CardTitle>
                <CardDescription className="text-xs">
                  A shop selling mostly to guests is a shop with a gym attached.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SliceRow
                  label="Members"
                  slice={data.byBuyer.member}
                  share={buyerScale > 0 ? data.byBuyer.member.netSales / buyerScale : 0}
                />
                <SliceRow
                  label="Guests"
                  slice={data.byBuyer.guest}
                  share={buyerScale > 0 ? data.byBuyer.guest.netSales / buyerScale : 0}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What sold</CardTitle>
              <CardDescription className="text-xs">
                Line figures, before basket coupons and coins — those belong to an order rather
                than to any one thing in it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 pr-2 text-left font-medium">Product</th>
                      <th className="px-2 py-2 text-right font-medium">Sold</th>
                      <th className="px-2 py-2 text-right font-medium">Sales</th>
                      <th className="px-2 py-2 text-right font-medium">Cost</th>
                      <th className="py-2 pl-2 text-right font-medium">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.products.map((row) => (
                      <tr key={row.variantId} className="border-b last:border-0">
                        <td className="py-2 pr-2">
                          <p className="font-medium">{row.productName}</p>
                          <p className="text-xs text-muted-foreground">{row.variantName}</p>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{row.units}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatCurrency(row.sales)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {formatCurrency(row.cost)}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums">
                          {/* A dash, not a zero: some of these units sold before
                              anybody recorded what they cost. */}
                          {row.profit === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                row.profit >= 0 ? "text-emerald-600" : "text-red-600"
                              }
                            >
                              {formatCurrency(row.profit)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
