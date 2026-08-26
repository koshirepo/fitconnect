/**
 * Documentation: Themed tooltip for recharts series.
 *
 * - Replaces the library's default tooltip so hover cards inherit the app's
 *   popover surface, border, and type scale instead of recharts' own styling.
 * - Series whose name mentions revenue are formatted as currency; everything
 *   else prints as a plain count, which is the only distinction the charts on
 *   these screens need.
 *
 * Primary exports: ChartTooltip.
 */
import { formatCurrency } from "@/lib/utils";

export type ChartTooltipProps = {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
};

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}:{" "}
          {entry.name.toLowerCase().includes("revenue")
            ? formatCurrency(entry.value)
            : entry.value}
        </p>
      ))}
    </div>
  );
}
