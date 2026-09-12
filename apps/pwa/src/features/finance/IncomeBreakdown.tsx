/**
 * Documentation: Where a month's money came from, and what the store made.
 *
 * - Memberships and the store are two businesses under one roof — one renews, the other restocks — and a single income figure hid which one was carrying the month. The first card splits income by what paid for it, and its rows add back up to the income tile above it.
 * - The second card is the store's profit: what buyers paid, less what those units cost the gym. Both prices come from the order lines, which kept the figures each sale had on the day, so repricing a product later never changes a past month here.
 * - Sales made before a purchase price was recorded are named and left out of profit, rather than counted as having cost nothing.
 * - Primary exports: IncomeBySourceCard, StoreProfitCard.
 */
import type { FinanceSummary, StoreProfitSummary } from "@/api/finance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { ShoppingBag, TrendingUp } from "lucide-react";

/** Income split by source. Renders nothing against an API that predates the split. */
export function IncomeBySourceCard({ income }: { income: FinanceSummary["income"] }) {
  const bySource = income.bySource;
  if (!bySource) return null;

  const rows = [
    { label: "Memberships", bucket: bySource.subscriptions, noun: "payment", tone: "bg-emerald-500" },
    { label: "One-off charges", bucket: bySource.charges, noun: "payment", tone: "bg-sky-500" },
    { label: "Store sales", bucket: bySource.store, noun: "order", tone: "bg-violet-500" },
    { label: "Other", bucket: bySource.other, noun: "payment", tone: "bg-muted-foreground/40" },
  ];

  /**
   * The bars are scaled against every source together, not the income tile.
   *
   * The tile above counts memberships only now that store revenue is reported
   * apart from it — scaling against that would draw the store bar past the end
   * of its track on any gym whose shop out-sells its sign-up desk.
   */
  const scale = rows.reduce((sum, row) => sum + row.bucket.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Income by source
        </CardTitle>
        <CardDescription className="text-xs">
          The whole ledger. The income tile above counts memberships only — the shop reaches the
          bottom line through its profit, not its takings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {scale === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing came in this month yet.
          </p>
        ) : (
          rows.map(({ label, bucket, noun, tone }) => (
            <div key={label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(bucket.amount)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", tone)}
                  style={{ width: `${Math.max(0, (bucket.amount / scale) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {bucket.count} {bucket.count === 1 ? noun : `${noun}s`}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", tone)}>{value}</span>
    </div>
  );
}

/** Collected, less cost of goods, per month and per product. */
export function StoreProfitCard({ store }: { store: StoreProfitSummary }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" />
          Store profit
        </CardTitle>
        <CardDescription className="text-xs">
          Each sale keeps the selling and purchase price it had on the day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {store.orders === 0 ? (
          <p className="py-6 text-center text-muted-foreground">No store sales this month.</p>
        ) : (
          <>
            <div className="space-y-2">
              <Line label="Sales at list price" value={formatCurrency(store.grossSales)} />
              {store.discounts > 0 && (
                <Line
                  label="Coupons & coins"
                  value={`−${formatCurrency(store.discounts)}`}
                  tone="text-amber-600"
                />
              )}
              <Line label="Collected" value={formatCurrency(store.netSales)} />
              <Line
                label="Cost of goods sold"
                value={`−${formatCurrency(store.cost)}`}
                tone="text-red-600"
              />
              <div className="flex items-baseline justify-between gap-2 border-t pt-2">
                <span className="font-medium">Profit</span>
                <span
                  className={cn(
                    "text-lg font-bold tabular-nums",
                    store.profit >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatCurrency(store.profit)}
                  {store.marginPercent !== null && (
                    <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                      {store.marginPercent}%
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Left out, not counted as free: a tub sold before anybody typed
                in what it cost would otherwise read as pure profit. */}
            {store.uncostedUnits > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {store.uncostedUnits} {store.uncostedUnits === 1 ? "unit" : "units"} (
                {formatCurrency(store.uncostedSales)}) sold with no purchase price recorded, so{" "}
                {store.uncostedUnits === 1 ? "it is" : "they are"} left out of profit. Add a
                purchase price to the product to include its future sales.
              </p>
            )}

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
                  {store.products.map((row) => (
                    <tr key={row.variantId} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <p className="font-medium">{row.productName}</p>
                        <p className="text-muted-foreground">{row.variantName}</p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{row.units}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatCurrency(row.sales)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {row.uncostedUnits === row.units ? "—" : formatCurrency(row.cost)}
                      </td>
                      <td
                        className={cn(
                          "py-2 pl-2 text-right font-medium tabular-nums",
                          row.profit === null
                            ? "text-muted-foreground"
                            : row.profit >= 0
                              ? "text-emerald-600"
                              : "text-red-600",
                        )}
                        title={
                          row.profit === null
                            ? "Some units sold with no purchase price recorded"
                            : undefined
                        }
                      >
                        {row.profit === null ? "—" : formatCurrency(row.profit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Per product at list price, before coupons and coins.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
