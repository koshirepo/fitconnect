import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { tenantsApi } from "@/api/tenants";
import { paymentsApi } from "@/api/payments";
import { useUIStore } from "@/stores/ui";
import { useMemberReport } from "@/api/queries/members";
import { usePaymentAnalytics } from "@/api/queries/payments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, StatGridSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { cn, formatCompactCurrency, formatCurrency } from "@/lib/utils";
import { dayKey } from "@/lib/day-window";
import { OccupationGlyph } from "@/components/ui/occupation-glyph";
import { getApiError } from "@/api/client";
import { getMonthStr, formatMonthLabel, parseMonth, withMonth } from "@/lib/month";
import { MonthNav } from "@/components/ui/month-nav";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import {
  Users,
  IndianRupee,
  UserPlus,
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  UserCheck,
  Ban,
  Activity,
  CalendarClock,
  Clock3,
  CreditCard,
  ShoppingBag,
  Wallet,
  BadgeIndianRupee,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChartFrame } from "@/components/ui/chart-frame";
import { CHART_COLORS } from "./chart-colors";

/**
 * The charts, fetched only when one is scrolled near.
 *
 * They are ~200KB of this screen — more than the rest of it put together —
 * and the figures a gym opens this page for are all above them. Five lazy
 * handles rather than one component because they sit in five different places
 * in the layout; they all resolve to the same chunk, so the first one to come
 * into view brings the rest with it.
 */
const RevenueTrendChart = React.lazy(() =>
  import("./FinanceCharts").then((m) => ({ default: m.RevenueTrendChart })),
);
const MemberDistributionChart = React.lazy(() =>
  import("./FinanceCharts").then((m) => ({ default: m.MemberDistributionChart })),
);
const RevenueByPeriodChart = React.lazy(() =>
  import("./FinanceCharts").then((m) => ({ default: m.RevenueByPeriodChart })),
);
const PaymentStatusChart = React.lazy(() =>
  import("./FinanceCharts").then((m) => ({ default: m.PaymentStatusChart })),
);
const MemberActivityChart = React.lazy(() =>
  import("./FinanceCharts").then((m) => ({ default: m.MemberActivityChart })),
);

type ReportData = Awaited<ReturnType<typeof tenantsApi.generateReport>>["data"]["data"];
type AnalyticsData = Awaited<ReturnType<typeof paymentsApi.analytics>>["data"]["data"]["analytics"];

// Shared with the chart bundle, and defined outside it so importing the
// palette does not drag recharts back into this chunk.
const COLORS = CHART_COLORS;

/**
 * A rupee figure for a stat tile: abbreviated past a lakh, and spaced.
 *
 * The space after the symbol is this page's own house style. The abbreviation
 * is what keeps the figure inside a tile — two of them share a phone's width,
 * and an all-time revenue of ₹6,52,700 was being cut to "₹6,52,7…".
 */
function formatCompact(amount: number) {
  return formatCompactCurrency(amount).replace("₹", "₹ ");
}

/**
 * The same four windows, as the half-open day bounds the other screens filter by.
 *
 * A figure here has to land on exactly the people it counted, so these follow
 * the rules the analytics query itself uses: today and this week are relative
 * to now whatever month is being read, and the month is the one this page is
 * pointed at. All time carries no bounds at all.
 */
function periodWindows(month: string, now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const startOfMonth = parseMonth(month);
  const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);

  return {
    today: { from: dayKey(startOfDay), to: "" },
    week: { from: dayKey(startOfWeek), to: "" },
    month: { from: dayKey(startOfMonth), to: dayKey(endOfMonth) },
    allTime: { from: "", to: "" },
  };
}

/**
 * A figure that is also the way to the rows behind it.
 *
 * Every number in these tables answers "how many", and the next question is
 * always "which ones" — which until now meant leaving for the roster and
 * rebuilding the filter by hand, from memory, and usually getting a different
 * number back.
 */
function StatLink({
  value,
  label,
  onClick,
  className,
}: {
  value: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "-mx-1 rounded px-1 underline decoration-dotted underline-offset-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {value}
    </button>
  );
}

/**
 * What each period actually covers, spelled out.
 *
 * The four windows on this page — today, this week, the chosen month, all time
 * — were labelled with those words alone and sat next to a chart headed "Last
 * 30 Days", so four different spans of time read as interchangeable. Naming the
 * dates is the whole fix: "This Month" and "March 2026" are the same period,
 * but only one of them can be checked against a bank statement.
 *
 * Today and this week come from the server's clock and are only shown while the
 * month being read is the current one — "revenue today" is not a fact about
 * last October, and putting it beside October's figures invited exactly that
 * reading.
 */
function periodLabels(month: string, now = new Date()) {
  const day = now.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  // Monday-first, matching how the API buckets the week.
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));

  return {
    today: { short: "Today", full: `Today · ${day}` },
    week: {
      short: "This week",
      full: `This week · from ${weekStart.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })}`,
    },
    month: {
      short: parseMonth(month).toLocaleDateString("en-IN", { month: "long" }),
      full: formatMonthLabel(month),
    },
    allTime: { short: "All time", full: "All time" },
  };
}

export default function FinanceReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isMobile } = useUIStore();
  const { can } = usePermissions();
  const canReadBooks = can(Permission.FINANCE_READ);
  const canReadSalary = can(Permission.SALARY_READ);

  const month = searchParams.get("month") || getMonthStr(new Date());
  const isCurrentMonth = month >= getMonthStr(new Date());
  const periods = React.useMemo(() => periodLabels(month), [month]);
  const windows = React.useMemo(() => periodWindows(month), [month]);

  // The four columns the member table reports over, each carrying the window
  // the roster needs to show the same people. Written once because two rows
  // read it, and a period that meant one thing in one row and something else
  // in the other is exactly what this shape rules out.
  const memberPeriods = [
    { key: "today", label: periods.today.short },
    { key: "week", label: periods.week.short },
    { key: "month", label: periods.month.full },
    { key: "allTime", label: periods.allTime.short },
  ] as const;

  /**
   * Open the roster showing the people behind a figure on this page.
   *
   * Every count here spans all roles — a coach is on the gym's books like
   * anyone else — so the link says so rather than landing on the roster's
   * default view of members alone, which would show fewer people than the
   * number that was clicked.
   */
  const goToMembers = React.useCallback(
    (params: Record<string, string>) => {
      const query = new URLSearchParams({ role: "ALL" });
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      navigate(getTenantDashboardPath(`/members?${query.toString()}`));
    },
    [navigate],
  );

  /**
   * Open the ledger on the rows behind a total here, over the same window.
   *
   * The counterpart to `goToMembers`: a figure that counts payment rows leads
   * to the ledger, one that counts people leads to the roster. Two figures on
   * this page are both called "pending" and mean different things, which is
   * exactly why each has to land somewhere different.
   */
  const goToPayments = React.useCallback(
    (params: Record<string, string>) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      const search = query.toString();
      navigate(getTenantDashboardPath(search ? `/payments?${search}` : "/payments"));
    },
    [navigate],
  );

  const reportQuery = useMemberReport();
  const analyticsQuery = usePaymentAnalytics(month);

  // Both payloads are trusted for their shape all over this page, so anything
  // that arrives without its sections is treated as absent. An offline-queued
  // POST resolves to `{}`, which is truthy and would otherwise crash the render
  // on the first nested read.
  const rawReport = (reportQuery.data as ReportData | undefined) ?? null;
  const report = rawReport?.members && rawReport?.finances ? rawReport : null;
  const rawAnalytics = (analyticsQuery.data?.analytics as AnalyticsData | undefined) ?? null;
  const analytics = rawAnalytics?.month && rawAnalytics?.allTime ? rawAnalytics : null;
  const loading = reportQuery.isLoading || analyticsQuery.isLoading;
  const error = reportQuery.isError
    ? getApiError(reportQuery.error)
    : analyticsQuery.isError
      ? getApiError(analyticsQuery.error)
      : "";

  // Four KPI tiles, then the chart row — the same shape the loaded page has.
  if (loading && !report) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <StatGridSkeleton count={4} />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-lg lg:col-span-2" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  // Derived chart data
  const revenueChartData = analytics?.dailyBreakdown.map((d) => {
    const date = new Date(d.day + "T00:00:00");
    return {
      name: `${date.getDate()}/${date.getMonth() + 1}`,
      Revenue: d.revenue,
      Payments: d.count,
    };
  });

  /**
   * What this gym's members do for a living, commonest first.
   *
   * "Not recorded" stays in the list rather than being filtered out: it is the
   * row that says how much of the rest to trust, and hiding it would make a
   * gym that has asked twelve people look like a gym of students.
   */
  const occupationMix = report?.members.occupations ?? [];
  const occupationTotal = occupationMix.reduce((sum, row) => sum + row.members, 0) || 1;

  const memberPieData = report
    ? [
        { name: "Active", value: report.members.active, color: COLORS.green },
        { name: "Suspended", value: report.members.suspended, color: COLORS.yellow },
        {
          name: "Other",
          value: Math.max(
            0,
            report.members.total - report.members.active - report.members.suspended,
          ),
          color: COLORS.muted,
        },
      ].filter((d) => d.value > 0)
    : [];

  const paymentStatusData = analytics
    ? [
        { name: "Completed", value: analytics.month.completed, color: COLORS.green },
        { name: "Pending", value: analytics.month.pending, color: COLORS.yellow },
        { name: "Failed", value: analytics.month.failed, color: COLORS.red },
      ].filter((d) => d.value > 0)
    : [];

  /**
   * Today and this week only belong beside a month that contains them.
   *
   * The server still reports both whatever month is asked for — they are facts
   * about now, not about the month — but showing "revenue today" in a column
   * headed October invites reading it as October's. On a past month the
   * comparison collapses to the month itself, and the card is hidden rather
   * than drawn as a single bar.
   */
  const periodComparisonData =
    analytics && isCurrentMonth
      ? [
          {
            period: periods.today.short,
            Revenue: analytics.today.totalRevenue,
            Payments: analytics.today.totalCount,
          },
          {
            period: periods.week.short,
            Revenue: analytics.week.totalRevenue,
            Payments: analytics.week.totalCount,
          },
          {
            period: periods.month.short,
            Revenue: analytics.month.totalRevenue,
            Payments: analytics.month.totalCount,
          },
        ]
      : [];

  const memberActivityData = analytics
    ? [
        ...(isCurrentMonth
          ? [
              {
                period: periods.today.short,
                Joined: analytics.members.joined.today,
                Deactivated: analytics.members.deactivated.today,
              },
              {
                period: periods.week.short,
                Joined: analytics.members.joined.week,
                Deactivated: analytics.members.deactivated.week,
              },
            ]
          : []),
        {
          period: periods.month.short,
          Joined: analytics.members.joined.month,
          Deactivated: analytics.members.deactivated.month,
        },
        {
          period: periods.allTime.short,
          Joined: analytics.members.joined.allTime,
          Deactivated: analytics.members.deactivated.allTime,
        },
      ]
    : [];

  // These four arrived with the schema-aware sections and are absent from an API
  // deployed before them, so each falls back to zeros rather than taking the
  // page down while the two halves are out of step.
  const zeroBucket = { revenue: 0, count: 0 };
  const zeroGiveaway = { gross: 0, discount: 0, coins: 0, net: 0 };
  const discounts = analytics?.discounts ?? { month: zeroGiveaway, allTime: zeroGiveaway };
  const collection = analytics?.collection ?? { online: zeroBucket, manual: zeroBucket };
  const revenueMix = analytics?.revenueMix ?? {
    subscriptions: zeroBucket,
    charges: zeroBucket,
    store: zeroBucket,
    other: zeroBucket,
  };
  const coinsOutstanding = analytics?.coinsOutstanding ?? 0;
  const activeFreezes = analytics?.activeFreezes ?? 0;

  // This month, by what was being paid for. Zeroed buckets still render so the
  // mix reads as "nothing from charges" rather than silently omitting the row.
  const mixRows = analytics
    ? [
        {
          label: "Memberships",
          revenue: revenueMix.subscriptions.revenue,
          count: revenueMix.subscriptions.count,
          color: COLORS.green,
        },
        {
          label: "One-off charges",
          revenue: revenueMix.charges.revenue,
          count: revenueMix.charges.count,
          color: COLORS.blue,
        },
        // Member and walk-in sales together: the shop, read apart from dues.
        {
          label: "Store sales",
          revenue: revenueMix.store?.revenue ?? 0,
          count: revenueMix.store?.count ?? 0,
          color: COLORS.purple,
          noun: "sale",
        },
        {
          label: "Other",
          revenue: revenueMix.other.revenue,
          count: revenueMix.other.count,
          color: COLORS.muted,
        },
      ]
    : [];
  const mixTotal = mixRows.reduce((sum, r) => sum + r.revenue, 0);
  const givenAwayMonth = analytics ? discounts.month.discount + discounts.month.coins : 0;
  const collectedTotal = analytics ? collection.online.revenue + collection.manual.revenue : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      {/* Stacked on a phone: sharing one row with the buttons squeezed the
          title into three lines and pushed Refresh off the screen. */}
      <PageHeader
        title="Gym Analytics"
        description="Your gym's performance, members, and finances."
        actions={
          <>
            <div className="flex shrink-0 flex-nowrap items-center gap-2">
              {/* This page reports what came in. The books — what went out, and what
                        is left after it — are one click away rather than a sidebar entry
                        of their own, since nobody looks at one without the other. */}
              {canReadBooks && (
                <Button
                  variant="outline"
                  size="sm"
                  // Carries the month, so arriving at the books from October's
                  // analytics opens October rather than resetting to today.
                  onClick={() => navigate(getTenantDashboardPath(withMonth("/expenses", month)))}
                  aria-label="Income and expenses"
                  title="Income and expenses"
                >
                  <Wallet className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Income &amp; expenses</span>
                </Button>
              )}
              {canReadSalary && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(getTenantDashboardPath(withMonth("/salary", month)))}
                  aria-label="Staff salary"
                  title="Staff salary"
                >
                  <BadgeIndianRupee className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Staff salary</span>
                </Button>
              )}
              <Button
                onClick={() => {
                  void reportQuery.refetch();
                  void analyticsQuery.refetch();
                }}
                disabled={loading}
                size="sm"
                aria-label={loading ? "Refreshing analytics" : "Refresh analytics"}
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 sm:mr-2 ${loading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{loading ? "Refreshing…" : "Refresh"}</span>
              </Button>
            </div>
          </>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {/* The month everything below reports on. This page could not be pointed
          at one at all — it described whichever month the server was standing
          in, so "how did October look" was answerable on the books and on
          payroll but not here. */}
      <MonthNav month={month} onMonthChange={(next) => setSearchParams({ month: next })} />

      {report && analytics && (
        <>
          {/* ═══════════════ KPI STAT CARDS ═══════════════ */}
          {/* Six tiles: two per row on a phone, three from `lg` — so both
              layouts fill their last row rather than leaving two stranded. */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
            <StatCard
              icon={Users}
              label="Total Members"
              value={report.members.total}
              subtext={`${report.members.active} active`}
              onClick={() => goToMembers({})}
            />
            {/* Who owes money, and whose term has run out. Both are counts of
                people — the two numbers a desk acts on — and neither was on
                this page, which reported payment rows instead. */}
            <StatCard
              icon={Clock3}
              label="Payment pending"
              value={report.members.withPendingPayment}
              subtext={report.members.withPendingPayment === 1 ? "member owes" : "members owe"}
              color="text-amber-600"
              // The roster, not the ledger: this counts people who owe, and
              // the ledger would answer with a different number — the unpaid
              // rows, of which one member can hold several. Those have their
              // own link, in the payment breakdown below.
              onClick={() => goToMembers({ status: "PENDING" })}
            />
            <StatCard
              icon={CalendarClock}
              label="Membership due"
              value={report.members.pastDue}
              subtext={`past due · ${report.overdue.allowedDays}-day grace`}
              color="text-red-600"
              onClick={() => goToMembers({ status: "DUE" })}
            />
            <StatCard
              icon={IndianRupee}
              label="Revenue · all time"
              value={formatCompact(analytics.allTime.totalRevenue)}
              subtext={`${analytics.allTime.totalCount} payments`}
              color="text-green-600"
              onClick={() => goToPayments({ status: "COMPLETED" })}
            />
            <StatCard
              icon={TrendingUp}
              label={`Revenue · ${periods.month.full}`}
              value={formatCompact(analytics.month.totalRevenue)}
              subtext={`${analytics.month.completed} completed`}
              color="text-green-600"
              onClick={() =>
                goToPayments({
                  status: "COMPLETED",
                  from: windows.month.from,
                  to: windows.month.to,
                })
              }
            />
            {/* "Revenue today" is not a fact about last October, so on a past
                month the fourth tile reports something that month can answer:
                what came over the counter from people with no account. */}
            {isCurrentMonth ? (
              <StatCard
                icon={Activity}
                label={`Revenue · ${periods.today.full}`}
                value={formatCompact(analytics.today.totalRevenue)}
                subtext={`${analytics.today.totalCount} payments`}
                color="text-blue-600"
                onClick={() => goToPayments({ status: "COMPLETED", from: windows.today.from })}
              />
            ) : (
              <StatCard
                icon={ShoppingBag}
                label={`Counter sales · ${periods.month.full}`}
                value={formatCompact(analytics.month.guestRevenue)}
                subtext={`${analytics.month.guestCount} guest sales`}
                color="text-blue-600"
              />
            )}
          </div>

          {/* ═══════════════ THIS MONTH IN DETAIL ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* What was being paid for. Memberships and one-off charges bill on
                different rhythms, so a month that looks flat overall can still
                be a month where dues fell and admissions covered the gap. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Revenue mix</CardTitle>
                <CardDescription className="text-xs">{periods.month.full}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {mixRows.every((r) => r.revenue === 0) ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No completed payments this month yet.
                  </p>
                ) : (
                  mixRows.map((row) => (
                    <div key={row.label} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-semibold tabular-nums">
                          {formatCompact(row.revenue)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${mixTotal > 0 ? (row.revenue / mixTotal) * 100 : 0}%`,
                            backgroundColor: row.color,
                          }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {row.count} {row.count === 1 ? (row.noun ?? "payment") : `${row.noun ?? "payment"}s`}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* List price down to banked. `amount` is already net of both
                giveaways, so this is the only place the gap is visible. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Discounts &amp; coins</CardTitle>
                <CardDescription className="text-xs">{periods.month.full}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">List price</span>
                  <span className="font-medium tabular-nums">
                    {formatCompact(discounts.month.gross)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">Coupon discounts</span>
                  <span className="font-medium tabular-nums text-amber-600">
                    −{formatCompact(discounts.month.discount)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-muted-foreground">Coins redeemed</span>
                  <span className="font-medium tabular-nums text-amber-600">
                    −{formatCompact(discounts.month.coins)}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2 border-t pt-2">
                  <span className="font-medium">Collected</span>
                  <span className="text-lg font-bold tabular-nums text-green-600">
                    {formatCompact(discounts.month.net)}
                  </span>
                </div>
                <p className="pt-1 text-xs text-muted-foreground">
                  {givenAwayMonth > 0
                    ? `${formatCompact(givenAwayMonth)} given away this month · ${formatCompact(
                        discounts.allTime.discount + discounts.allTime.coins,
                      )} all time`
                    : "No coupons or coins used this month."}
                </p>
              </CardContent>
            </Card>

            {/* Cash still moves through most gyms, so knowing the split tells an
                owner how much of the month is sitting in a drawer. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>How it was collected</CardTitle>
                <CardDescription className="text-xs">{periods.month.full}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {collectedTotal === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nothing collected this month yet.
                  </p>
                ) : (
                  <>
                    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full"
                        style={{
                          width: `${(collection.online.revenue / collectedTotal) * 100}%`,
                          backgroundColor: COLORS.blue,
                        }}
                      />
                      <div
                        className="h-full"
                        style={{
                          width: `${(collection.manual.revenue / collectedTotal) * 100}%`,
                          backgroundColor: COLORS.purple,
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Online</span>
                        </div>
                        <p className="text-lg font-bold tabular-nums">
                          {formatCompact(collection.online.revenue)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {collection.online.count} payments
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Cash / manual</span>
                        </div>
                        <p className="text-lg font-bold tabular-nums">
                          {formatCompact(collection.manual.revenue)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {collection.manual.count} payments
                        </p>
                      </div>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Coins outstanding</p>
                    <p className="font-semibold tabular-nums">
                      {coinsOutstanding.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Frozen terms</p>
                    <p className="font-semibold tabular-nums">{activeFreezes}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 2: REVENUE TREND + MEMBER DISTRIBUTION ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Revenue Trend Area Chart (2/3 width) */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle>Revenue trend</CardTitle>
                {/* Was a rolling last-30-days window sitting beside month
                    figures — two different spans presented as one story. */}
                <CardDescription className="text-xs">
                  Day by day · {periods.month.full}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {revenueChartData && revenueChartData.length > 0 ? (
                  <ChartFrame height={isMobile ? 220 : 280}>
                    <RevenueTrendChart data={revenueChartData} isMobile={isMobile} />
                  </ChartFrame>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    No payment data yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Member Distribution Pie Chart (1/3 width) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Member Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {memberPieData.length > 0 ? (
                  <ChartFrame height={280}>
                    <MemberDistributionChart data={memberPieData} />
                  </ChartFrame>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">No members</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 3: PERIOD COMPARISON + PAYMENT STATUS ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Revenue by Period Bar Chart. Hidden on a past month, where the
                only comparable bar left is the month itself. */}
            <Card className={periodComparisonData.length === 0 ? "hidden" : undefined}>
              <CardHeader className="pb-2">
                <CardTitle>Revenue by period</CardTitle>
                <CardDescription className="text-xs">
                  {periods.today.full} · {periods.week.full} · {periods.month.full}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartFrame height={isMobile ? 200 : 250}>
                  <RevenueByPeriodChart data={periodComparisonData} isMobile={isMobile} />
                </ChartFrame>
              </CardContent>
            </Card>

            {/* Payment Status Pie + Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Payment status</CardTitle>
                <CardDescription className="text-xs">{periods.month.full}</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Side by side, the pie was given half a phone's width — about
                    170px including its padding — and the legend the rest.
                    Stacked below `sm`, both get the full column. */}
                {paymentStatusData.length > 0 ? (
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className={isMobile ? "w-full" : "w-1/2"}>
                      <ChartFrame height={isMobile ? 180 : 220}>
                        <PaymentStatusChart data={paymentStatusData} isMobile={isMobile} />
                      </ChartFrame>
                    </div>
                    <div className="w-full flex-1 space-y-3">
                      {paymentStatusData.map((s) => (
                        <div key={s.name} className="flex items-center gap-2.5">
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.value} payments</p>
                          </div>
                        </div>
                      ))}
                      <div className="border-t pt-2">
                        <p className="text-sm font-semibold">
                          Total: {formatCurrency(analytics.month.totalRevenue)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No payments in {periods.month.full}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 3b: WHO TRAINS HERE ═══════════════
              Drawn as bars rather than another pie: this is a ranking, and a
              ranking is read down a list. It also costs no chart library,
              which matters on the heaviest screen in the app. */}
          {occupationMix.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Members by occupation</CardTitle>
                <CardDescription className="text-xs">
                  Active members · tap one to see them
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {occupationMix.map((row) => {
                  const share = Math.round((row.members / occupationTotal) * 100);

                  return (
                    <button
                      key={row.id ?? "unknown"}
                      type="button"
                      disabled={!row.id}
                      onClick={() => row.id && goToMembers({ occupation: row.id })}
                      className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left transition-colors enabled:hover:bg-muted/60 disabled:cursor-default"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <OccupationGlyph icon={row.icon} className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{row.name}</span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {row.members} · {share}%
                          </span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              row.id ? "bg-primary" : "bg-muted-foreground/40",
                            )}
                            style={{ width: `${Math.max(share, 2)}%` }}
                          />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* ═══════════════ ROW 4: MEMBER ACTIVITY BAR CHART ═══════════════ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Member activity</CardTitle>
              <CardDescription className="text-xs">Joined vs deactivated</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartFrame height={260}>
                <MemberActivityChart data={memberActivityData} />
              </ChartFrame>
            </CardContent>
          </Card>

          {/* ═══════════════ ROW 5: DETAILED ANALYTICS TABLE ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Payment Analytics Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Payment breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 font-medium">Period</th>
                        <th className="text-right py-2 font-medium">Revenue</th>
                        <th className="text-right py-2 font-medium">Completed</th>
                        <th className="text-right py-2 font-medium">Pending</th>
                        <th className="text-right py-2 font-medium">Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Each figure opens the ledger on the rows it added up,
                          over the same period — "which payments made up March"
                          is the question this table always raises next. */}
                      {(
                        [
                          { key: "today", label: periods.today.short },
                          { key: "week", label: periods.week.short },
                          { key: "month", label: periods.month.short },
                          { key: "allTime", label: periods.allTime.short },
                        ] as const
                      ).map(({ key, label }) => {
                        const d = analytics[key];
                        const range = { from: windows[key].from, to: windows[key].to };
                        return (
                          <tr key={key} className="border-b last:border-0">
                            <td className="py-2.5 font-medium">{label}</td>
                            {/* Revenue is the sum of the completed rows, so it
                                lands on the same list the count beside it
                                does. */}
                            <td className="text-right py-2.5">
                              <StatLink
                                value={formatCurrency(d.totalRevenue)}
                                label={`Revenue · ${label}`}
                                onClick={() => goToPayments({ status: "COMPLETED", ...range })}
                                className="font-bold text-green-600"
                              />
                            </td>
                            {(
                              [
                                {
                                  status: "COMPLETED",
                                  name: "Completed",
                                  count: d.completed,
                                  tone: "text-green-600",
                                },
                                {
                                  status: "PENDING",
                                  name: "Pending",
                                  count: d.pending,
                                  tone: "text-yellow-600",
                                },
                                {
                                  status: "FAILED",
                                  name: "Failed",
                                  count: d.failed,
                                  tone: "text-red-600",
                                },
                              ] as const
                            ).map(({ status, name, count, tone }) => (
                              <td key={status} className="text-right py-2.5">
                                <StatLink
                                  value={count}
                                  label={`${name} · ${label}`}
                                  onClick={() => goToPayments({ status, ...range })}
                                  className={tone}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Member Analytics Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Member Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 font-medium">Metric</th>
                        <th className="text-right py-2 font-medium">Today</th>
                        <th className="text-right py-2 font-medium">Week</th>
                        <th className="text-right py-2 font-medium">Month</th>
                        <th className="text-right py-2 font-medium">All Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Every figure below opens the roster on the people it
                          counted, carrying the same window it was counting
                          them over — the question after "how many joined in
                          March" is always "who". */}
                      <tr className="border-b">
                        <td className="py-2.5 flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5 text-green-500" />
                          <span className="font-medium">New Members</span>
                        </td>
                        {memberPeriods.map(({ key, label }) => (
                          <td key={key} className="text-right py-2.5">
                            <StatLink
                              value={analytics.members.joined[key]}
                              label={`New members · ${label}`}
                              onClick={() =>
                                goToMembers({
                                  joinedFrom: windows[key].from,
                                  joinedTo: windows[key].to,
                                })
                              }
                              className={cn("font-bold", key !== "allTime" && "text-green-600")}
                            />
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 flex items-center gap-2">
                          <Ban className="h-3.5 w-3.5 text-red-500" />
                          <span className="font-medium">Deactivated</span>
                        </td>
                        {memberPeriods.map(({ key, label }) => (
                          <td key={key} className="text-right py-2.5">
                            <StatLink
                              value={analytics.members.deactivated[key]}
                              label={`Deactivated · ${label}`}
                              onClick={() =>
                                goToMembers({
                                  deactivatedFrom: windows[key].from,
                                  deactivatedTo: windows[key].to,
                                })
                              }
                              className={cn("font-bold", key !== "allTime" && "text-red-600")}
                            />
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b">
                        <td className="flex items-center gap-2 py-2.5">
                          <UserCheck className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          <span className="font-medium">Currently Active</span>
                        </td>
                        <td colSpan={4} className="py-2.5 text-right">
                          <StatLink
                            value={report.members.active}
                            label="Currently active members"
                            onClick={() => goToMembers({ status: "ACTIVE" })}
                            className="text-2xl font-bold text-green-600"
                          />
                        </td>
                      </tr>

                      {/* People, not payment rows. The pending figure elsewhere
                          on this page counts unpaid entries, and a member with
                          three of them is still one person to chase. */}
                      <tr className="border-b">
                        <td className="flex items-center gap-2 py-2.5">
                          <Clock3 className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span className="font-medium">Payment pending</span>
                        </td>
                        <td colSpan={4} className="py-2.5 text-right">
                          <StatLink
                            value={report.members.withPendingPayment}
                            label="Members with a payment pending"
                            onClick={() => goToMembers({ status: "PENDING" })}
                            className="text-2xl font-bold text-amber-600"
                          />
                        </td>
                      </tr>

                      <tr>
                        <td className="flex items-center gap-2 py-2.5">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          <span className="font-medium">Membership due</span>
                        </td>
                        <td colSpan={4} className="py-2.5 text-right">
                          <StatLink
                            value={report.members.pastDue}
                            label="Members whose membership is due"
                            onClick={() => goToMembers({ status: "DUE" })}
                            className="text-2xl font-bold text-red-600"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Pending counts members with at least one unpaid payment. Due counts active
                    members whose term has run out.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 6: OVERDUE ENFORCEMENT ═══════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" /> Overdue Enforcement
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Grace Period: {report.overdue.allowedDays} days
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* These are members the nightly sweep will suspend, not ones it
                  already has. Opening this page used to *perform* the
                  suspension and then report it, so the list read as history
                  when it was actually the page's own side effect. */}
              {report.overdue.awaitingSuspension.length === 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <UserCheck className="h-5 w-5 shrink-0 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    Everyone is within the {report.overdue.allowedDays}-day grace period. Nothing to
                    suspend.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <p className="mb-3 text-sm font-medium text-amber-800 dark:text-amber-200">
                    {report.overdue.awaitingSuspension.length} member
                    {report.overdue.awaitingSuspension.length !== 1 ? "s" : ""} past the{" "}
                    {report.overdue.allowedDays}-day grace period. Tonight's run will deactivate{" "}
                    {report.overdue.awaitingSuspension.length !== 1 ? "them" : "them"} and send a
                    notice — take a payment before then to keep{" "}
                    {report.overdue.awaitingSuspension.length !== 1 ? "them" : "them"} active.
                  </p>
                  <div className="space-y-1.5">
                    {report.overdue.awaitingSuspension.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="-mx-2 flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-amber-800 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900"
                        onClick={() => navigate(`/members/${m.id}`)}
                      >
                        <span className="min-w-0 truncate font-medium">
                          #{m.memberId} — {m.name}
                        </span>
                        <Badge variant="warning" className="shrink-0 text-xs">
                          Due to lapse
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!report && !loading && !error && (
        <div className="text-center py-16">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No analytics to show yet.</p>
        </div>
      )}
    </div>
  );
}
