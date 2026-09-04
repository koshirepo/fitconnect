import { tenantsApi } from "@/api/tenants";
import { paymentsApi } from "@/api/payments";
import { useMemberReport } from "@/api/queries/members";
import { usePaymentAnalytics } from "@/api/queries/payments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, StatGridSkeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { formatCurrency } from "@/lib/utils";
import { getApiError } from "@/api/client";
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
  CreditCard,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";

type ReportData = Awaited<ReturnType<typeof tenantsApi.generateReport>>["data"]["data"];
type AnalyticsData = Awaited<ReturnType<typeof paymentsApi.analytics>>["data"]["data"]["analytics"];

const COLORS = {
  green: "#22c55e",
  yellow: "#eab308",
  red: "#ef4444",
  blue: "#3b82f6",
  purple: "#a855f7",
  muted: "#94a3b8",
};

function formatCompact(amount: number) {
  return formatCurrency(amount).replace("₹", "₹ ");
}

export default function FinanceReportsPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canReadBooks = can(Permission.FINANCE_READ);

  const reportQuery = useMemberReport();
  const analyticsQuery = usePaymentAnalytics();

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
      <div className="space-y-6">
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

  const periodComparisonData = analytics
    ? [
        {
          period: "Today",
          Revenue: analytics.today.totalRevenue,
          Payments: analytics.today.totalCount,
        },
        {
          period: "This Week",
          Revenue: analytics.week.totalRevenue,
          Payments: analytics.week.totalCount,
        },
        {
          period: "This Month",
          Revenue: analytics.month.totalRevenue,
          Payments: analytics.month.totalCount,
        },
      ]
    : [];

  const memberActivityData = analytics
    ? [
        {
          period: "Today",
          Joined: analytics.members.joined.today,
          Deactivated: analytics.members.deactivated.today,
        },
        {
          period: "This Week",
          Joined: analytics.members.joined.week,
          Deactivated: analytics.members.deactivated.week,
        },
        {
          period: "This Month",
          Joined: analytics.members.joined.month,
          Deactivated: analytics.members.deactivated.month,
        },
        {
          period: "All Time",
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
        {
          label: "Other",
          revenue: revenueMix.other.revenue,
          count: revenueMix.other.count,
          color: COLORS.muted,
        },
      ]
    : [];
  const mixTotal = mixRows.reduce((sum, r) => sum + r.revenue, 0);
  const givenAwayMonth = analytics
    ? discounts.month.discount + discounts.month.coins
    : 0;
  const collectedTotal = analytics
    ? collection.online.revenue + collection.manual.revenue
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Stacked on a phone: sharing one row with the buttons squeezed the
          title into three lines and pushed Refresh off the screen. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Gym Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Your gym's performance, members, and finances.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 *:flex-1 sm:*:flex-none">
          {/* This page reports what came in. The books — what went out, and what
              is left after it — are one click away rather than a sidebar entry
              of their own, since nobody looks at one without the other. */}
          {canReadBooks && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(getTenantDashboardPath("/expenses"))}
            >
              <Wallet className="mr-2 h-4 w-4" />
              Income &amp; expenses
            </Button>
          )}
          <Button
            onClick={() => {
              void reportQuery.refetch();
              void analyticsQuery.refetch();
            }}
            disabled={loading}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {report && analytics && (
        <>
          {/* ═══════════════ KPI STAT CARDS ═══════════════ */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total Members"
              value={report.members.total}
              subtext={`${report.members.active} active`}
            />
            <StatCard
              icon={IndianRupee}
              label="All-Time Revenue"
              value={formatCompact(analytics.allTime.totalRevenue)}
              subtext={`${analytics.allTime.totalCount} payments`}
              color="text-green-600"
            />
            <StatCard
              icon={TrendingUp}
              label="Revenue This Month"
              value={formatCompact(analytics.month.totalRevenue)}
              subtext={`${analytics.month.completed} completed`}
              color="text-green-600"
            />
            <StatCard
              icon={Activity}
              label="Revenue Today"
              value={formatCompact(analytics.today.totalRevenue)}
              subtext={`${analytics.today.totalCount} payments`}
              color="text-blue-600"
            />
          </div>

          {/* ═══════════════ THIS MONTH IN DETAIL ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* What was being paid for. Memberships and one-off charges bill on
                different rhythms, so a month that looks flat overall can still
                be a month where dues fell and admissions covered the gap. */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue Mix</CardTitle>
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
                        {row.count} {row.count === 1 ? "payment" : "payments"}
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
                <CardTitle className="text-base">Discounts &amp; Coins</CardTitle>
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
                <CardTitle className="text-base">How It Was Collected</CardTitle>
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
                <CardTitle className="text-base">Revenue Trend (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueChartData && revenueChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={revenueChartData}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={COLORS.green} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        className="text-muted-foreground"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                        className="text-muted-foreground"
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="Revenue"
                        stroke={COLORS.green}
                        fill="url(#revenueGradient)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
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
                <CardTitle className="text-base">Member Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {memberPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={memberPieData}
                        cx="50%"
                        cy="45%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {memberPieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} members`, name]} />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => <span className="text-xs">{value}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">No members</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 3: PERIOD COMPARISON + PAYMENT STATUS ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Revenue by Period Bar Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue by Period</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={periodComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="Revenue" fill={COLORS.green} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment Status Pie + Details */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Status (This Month)</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentStatusData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="50%" height={220}>
                      <PieChart>
                        <Pie
                          data={paymentStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {paymentStatusData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3 flex-1">
                      {paymentStatusData.map((s) => (
                        <div key={s.name} className="flex items-center gap-2.5">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.value} payments</p>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t">
                        <p className="text-sm font-semibold">
                          Total: {formatCurrency(analytics.month.totalRevenue)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">
                    No payments this month
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 4: MEMBER ACTIVITY BAR CHART ═══════════════ */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Member Activity (Joined vs Deactivated)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={memberActivityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs">{value}</span>}
                  />
                  <Bar dataKey="Joined" fill={COLORS.green} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Deactivated" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* ═══════════════ ROW 5: DETAILED ANALYTICS TABLE ═══════════════ */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Payment Analytics Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Payment Breakdown</CardTitle>
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
                      {(
                        [
                          { label: "Today", d: analytics.today },
                          { label: "This Week", d: analytics.week },
                          { label: "This Month", d: analytics.month },
                          { label: "All Time", d: analytics.allTime },
                        ] as const
                      ).map(({ label, d }) => (
                        <tr key={label} className="border-b last:border-0">
                          <td className="py-2.5 font-medium">{label}</td>
                          <td className="text-right py-2.5 font-bold text-green-600">
                            {formatCurrency(d.totalRevenue)}
                          </td>
                          <td className="text-right py-2.5 text-green-600">{d.completed}</td>
                          <td className="text-right py-2.5 text-yellow-600">{d.pending}</td>
                          <td className="text-right py-2.5 text-red-600">{d.failed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Member Analytics Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Member Statistics</CardTitle>
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
                      <tr className="border-b">
                        <td className="py-2.5 flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5 text-green-500" />
                          <span className="font-medium">New Members</span>
                        </td>
                        <td className="text-right py-2.5 font-bold text-green-600">
                          {analytics.members.joined.today}
                        </td>
                        <td className="text-right py-2.5 font-bold text-green-600">
                          {analytics.members.joined.week}
                        </td>
                        <td className="text-right py-2.5 font-bold text-green-600">
                          {analytics.members.joined.month}
                        </td>
                        <td className="text-right py-2.5 font-bold">
                          {analytics.members.joined.allTime}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2.5 flex items-center gap-2">
                          <Ban className="h-3.5 w-3.5 text-red-500" />
                          <span className="font-medium">Deactivated</span>
                        </td>
                        <td className="text-right py-2.5 font-bold text-red-600">
                          {analytics.members.deactivated.today}
                        </td>
                        <td className="text-right py-2.5 font-bold text-red-600">
                          {analytics.members.deactivated.week}
                        </td>
                        <td className="text-right py-2.5 font-bold text-red-600">
                          {analytics.members.deactivated.month}
                        </td>
                        <td className="text-right py-2.5 font-bold">
                          {analytics.members.deactivated.allTime}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5 text-green-500" />
                          <span className="font-medium">Currently Active</span>
                        </td>
                        <td
                          colSpan={4}
                          className="text-right py-2.5 font-bold text-2xl text-green-600"
                        >
                          {report.members.active}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ═══════════════ ROW 6: OVERDUE ENFORCEMENT ═══════════════ */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500" /> Overdue Enforcement
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  Grace Period: {report.overdue.allowedDays} days
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {report.overdue.suspended.length === 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <UserCheck className="h-5 w-5 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-200">
                    All members are within the grace period. No suspensions needed.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-3">
                      {report.overdue.suspended.length} member
                      {report.overdue.suspended.length !== 1 ? "s" : ""} suspended for exceeding the{" "}
                      {report.overdue.allowedDays}-day grace period
                    </p>
                    <div className="space-y-1.5">
                      {report.overdue.suspended.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between text-sm text-red-700 dark:text-red-300 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900 rounded px-2 py-1.5 -mx-2 transition-colors"
                          onClick={() => navigate(`/members/${m.id}`)}
                        >
                          <span className="font-medium">
                            #{m.memberId} — {m.name}
                          </span>
                          <Badge variant="destructive" className="text-xs">
                            Suspended
                          </Badge>
                        </div>
                      ))}
                    </div>
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
          <p className="text-muted-foreground">Click Refresh to load analytics.</p>
        </div>
      )}
    </div>
  );
}
