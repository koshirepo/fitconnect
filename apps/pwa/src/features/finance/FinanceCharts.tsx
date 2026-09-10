/**
 * Documentation: Every chart on the analytics screen, in one lazily-loaded module.
 *
 * - Split out of the page for one reason: recharts is ~200KB of the finance chunk, and the screen's figures — the tiles, the tables, the breakdowns — are useful long before any chart is on screen. Nothing here is imported by the page directly; it reaches these through `React.lazy`, and `ChartFrame` holds the space until a chart is scrolled near.
 * - Because one module is one chunk, all five charts arrive together on the first one that comes into view. That is deliberate: they sit within a screen or two of each other, and five round trips would be worse than one.
 * - The page keeps the data shaping. These take arrays and draw them, so the numbers on the tiles and the numbers in the charts cannot come from two different calculations.
 * - Primary exports: RevenueTrendChart, MemberDistributionChart, RevenueByPeriodChart, PaymentStatusChart, MemberActivityChart.
 */
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "@/components/ui/chart-tooltip";
import { CHART_COLORS } from "./chart-colors";

type Slice = { name: string; value: number; color: string };

/**
 * Rupees on an axis, in the width the screen can spare.
 *
 * Full figures need about 80px of gutter — a fifth of a phone — so a phone
 * gets thousands instead.
 */
function rupeeTick(isMobile: boolean) {
  return (value: unknown) =>
    isMobile
      ? `₹${Math.round(Number(value) / 1000)}k`
      : `₹${Number(value).toLocaleString("en-IN")}`;
}

export function RevenueTrendChart({
  data,
  isMobile,
}: {
  data: { name: string; Revenue: number }[];
  isMobile: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: isMobile ? -18 : 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.green} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        {/* Thirty date labels do not fit across a phone — they overprint into a
            grey smear. Every fifth is legible and still says which end of the
            month you are on. */}
        <XAxis
          dataKey="name"
          tick={{ fontSize: isMobile ? 9 : 11 }}
          interval={isMobile ? 4 : "preserveStartEnd"}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: isMobile ? 9 : 11 }}
          width={isMobile ? 44 : 72}
          tickFormatter={rupeeTick(isMobile)}
          className="text-muted-foreground"
        />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="Revenue"
          stroke={CHART_COLORS.green}
          fill="url(#revenueGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MemberDistributionChart({ data }: { data: Slice[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={55}
          outerRadius={85}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
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
  );
}

export function RevenueByPeriodChart({
  data,
  isMobile,
}: {
  data: { period: string; Revenue: number }[];
  isMobile: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 200 : 250}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: isMobile ? -18 : 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tick={{ fontSize: isMobile ? 10 : 12 }} />
        <YAxis
          tick={{ fontSize: isMobile ? 9 : 11 }}
          width={isMobile ? 44 : 72}
          tickFormatter={rupeeTick(isMobile)}
        />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="Revenue" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentStatusChart({ data, isMobile }: { data: Slice[]; isMobile: boolean }) {
  return (
    <ResponsiveContainer width={isMobile ? "100%" : "50%"} height={isMobile ? 180 : 220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={isMobile ? 34 : 40}
          outerRadius={isMobile ? 58 : 70}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function MemberActivityChart({
  data,
}: {
  data: { period: string; Joined: number; Deactivated: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-xs">{value}</span>}
        />
        <Bar dataKey="Joined" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Deactivated" fill={CHART_COLORS.red} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
